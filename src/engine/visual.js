import { screenRules } from './prompts.js'
export const WEB_SAFE_RULES = ''
const allowed = new Set(['react', 'remotion', '@remotion/shapes', '@remotion/paths'])
const forbidden = [[/\brequire\s*\(/, 'require() is not allowed'], [/\bimport\s*\(/, 'dynamic import() is not allowed'], [/\beval\s*\(/, 'eval is not allowed'], [/\bnew\s+Function\b|\bFunction\s*\(/, 'Function constructor is not allowed'], [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bnew\s+Worker\b/, 'network and worker APIs are not allowed'], [/\bprocess\.(env|exit|cwd|binding)|child_process|\bfs\s*\./, 'Node APIs are not allowed'], [/localStorage|sessionStorage|indexedDB|document\.cookie|document\.write/, 'browser storage APIs are not allowed'], [/window\.open|window\.location|document\.location|\blocation\.(href|assign|replace)/, 'navigation is not allowed'], [/dangerouslySetInnerHTML|<script|<iframe|<embed|<object/, 'raw HTML or script injection is not allowed'], [/https?:\/\//, 'remote URLs are not allowed'], [/@import|url\(\s*['"]?(?!#)/, 'CSS imports and remote url() are not allowed'], [/\bstaticFile\s*\(|<Img\b|<Audio\b|<Video\b|<OffthreadVideo\b|<Html5/, 'media asset components are not allowed']]
export const validateTsx = code => { if (!String(code || '').trim()) return 'Empty file.'; const scan = String(code).replaceAll('http://www.w3.org/2000/svg', ''), modules = [...scan.matchAll(/\bfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map(m => m[1] || m[2]); for (const m of modules) if (!allowed.has(m)) return `Forbidden import "${m}". Allowed: ${[...allowed].join(', ')}`; for (const [pattern, message] of forbidden) if (pattern.test(scan)) return message; if (!/export\s+default/.test(scan)) return 'Missing `export default` of the Scene component.'; if (!/useCurrentFrame/.test(scan)) return 'The scene must animate with useCurrentFrame().'; return '' }
export const pinSteps = (steps, timeline, duration) => {
  if (!timeline?.length) return steps || []   // no timeline (empty narration): keep the steps as the model gave them instead of crashing
  const groups = {}
  for (const step of steps || []) { let i = Number.isInteger(+step.sentence) ? +step.sentence : timeline.findIndex(s => s.start <= (+step.at_sec || 0) && (+step.at_sec || 0) < s.end); i = i < 0 || i >= timeline.length ? timeline.length - 1 : i; (groups[i] ||= []).push(step) }
  return Object.entries(groups).flatMap(([i, xs]) => { const t = timeline[+i], gap = (t.end - t.start) * .8 / xs.length; return xs.map((s, j) => ({ ...s, sentence: +i, at_sec: +Math.min(t.start + .05 + gap * j, duration - 1).toFixed(2), max_run: +Math.max(.4, Math.min(1.2, gap)).toFixed(2) })) })
}

const KINDS = 'definition, process, comparison, formula, timeline, list, story, example, summary'
const lookText = cfg => (cfg.look?.palette ? `SHARED LOOK for the whole video (use exactly these colours, so every scene matches): ${JSON.stringify(cfg.look)}.` : '')
// what the model needs to know about a scene: the words, the real timing of each sentence, nothing else
const brief = scene => ({ heading: scene.heading, idea: scene.idea, kind: scene.kind || undefined, narration: scene.narration, seconds: +(scene.voice?.duration || scene.durationSec || 0).toFixed(2), sentences: (scene.voice?.timeline || scene.timeline || []).map(t => ({ i: t.i, start: t.start, end: t.end, text: t.text })) })

export async function visualPlan(gem, cfg, scene, { signal } = {}) {
  const analysis = await gem.json(`You are the art director of an explainer video. Plan the on-screen motion for ONE narrated scene.
Return JSON: {kind (one of ${KINDS}), big_idea (the one thing the viewer must remember, one sentence), metaphor (a concrete picture or diagram that explains it, never a bullet list), concepts[], key_points[], visuals:[{id,type,description}], steps:[{sentence,action}]}.
Rules: SHOW the idea with shapes, arrows, objects, a worked example or a before/after instead of writing it. At most 12 words of text on screen at any moment. Give every spoken sentence at least one step, and reveal each thing exactly when the narrator says it ("sentence" is the sentence index from the timeline). ${lookText(cfg)} ${screenRules(cfg)}
SCENE:\n${JSON.stringify(brief(scene))}`, { task: 'medium', signal })
  return { ...analysis, steps: pinSteps(analysis.steps, scene.voice?.timeline || scene.timeline || [], scene.voice?.duration || scene.durationSec || 1) }
}

// The full instruction text for writing one scene. Used by the in-app generator AND by "Create with another AI" (same rules, so both give scenes that run).
export const buildCodePrompt = (cfg, spec, { note = '', previous = '' } = {}) => {
  const rtl = cfg.screen_language === 'ur'
  return `Write ONE complete Remotion TSX scene (export default function Scene()). Imports allowed only from react, remotion, @remotion/shapes, @remotion/paths. Use useCurrentFrame() and useVideoConfig(); no props, no images, no audio, no network, no external fonts.
CRAFT RULES
- Size everything from useVideoConfig() width/height so it works in 16:9, 9:16, 1:1 and 4:5. Keep a 6% safe margin, and keep the bottom 18% EMPTY: the video adds captions there.
- Fill the frame with ONE clear picture built from inline SVG and shapes (a diagram, an object, a worked example), not a slide of bullet points. Text is short labels only, at least 4.5% of the frame height, high contrast.
- Time it to the voice: each step has at_sec; convert with Math.round(at_sec * fps) and reveal that element with spring() or interpolate(..., {extrapolateLeft:'clamp', extrapolateRight:'clamp'}). Things appear as they are SPOKEN, never before. Stagger related items by 4 to 8 frames.
- The picture must never freeze: add gentle ambient motion (slow drift, a pulse on the item being discussed). Draw lines and arrows with strokeDasharray / strokeDashoffset. Dim earlier items a little when a new one arrives so the eye follows the narrator.
- Layout by kind: definition = the term large plus a metaphor drawing; process = numbered nodes joined by drawn arrows; comparison = split screen with a shared axis; formula = build the equation piece by piece with colour-coded variables, then plug in a real number; timeline = a line with milestones; list = at most 4 cards with simple icons; story/example = a small illustrated scene made of shapes; summary = recap in 3 icons.
- ${rtl ? 'Screen text is Urdu: dir="rtl", fontFamily \'Noto Naskh Arabic\', serif, lineHeight 1.7, and mirror the reading order of diagrams right-to-left.' : 'Use a clean system font stack.'} ${lookText(cfg)} ${screenRules(cfg)} ${WEB_SAFE_RULES}
- Return only the code in one tsx block.
SCENE SPEC: ${JSON.stringify(spec)}
${note ? `Instruction: ${note}\n` : ''}${previous ? `Previous code to improve:\n${previous}` : ''}`
}

export async function genCode(gem, cfg, spec, { note = '', previous = '', signal } = {}) {
  const prompt = buildCodePrompt(cfg, spec, { note, previous })
  const code = await gem.code(prompt, { signal }); const error = validateTsx(code); if (error) throw new Error(`Generated scene rejected: ${error}`); return code
}
export const repairCode = (gem, cfg, spec, code, error, opt = {}) => genCode(gem, cfg, spec, { ...opt, previous: code, note: `Fix this error: ${error}` })
