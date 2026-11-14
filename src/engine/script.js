import { LANGS, narrationRules, END_PUNCT } from './prompts.js'
export const fitCounts = (raw, k, n) => { let c = Array.isArray(raw) ? raw.slice(0, k).map(x => Math.max(1, +x || 1)) : []; if (c.length !== k) c = Array(k).fill(1); const total = c.reduce((a, b) => a + b, 0); c = c.map(x => Math.max(1, Math.round(x * n / total))); while (c.reduce((a, b) => a + b, 0) > n && Math.max(...c) > 1) c[c.indexOf(Math.max(...c))]--; while (c.reduce((a, b) => a + b, 0) < n) c[c.indexOf(Math.min(...c))]++; return c }
export const splitSentences = text => String(text || '').trim().split(/(?<=[.!?۔؟…])\s+/).filter(Boolean)
export const problems = (text, words, seen = new Set()) => { const out = [], n = String(text).trim().split(/\s+/).filter(Boolean).length; if (n < .6 * words) out.push(`too short (${n} words; write about ${words})`); if (n > 1.5 * words) out.push(`too long (${n} words; write about ${words})`); if (!END_PUNCT.test(text)) out.push('must end with sentence punctuation'); const w = text.toLowerCase().split(/\s+/), shingles = new Set(w.slice(0, -4).map((_, i) => w.slice(i, i + 5).join(' '))); if (shingles.size && [...shingles].filter(x => seen.has(x)).length / shingles.size > .3) out.push('repeats wording from earlier scenes'); return out }

const wc = s => String(s || '').trim().split(/\s+/).filter(Boolean).length
const wpsOf = cfg => LANGS[cfg.language || 'en']?.wps || 2.5
const extra = cfg => (cfg.instruction ? ` Extra instruction from the author (follow it): ${cfg.instruction}.` : '')

export async function blueprint(gem, cfg, { onPartial, signal, resume } = {}) {
  const target = Math.max(1, Math.round((cfg.minutes || 3) * 60 / (cfg.scene_sec || 15))), words = Math.round((cfg.minutes || 3) * 60 * wpsOf(cfg))
  const prompt = `Create a narrated educational video blueprint as JSON. Topic: ${cfg.topic}. Audience: ${cfg.audience || 'curious beginners'}. Target scenes: ${target}; total words: about ${words}.${extra(cfg)} ${narrationRules(cfg)} For every scene, "idea" must describe something concrete to SHOW (a diagram, an object, a before/after), never "text on screen". The last scene must close the topic. Return {title,plan:{goal,running_example,terms},scenes:[{heading,idea,narration}]}.`
  const out = await gem.json(prompt, { signal, task: 'medium' })
  // keep a little more than the target: cutting the tail used to delete the conclusion of the video
  const scenes = (out.scenes || []).slice(0, Math.ceil(target * 1.5)).map((s, i) => ({ id: i + 1, heading: s.heading || `Scene ${i + 1}`, idea: s.idea || '', narration: s.narration || '' }))
  const value = { ...out, scenes, partial: { complete: true } }; onPartial?.(value); return value
}

