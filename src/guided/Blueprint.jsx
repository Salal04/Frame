import { useMemo, useState } from 'react'
import { createGemini, QuotaExhausted } from '../engine/gemini.js'
import { blueprint, blueprintFromScript, sceneAdd, sceneText, styleBible } from '../engine/script.js'
import { SOURCE_MODES, normSourceMode } from '../config.js'
import { garbageCollectAssets } from '../session.js'

const freshScene = (s, i) => ({ id: Number.isInteger(s.id) ? s.id : i + 1, heading: s.heading || `Scene ${i + 1}`, idea: s.idea || '', narration: s.narration || '', kind: s.kind || '', locked: false, narrationStatus: 'draft', voice: { status: 'none', fileId: '', duration: 0, timeline: [], take: 0, voice: '', style: '' }, visual: { status: 'none', engine: 'remotion', steps: [], visuals: [], codeFileId: '', version: 1, durationSec: 0, tailSec: .4, clipFileId: '', error: '' }, notes: [], history: [] })
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length

export default function Blueprint({ session, setSession, autosave, global, log }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [note, setNote] = useState(''), [idea, setIdea] = useState('')
  const gem = useMemo(() => { try { return createGemini({ keys: global?.keys?.gemini || [], models: global?.models || {}, rpm: global?.limits?.rpm || 5, maxWait: global?.limits?.max_wait || 240 }) } catch { return null } }, [global])
  const fromText = ['Script', 'Source'].includes(session.inputType), isSource = session.inputType === 'Source'
  const cfg = { ...session.settings, topic: session.title, script: fromText ? session.sourceText || '' : '', source_text: session.sourceText || '', scene_sec: 15, input_type: session.inputType, source_mode: normSourceMode(session.sourceMode), instruction: session.blueprint?.instruction || '' }
  const change = patch => setSession(s => ({ ...s, blueprint: { ...s.blueprint, ...patch } }))
  const generate = async () => { if (!gem && !(fromText && cfg.script.trim() && cfg.input_type !== 'Source')) return setError('Add a Gemini API key in Control room before generating.'); if (fromText && !cfg.script.trim()) return setError('There is no text to split. Paste your text into the video first.')
    const made = session.scenes.filter(x => !x.locked && (x.voice?.fileId || x.visual?.codeFileId)).length; if (made && !confirm(`${made} scene(s) already have a voice or a visual (maybe your own recording). Regenerating replaces them. Continue?`)) return
    setBusy('Generating script and scene plan…'); setError(''); log?.('info', fromText ? 'Script: splitting your text into scenes…' : 'Script: writing the script and scene plan with Gemini…'); setSession(s => ({ ...s, activeStep: { kind: 'blueprint', sceneId: null, params: {}, startedAt: new Date().toISOString() } })); try { const data = fromText ? await blueprintFromScript(gem, cfg, { onProgress: m => { setBusy(m); log?.('info', `Script: ${m}`) } }) : await blueprint(gem, cfg, { onPartial: partial => change({ partial }) }); setBusy('Choosing one look for the whole video…'); log?.('info', 'Script: choosing one look for the whole video…'); const look = await styleBible(gem, cfg, data.scenes); data.plan = { ...(data.plan || {}), look }; setSession(s => { const locked = s.scenes.filter(x => x.locked); const made = data.scenes.map(freshScene); locked.forEach(old => { const i = made.findIndex(x => x.id === old.id); if (i >= 0) made[i] = old }); return { ...s, title: data.title || s.title, scenes: made, blueprint: { ...s.blueprint, status: 'draft', plan: data.plan || {}, partial: data.partial || {} }, activeStep: null } }); log?.('ok', `Script ready: ${data.scenes.length} scenes.`); await autosave.flush(true) } catch (e) { log?.('error', `Script failed: ${e.message}`); setError(e instanceof QuotaExhausted ? `Quota reached. Try again after ${e.resetAt.toLocaleTimeString()}. Your draft is saved.` : e.message); setSession(s => ({ ...s, activeStep: null })) } finally { setBusy('') } }
  const edit = (id, patch) => setSession(s => ({
    ...s,
    blueprint: { ...s.blueprint, status: 'draft' },
    scenes: s.scenes.map(x => {
      if (x.id !== id) return x
      const narrationChanged = 'narration' in patch && patch.narration !== x.narration
      const visualChanged = narrationChanged || ('heading' in patch && patch.heading !== x.heading) || ('idea' in patch && patch.idea !== x.idea)
      return {
        ...x,
        ...patch,
        ...(narrationChanged ? { narrationStatus: 'stale', voice: { ...x.voice, status: x.voice?.fileId ? 'stale' : x.voice?.status } } : {}),
        ...(visualChanged && x.visual?.codeFileId ? { visual: { ...x.visual, status: 'stale' } } : {}),
      }
    }),
  }))
  const move = (i, d) => setSession(s => { const a = [...s.scenes], j = i + d; if (j < 0 || j >= a.length) return s; [a[i], a[j]] = [a[j], a[i]]; return { ...s, scenes: a } })
  const remove = async i => { const scenes = session.scenes.filter((_, k) => k !== i), next = { ...session, scenes, current: scenes.some(x => x.id === session.current) ? session.current : scenes[0]?.id || 1 }; setSession(next); await autosave.flush(true, next); await garbageCollectAssets(session, next) }
  const add = async () => { if (!idea.trim() || !gem) return; setBusy('Adding scene…'); try { const id = Math.max(0, ...session.scenes.map(x => x.id)) + 1, item = await sceneAdd(gem, cfg, session.blueprint.plan, idea, id); setSession(s => ({ ...s, scenes: [...s.scenes, freshScene({ ...item, id }, s.scenes.length)] })); setIdea(''); await autosave.flush(true) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const regenerate = async scene => { if (!gem) return; setBusy(`Regenerating scene ${scene.id}…`); try { const item = await sceneText(gem, cfg, session.blueprint.plan, session.scenes, scene.id, note); edit(scene.id, { ...item, history: [...scene.history, { at: new Date().toISOString(), narration: scene.narration, heading: scene.heading }] }); setNote(''); await autosave.flush(true) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const total = session.scenes.reduce((n, s) => n + words(s.narration), 0), mins = total / (session.settings.language === 'ur' ? 2.3 : 2.5) / 60
  return <div className="panel"><h3>1. Blueprint</h3><p className="hint">Build the script and scene list together. Changes are saved automatically.</p>
    {isSource && <label>What may Frame change in your text?<select value={normSourceMode(session.sourceMode)} onChange={e => setSession(s => ({ ...s, sourceMode: e.target.value }))}>{SOURCE_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><small className="hint">{SOURCE_MODES.find(m => m[0] === normSourceMode(session.sourceMode))[2]} For textbook notes, "Rewrite" or "Use as reference" turns bullets into spoken sentences.</small></label>}
    <label>Title / topic<input value={session.title} onChange={e => setSession(s => ({ ...s, title: e.target.value }))} /></label><label>Whole-script instruction<textarea rows={2} value={session.blueprint.instruction || ''} onChange={e => change({ instruction: e.target.value })} placeholder="Optional guidance for the next generation" /></label>
    <div className="row tight"><button className="cta sm" disabled={!!busy} onClick={generate}>{busy || (session.scenes.length ? (fromText ? 'Split the text again' : 'Regenerate everything') : fromText ? 'Split my text into scenes' : 'Generate script and scenes')}</button>{session.scenes.length > 0 && <button className="ghost sm" onClick={() => { setSession(s => ({ ...s, stage: 'scenes', current: s.scenes[0]?.id || 1, blueprint: { ...s.blueprint, status: 'approved' } })); autosave.flush(true) }}>Approve blueprint</button>}</div>
    {error && <p className="err">{error}</p>}<p className="hint">{session.scenes.length} scenes · {total} words · about {mins.toFixed(1)} min</p>
    {session.scenes.map((s, i) => <div className="panel" key={s.id}><div className="row tight"><b>Scene {i + 1}</b><label className="chk"><input type="checkbox" checked={s.locked} onChange={e => edit(s.id, { locked: e.target.checked })} /> Keep my text</label><button className="ghost sm" disabled={!i} onClick={() => move(i, -1)}>↑</button><button className="ghost sm" disabled={i === session.scenes.length - 1} onClick={() => move(i, 1)}>↓</button><button className="ghost sm danger" onClick={() => remove(i)}>Delete</button></div><label>Heading<input value={s.heading} onChange={e => edit(s.id, { heading: e.target.value })} /></label><label>Idea<input value={s.idea} onChange={e => edit(s.id, { idea: e.target.value })} /></label><label>Narration <small>{words(s.narration)} words</small><textarea rows={4} value={s.narration} onChange={e => edit(s.id, { narration: e.target.value })} /></label><button className="ghost sm" disabled={!!busy || s.locked} onClick={() => regenerate(s)}>Regenerate this scene</button></div>)}
    {session.scenes.length > 0 && <div className="row tight"><input value={idea} onChange={e => setIdea(e.target.value)} placeholder="Idea for an added scene" /><button className="ghost sm" disabled={!idea.trim() || !!busy} onClick={add}>Add scene</button></div>}
    <label>Regeneration note<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. use a simpler example" /></label><details><summary>Story plan</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(session.blueprint.plan, null, 2)}</pre></details>
  </div>
}