// ---------------- "I already have the words": a finished script, notes, or a transcript of a recording ----------------
// Paragraphs -> sentences. A paragraph with no end punctuation (a note, a bullet, a heading line) stays ONE piece, the text is never rewritten here.
const BULLET = /^\s*(?:[-*•▪◦●‣–—]|\d{1,2}[.)])\s+/
export function pieces(text) {
  const paras = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.split('\n').map(l => l.replace(BULLET, '').trim()).filter(Boolean))
  const out = []
  paras.forEach((lines, pi) => { if (!lines.length) return; const joined = lines.length > 1 && lines.every(l => END_PUNCT.test(l) || l.length > 60) ? [lines.join(' ')] : lines; joined.forEach((l, li) => splitSentences(l).forEach((s, si) => out.push({ text: s, para: pi, first: li === 0 && si === 0 }))) })
  return out
}
// pack sentences into scenes of about `target` words. Prefer to break where the author started a new paragraph. Never cut inside a sentence.
export function packScenes(items, target) {
  const scenes = []; let cur = [], n = 0
  const close = () => { if (cur.length) scenes.push(cur.map(x => (END_PUNCT.test(x.text) ? x.text : x.text + '.')).join(' ')); cur = []; n = 0 }   // a note or heading with no full stop gets one, so the voice pauses and the captions can split
  for (const it of items) { const w = wc(it.text); if (cur.length && ((it.first && n >= target * .6) || n + w > target * 1.35)) close(); cur.push(it); n += w }
  close()
  if (scenes.length > 1 && wc(scenes.at(-1)) < target * .35) { const last = scenes.pop(); scenes[scenes.length - 1] += ' ' + last }   // no tiny last scene
  return scenes
}
const MODES = {
  polish: 'Keep the author\'s own words and order. Only clean the text for speaking: remove page numbers, footnote marks, figure captions and running headers, fix typos, split very long sentences. Do not add or remove any fact.',
  rewrite: 'Same facts and same order, new wording written to be HEARD in a friendly teacher\'s voice. Turn bullets and fragments into full spoken sentences. Do not add facts.',
}
const SCENE_JSON = '{scenes:[{heading,idea,narration}]}'
const fallbackHead = (t, i) => { const w = String(t).replace(/[#*_>`]/g, '').trim().split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?۔؟…]+$/, ''); return w || `Scene ${i + 1}` }

// ask for a heading, a picture idea and a visual kind for scenes whose narration is already fixed
async function describe(gem, cfg, narrations) {
  if (!gem) return narrations.map(() => ({}))
  try {
    const out = await gem.json(`You are the art director of an explainer video. For each narrated scene give a short heading (max 6 words, same language as the narration), a concrete picture idea (what to SHOW: a diagram, an object, a before/after, never "text on screen"), and a kind: one of definition, process, comparison, formula, timeline, list, story, example, summary.${extra(cfg)} Return {scenes:[{heading,idea,kind}]} with exactly ${narrations.length} items in the same order.\n${JSON.stringify(narrations.map((n, i) => ({ i, narration: n })))}`, { task: 'light' })
    const a = Array.isArray(out.scenes) ? out.scenes : []
    return narrations.map((_, i) => a[i] || {})
  } catch (e) { if (/quota/i.test(e.message || '')) throw e; return narrations.map(() => ({})) }
}

export async function blueprintFromScript(gem, cfg, { onProgress } = {}) {
  const raw = cfg.script || cfg.source_text || '', asScript = cfg.input_type === 'Script', mode = asScript ? 'as_is' : (['polish', 'rewrite', 'reference', 'custom'].includes(cfg.source_mode) ? cfg.source_mode : 'polish')
  const per = Math.max(30, Math.round((cfg.scene_sec || 15) * wpsOf(cfg)))
  const done = (title, scenes, plan = {}) => ({ title: title || cfg.topic || 'Guided video', plan, scenes: scenes.map((s, i) => ({ id: i + 1, heading: s.heading || fallbackHead(s.narration, i), idea: s.idea || '', kind: s.kind || '', narration: String(s.narration || '').trim() })).filter(s => s.narration), partial: { complete: true } })
  const ownWords = async () => { const parts = packScenes(pieces(raw), per); onProgress?.('Choosing headings and pictures…'); const d = await describe(gem, cfg, parts); return parts.map((narration, i) => ({ narration, ...d[i] })) }

  if (mode === 'as_is' || !gem) return done(cfg.topic, await ownWords())

  if (mode === 'reference' || mode === 'custom') {
    onProgress?.('Reading your text and planning the lesson…')
    const text = raw.split(/\s+/).slice(0, 14000).join(' '), target = Math.max(1, Math.round(((+cfg.minutes || 0) > 0 ? cfg.minutes * 60 * wpsOf(cfg) : Math.min(wc(text) * .8, 2600)) / per))
    const rule = mode === 'custom' ? 'Follow only the author\'s instruction below; the text (if any) is raw material.' : 'Build your own clear lesson from this text. You may reorder, shorten, simplify and add examples, but never add facts the text does not support.'
    const out = await gem.json(`Create a narrated educational video blueprint as JSON from the author's text. ${rule} Audience: ${cfg.audience || 'students'}. About ${target} scenes of about ${per} words each.${extra(cfg)} ${narrationRules(cfg)} Notes and bullet points must become flowing spoken sentences. "idea" = something concrete to SHOW. The last scene closes the topic. Return {title,plan:{goal,running_example,terms},scenes:[{heading,idea,narration}]}.\nTEXT:\n${text}`, { task: 'medium' })
    const scenes = (out.scenes || []).filter(s => s.narration)
    if (scenes.length) return done(out.title, scenes, out.plan || {})
    return done(cfg.topic, await ownWords())
  }

  // polish / rewrite: section by section so a long chapter never overflows one answer, and every section keeps its place in the story
  const items = pieces(raw), sections = []; let cur = [], n = 0
  for (const it of items) { cur.push(it); n += wc(it.text); if (n >= 900) { sections.push(cur); cur = []; n = 0 } }
  if (cur.length) sections.push(cur)
  const scenes = []; let title = ''
  for (let i = 0; i < sections.length; i++) {
    onProgress?.(`${mode === 'rewrite' ? 'Rewriting' : 'Cleaning'} part ${i + 1} of ${sections.length}…`)
    const text = sections[i].map(x => (x.first ? '\n\n' : ' ') + x.text).join('').trim(), count = Math.max(1, Math.round(wc(text) / per))
    try {
      const out = await gem.json(`${MODES[mode]} Then divide it into about ${count} scenes of about ${per} words, breaking only between sentences. This is part ${i + 1} of ${sections.length} of one video${scenes.length ? `; the previous scene was "${scenes.at(-1).heading}"` : ''}.${extra(cfg)} ${narrationRules(cfg)} For each scene give heading (max 6 words), idea (what to SHOW, concrete), kind (definition|process|comparison|formula|timeline|list|story|example|summary) and narration. Return {${i ? '' : 'title,'}scenes:[{heading,idea,kind,narration}]}.\nTEXT:\n${text}`, { task: 'medium' })
      const got = (out.scenes || []).filter(s => s.narration); if (!got.length) throw new Error('empty')
      if (!title && out.title) title = out.title; scenes.push(...got)
    } catch (e) {
      if (/quota/i.test(e.message || '') || e.name === 'QuotaExhausted') throw e
      const parts = packScenes(sections[i], per), d = await describe(gem, cfg, parts); parts.forEach((narration, k) => scenes.push({ narration, ...d[k] }))   // this part falls back to the author's own words
    }
  }
  return done(title, scenes)
}

// one look for the whole video, so scene 1 and scene 20 feel like the same film
export async function styleBible(gem, cfg, scenes) {
  const dflt = { palette: { bg: '#0b1020', fg: '#f4f6ff', accent: '#6ea8ff', accent2: '#ffb454', muted: '#8d97b5' }, font: 'sans', motif: 'soft glowing shapes', mood: 'calm and clear' }
  if (!gem) return dflt
  try {
    const o = await gem.json(`Pick ONE visual identity for an educational video. Topic: ${cfg.topic}. Audience: ${cfg.audience || 'students'}. Scene headings: ${scenes.slice(0, 14).map(s => s.heading).join(' | ')}. Colours must have strong contrast on the background and suit the subject (e.g. warm paper tones for history, deep blue and amber for physics, greens for biology). Return {palette:{bg,fg,accent,accent2,muted} as #rrggbb, font:"sans" or "serif", motif: a short phrase for a recurring decorative shape, mood: 3 words}.`, { task: 'light' })
    const hex = /^#[0-9a-f]{6}$/i, p = {}; for (const k of Object.keys(dflt.palette)) p[k] = hex.test(o?.palette?.[k] || '') ? o.palette[k] : dflt.palette[k]
    return { palette: p, font: o?.font === 'serif' ? 'serif' : 'sans', motif: String(o?.motif || dflt.motif).slice(0, 60), mood: String(o?.mood || dflt.mood).slice(0, 40) }
  } catch { return dflt }
}

export async function sceneText(gem, cfg, plan, scenes, id, note = '', neighbors = []) { const scene = scenes.find(s => s.id === id); if (!scene) throw new Error('Scene not found.'); const out = await gem.json(`Rewrite one scene of a guided video. ${narrationRules(cfg)} Keep its purpose and return {heading,idea,narration}. Plan: ${JSON.stringify(plan)} Scene: ${JSON.stringify({ heading: scene.heading, idea: scene.idea, narration: scene.narration })} Neighbours: ${JSON.stringify(neighbors)} User note: ${note}`, { task: 'medium' }); return { ...scene, ...out, id } }
export async function sceneAdd(gem, cfg, plan, idea, id) { const out = await gem.json(`Add one narrated scene to this video plan. ${narrationRules(cfg)} Return {heading,idea,narration}. Plan: ${JSON.stringify(plan)} Idea: ${idea}`, { task: 'medium' }); return { id, heading: out.heading || `Scene ${id}`, idea: out.idea || idea, narration: out.narration || '' } }
