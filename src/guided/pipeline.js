// All the "do something to a scene" operations, written so they are safe to run in the background and in parallel:
//   - every change goes through commit(), which always starts from the NEWEST session (no stale snapshots overwriting each other)
//   - the same job (scene + kind) can only run once at a time; asking again returns the job that is already running
//   - voices for the next few scenes are generated together in the background while you work on the current one
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createGemini, QuotaExhausted } from '../engine/gemini.js'
import { speak } from '../engine/voice.js'
import { genCode, visualPlan, validateTsx } from '../engine/visual.js'
import { fetchAsset, uploadAsset, garbageCollectAssets } from '../session.js'
import { decode, alignTimeline } from './audio.js'
import { pad, staleVisual } from './model.js'
import { sendToBackend, canSend } from './render.js'
import { hintFor } from './log.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const TRANSIENT = /429|quota|rate|resource|exhaust|overload|unavailable|503|timeout|network|fetch/i
const uniq = a => a.filter((x, i) => a.findIndex(y => y.fileId === x.fileId) === i)
export const LOOKAHEAD = 3   // how many scenes get their voice generated at the same time

export function usePipeline({ session, setSession, autosave, global, folders, playlist, row, project, onRow }) {
  const live = useRef({}); live.current = { setSession, autosave, global, folders, playlist, row, project, onRow }
  // ---- activity log: every step, kept in this browser (shown in the Activity log panel) ----
  const logKey = () => `frame-log:${live.current.playlist?.folderId || ''}:${live.current.row?.row ?? ''}`
  const [logs, setLogs] = useState(() => { try { return JSON.parse(localStorage.getItem(`frame-log:${playlist?.folderId || ''}:${row?.row ?? ''}`) || '[]') } catch { return [] } })
  const logRef = useRef(logs)
  const log = useCallback((level, msg, scene) => {
    const now = Date.now(), text = String(msg || '').replace(/\s+/g, ' ').slice(0, 500)
    if (logRef.current.slice(-8).some(x => x.level === level && x.msg === text && x.scene === scene && now - x.t < 60000)) return   // the same line twice in a row is noise
    const next = [...logRef.current.slice(-299), { t: now, level, msg: text, scene }]; logRef.current = next; setLogs(next)
    try { localStorage.setItem(logKey(), JSON.stringify(next.slice(-150))) } catch { /* private mode: the log just stays in memory */ }
  }, [])
  const clearLogs = useCallback(() => { logRef.current = []; setLogs([]); try { localStorage.removeItem(logKey()) } catch { /* ignore */ } }, [])
  useEffect(() => {
    const off = () => log('error', 'The internet connection was lost. Running steps will fail or wait. They carry on when it is back.'), on = () => log('ok', 'The internet connection is back. If a step failed, retry it or press Resume.')
    addEventListener('offline', off); addEventListener('online', on); log('info', navigator.onLine === false ? 'Studio opened (no internet right now).' : 'Studio opened.')
    return () => { removeEventListener('offline', off); removeEventListener('online', on) }
  }, [])
  const sRef = useRef(session); sRef.current = session
  const inflight = useRef(new Map()), failedVoice = useRef(new Set()), stopAuto = useRef(false), autoLock = useRef(false)
  const [jobs, setJobs] = useState({}), [errors, setErrors] = useState({}), [auto, setAuto] = useState({ running: false, msg: '', failed: [] })

  const commit = useCallback(fn => { const prev = sRef.current, next = typeof fn === 'function' ? fn(prev) : fn; if (next === prev) return prev; sRef.current = next; live.current.setSession(next); return next }, [])
  const patch = useCallback((id, fn) => commit(s => ({ ...s, scenes: s.scenes.map(x => (x.id === id ? fn(x) : x)) })), [commit])
  const scene = id => sRef.current.scenes.find(x => x.id === id)
  const saveNow = useCallback(() => live.current.autosave.flush(true, sRef.current).then(() => log('ok', 'Saved to Drive.')).catch(e => { log('error', `Could not save to Drive: ${e?.message || e}`); const h = hintFor(e?.message); if (h) log('warn', h) }), [log])
  const look = () => ({ ...sRef.current.settings, look: sRef.current.blueprint?.plan?.look })   // the shared look is passed to every visual prompt
  const gem = useMemo(() => { try { const g = global || {}; return createGemini({ keys: g.keys?.gemini || [], models: g.models || {}, rpm: g.limits?.rpm || 5, maxWait: g.limits?.max_wait || 240, onEvent: (level, msg) => log(level, msg) }) } catch { return null } }, [global])
  const needGem = () => { if (!gem) throw new Error('Add a Gemini API key in Control room first.'); return gem }

  // run one job per (scene, kind); show it in the UI; remember its error
  const track = (id, kind, label, fn) => {
    const key = `${id}:${kind}`
    if (inflight.current.has(key)) return inflight.current.get(key)
    setJobs(j => ({ ...j, [key]: label })); setErrors(e => { const { [key]: _, ...rest } = e; return rest })
    const p = (async () => { const t0 = Date.now(), name = kind === 'voice' ? 'Voice' : 'Visual'; log('info', label, id); try { const r = await fn(); log('ok', `${name} finished in ${Math.round((Date.now() - t0) / 1000)} s.`, id); return r } catch (e) { log('error', `${name} failed: ${e.message || e}`, id); const h = hintFor(e.message); if (h) log('warn', h, id); setErrors(x => ({ ...x, [key]: e.message || String(e) })); throw e } finally { inflight.current.delete(key); setJobs(j => { const { [key]: _, ...rest } = j; return rest }) } })()
    inflight.current.set(key, p); return p
  }

  // ---------------- voice ----------------
  const voiceHistory = x => { const prior = x.voice?.fileId ? { type: 'voice-take', ...x.voice } : null; const takes = uniq([...(x.history || []).filter(h => h.type === 'voice-take'), ...(prior ? [prior] : [])]).slice(-4); return [...(x.history || []).filter(h => h.type !== 'voice-take'), ...takes] }
  // store a finished audio take (AI, recorded or uploaded) for a scene
  const attachVoice = async (id, { blob, duration, timeline, source = 'ai', voice, style }) => {
    const cur = scene(id); if (!cur) throw new Error('This scene was deleted while its voice was saving.'); log('info', 'Uploading the voice to Drive…', id); const take = (cur.voice?.take || 0) + 1, asset = await uploadAsset(live.current.folders, 'audio', `scene_${pad(id)}_take_${take}.wav`, blob), before = sRef.current
    const next = patch(id, x => ({ ...x, narrationStatus: 'draft', history: voiceHistory(x), visual: staleVisual(x.visual), voice: { ...x.voice, status: 'draft', fileId: asset.fileId, name: asset.name, duration, timeline, take, source, ...(voice ? { voice } : {}), ...(style !== undefined ? { style } : {}) } }))
    await saveNow(); garbageCollectAssets(before, next).catch(() => {})
  }
  const genVoice = (id, opts = {}) => track(id, 'voice', 'Generating voice…', async () => {
    if (!opts.background) failedVoice.current.delete(id)
    try {
    const cur = scene(id), st = sRef.current.settings, g = live.current.global || {}
    if (!cur?.narration?.trim()) throw new Error('This scene has no narration yet.')
    const voice = opts.voice || cur.voice?.voice || st.voice || 'Charon', baseStyle = opts.style ?? cur.voice?.style ?? st.tts_style ?? 'calm, clear and friendly', style = [baseStyle, opts.note].filter(Boolean).join(', ')
    let out
    for (let attempt = 0; ; attempt++) {
      try { out = await speak({ keys: g.keys?.tts?.length ? g.keys.tts : g.keys?.gemini || [], models: g.models?.tts || [], voice, style, text: cur.narration }); break }
      catch (e) { if (attempt >= 2 || !TRANSIENT.test(e.message || '')) throw e; log('warn', `Voice: temporary problem (${e.message}). Trying again in ${4 * (attempt + 1)} s (try ${attempt + 2} of 3).`, id); await sleep(4000 * (attempt + 1)) }
    }
    const buf = await decode(out.wav), timeline = alignTimeline(buf.getChannelData(0), buf.sampleRate, cur.narration, out.duration)
    await attachVoice(id, { blob: out.wav, duration: out.duration, timeline, source: 'ai', voice, style: baseStyle })
    } catch (e) { failedVoice.current.add(id); throw e }
  })
  const useTake = async (id, item) => { const before = sRef.current; const next = patch(id, x => { const old = x.voice?.fileId && x.voice.fileId !== item.fileId ? { type: 'voice-take', ...x.voice } : null; const takes = uniq([...(x.history || []).filter(h => h.type === 'voice-take' && h.fileId !== item.fileId), ...(old ? [old] : [])]).slice(-4); return { ...x, history: [...(x.history || []).filter(h => h.type !== 'voice-take'), ...takes], visual: staleVisual(x.visual), voice: { ...x.voice, ...item, type: undefined, status: 'draft' } } }); await saveNow(); garbageCollectAssets(before, next).catch(() => {}) }
  const approveVoice = id => patch(id, x => (x.voice?.fileId ? { ...x, voice: { ...x.voice, status: 'approved' } } : x))
  const prefetchVoices = (from = 0, force = false) => { const s = sRef.current; if ((s.settings.voiceMode || 'ai') === 'mine') return; if (!force && s.settings.bgVoices === false) return; s.scenes.slice(from, from + LOOKAHEAD).forEach(x => { if (!x.voice?.fileId && x.narration?.trim() && !failedVoice.current.has(x.id) && !inflight.current.has(`${x.id}:voice`)) genVoice(x.id, { background: true }).catch(() => {}) }) }

  // ---------------- visual ----------------
  const compileCheck = async code => { try { const { transform } = await import('sucrase'); transform(code, { transforms: ['typescript', 'jsx', 'imports'], production: true }); return '' } catch (e) { return `Syntax error: ${e.message}` } }
  const saveVisualCode = async (id, code, { engine = 'remotion', sourceName = '' } = {}) => {
    const bad = validateTsx(code); if (bad) throw new Error(bad)
    const cur = scene(id), before = sRef.current, previous = cur.visual?.codeFileId ? { type: 'visual-code', fileId: cur.visual.codeFileId, version: cur.visual.version || 1, name: cur.visual.codeName || `scene_${id}.tsx` } : null
    const version = (cur.visual?.version || 0) + 1, ext = (sourceName.match(/\.(tsx|ts|jsx|js)$/i) || [])[0] || '.tsx'
    const asset = await uploadAsset(live.current.folders, 'code', `scene_${pad(id)}.v${version}${ext}`, new Blob([code], { type: 'text/plain' }))
    const next = patch(id, x => { const entries = uniq([...(x.history || []).filter(h => h.type === 'visual-code'), ...(previous ? [previous] : []), { type: 'visual-code', fileId: asset.fileId, version, name: asset.name }]).slice(-10); return { ...x, history: [...(x.history || []).filter(h => h.type !== 'visual-code'), ...entries], visual: { ...x.visual, status: 'draft', engine, codeFileId: asset.fileId, codeName: sourceName || asset.name, version, durationSec: (x.voice?.duration || 0) + (x.visual?.tailSec ?? .4), error: '' } } })
    await saveNow(); garbageCollectAssets(before, next).catch(() => {}); return asset
  }
  const loadCode = async id => { const f = scene(id)?.visual?.codeFileId; return f ? (await fetchAsset(f)).text() : '' }
  // plan + write + check (+ repair) one scene's animation, timed to its voice
  const genVisual = (id, { note = '', mode = 'fresh', replan = true } = {}) => track(id, 'visual', mode === 'improve' ? 'Improving visual…' : 'Designing visual…', async () => {
    const g = needGem(), cur = scene(id), st = look()
    if (!cur?.voice?.fileId) throw new Error('Make the voice first: the visual is timed to it.')
    let working = cur
    if (replan || !cur.visual?.steps?.length) { log('info', 'Planning the animation steps…', id); const spec = await visualPlan(g, st, cur); working = { ...cur, visual: { ...cur.visual, status: 'draft', steps: spec.steps || [], visuals: spec.visuals || [], bigIdea: spec.big_idea || '', metaphor: spec.metaphor || '' } }; patch(id, x => ({ ...x, visual: working.visual })) }
    const previous = mode === 'improve' ? await loadCode(id) : ''
    let n = note, code = '', last
    for (let attempt = 0; attempt < 3; attempt++) {
      log('info', `Writing the animation code (try ${attempt + 1} of 3)…`, id)
      try { code = await genCode(g, st, { ...working, ...working.visual }, { note: n, previous }); const syn = await compileCheck(code); if (syn) throw new Error(syn); last = null; break }
      catch (e) { last = e; if (e instanceof QuotaExhausted) throw e; log('warn', `Try ${attempt + 1} did not work: ${e.message}`, id); n = `${note} The previous attempt failed: ${e.message}. Keep to the allowed imports and plain Remotion APIs.`; code = '' }
    }
    if (!code) throw last || new Error('Could not write a working visual.')
    if (note) patch(id, x => ({ ...x, notes: [...(x.notes || []), { kind: 'visual', text: note, at: new Date().toISOString() }] }))
    await saveVisualCode(id, code)
  })
  const fixVisual = (id, error) => track(id, 'visual', 'Fixing visual…', async () => { const g = needGem(), code = await loadCode(id), cur = scene(id); const out = await genCode(g, look(), { ...cur, ...cur.visual }, { previous: code, note: `Fix this error: ${error}` }); await saveVisualCode(id, out) })
  const approveVisual = id => patch(id, x => (x.visual?.codeFileId ? { ...x, visual: { ...x.visual, status: 'approved', error: '' } } : x))
  const approveScene = id => { approveVoice(id); approveVisual(id); commit(s => (s.redoQueue?.sceneId === id ? { ...s, redoQueue: null } : s)); saveNow() }

  // ---------------- continuous build ----------------
  const runAuto = async () => {
    if (autoLock.current) return
    autoLock.current = true; stopAuto.current = false
    log('info', `Continuous build started: ${sRef.current.scenes.filter(x => !isDone(x)).length} of ${sRef.current.scenes.length} scenes to build.`)
    const failed = new Set(), waiting = new Set(), tries = {}; let sendAfter = false
    commit(s => ({ ...s, auto: { ...(s.auto || {}), on: true } }))
    try {
      while (!stopAuto.current) {
        const s = sRef.current, idx = s.scenes.findIndex(x => !failed.has(x.id) && !waiting.has(x.id) && !(isDone(x))), n = s.scenes.length
        if (idx < 0) break
        const sc = s.scenes[idx], mine = (s.settings.voiceMode || 'ai') === 'mine', tag = `Scene ${idx + 1} of ${n}`
        prefetchVoices(idx)
        log('info', `── ${tag}: ${sc.heading || ''}`, sc.id)
        try {
          if (!sc.narration?.trim()) { log('warn', `${tag} has no narration, skipped.`, sc.id); failed.add(sc.id); continue }
          if (!sc.voice?.fileId || sc.narrationStatus === 'stale' || sc.voice.status === 'stale') {
            if (mine) { log('warn', `${tag}: waiting for your recording, moving on to the next scene.`, sc.id); waiting.add(sc.id); continue }   // your own voice: skip it for now and keep building the other scenes
            setAuto({ running: true, msg: `${tag}: making the voice…`, failed: [...failed] }); await genVoice(sc.id)
          }
          approveVoice(sc.id)
          const vis = scene(sc.id).visual; if (!vis?.codeFileId || vis.status === 'stale') { setAuto({ running: true, msg: `${tag}: designing the visual…`, failed: [...failed] }); await genVisual(sc.id) }
          approveVisual(sc.id); await saveNow(); log('ok', `${tag} is ready and approved.`, sc.id)
        } catch (e) {
          if (e instanceof QuotaExhausted || /quota|429|resource.?exhaust/i.test(e.message || '')) { log('error', `Gemini quota reached. Your work is saved. Press Resume${e.resetAt ? ` after ${e.resetAt.toLocaleTimeString()}` : ' in a little while'}.`); setAuto({ running: false, msg: `Gemini quota reached. Your work is saved. Press Resume${e.resetAt ? ` after ${e.resetAt.toLocaleTimeString()}` : ' in a little while'}.`, failed: [...failed] }); stopAuto.current = true; break }
          tries[sc.id] = (tries[sc.id] || 0) + 1
          log('warn', `${tag} stopped with an error: ${e.message}. ${tries[sc.id] >= 2 ? 'Marked red, moving on.' : 'Trying once more in 3 s.'}`, sc.id)
          if (tries[sc.id] >= 2) failed.add(sc.id); else await sleep(3000)
        }
      }
      const need = [...waiting].map(id => sRef.current.scenes.findIndex(x => x.id === id) + 1).sort((a, b) => a - b)
      sendAfter = !stopAuto.current && !failed.size && !waiting.size && sRef.current.auto?.send && canSend(sRef.current)
      if (!stopAuto.current) setAuto({ running: false, msg: waiting.size ? `Built everything that has a voice. Waiting for your recording of scene ${need.join(', ')}. Record ${need.length > 1 ? 'them' : 'it'}, then press Resume.` : failed.size ? `Finished. ${failed.size} scene(s) need your attention (marked red on the timeline).` : 'All scenes are built.', failed: [...failed] })
      else setAuto(a => ({ ...a, running: false }))
      log(stopAuto.current || failed.size || waiting.size ? 'warn' : 'ok', stopAuto.current ? 'Build stopped. Press Resume to continue.' : waiting.size ? `Finished. Waiting for your recording of scene ${need.join(', ')}.` : failed.size ? `Finished with ${failed.size} scene(s) that need attention (red on the timeline).` : 'All scenes are built.')
      commit(s => ({ ...s, auto: { ...(s.auto || {}), on: false } })); await saveNow()
      if (sendAfter) await sendNow()
    } finally { autoLock.current = false }
  }
  const pauseAuto = () => { log('info', 'Pause pressed: stopping after the current step.'); stopAuto.current = true; setAuto(a => ({ ...a, msg: 'Stopping after the current step…' })) }
  const isDone = x => x.narrationStatus !== 'stale' && x.voice?.status === 'approved' && x.visual?.status === 'approved'
  const sendNow = async () => {
    const l = live.current
    log('info', 'Sending the Render Map to the backend…'); setAuto(a => ({ ...a, running: true, msg: 'Sending to the backend…' }))
    try { const { submitted, renderMap, fileIds } = await sendToBackend({ session: sRef.current, playlist: l.playlist, row: l.row, project: l.project, global: l.global, onStep: m => log('info', m) }); commit(s => ({ ...s, stage: 'finish', submittedMaps: [...(s.submittedMaps || []), { at: renderMap.createdAt, fileIds }], backend: { status: 'Waiting', notes: '', submittedAt: renderMap.createdAt } })); l.onRow?.(submitted); await saveNow(); setAuto(a => ({ ...a, running: false, msg: 'Built and sent to the backend.' })); log('ok', 'Sent to the backend. Status: Waiting.') }
    catch (e) { log('error', `Sending failed: ${e.message}`); const h = hintFor(e.message); if (h) log('warn', h); setAuto(a => ({ ...a, running: false, msg: `Built, but sending failed: ${e.message}` })) }
  }

  return { logs, log, clearLogs, gem, commit, patch, sRef, jobs, errors, auto, busy: Object.keys(jobs).length > 0, genVoice, attachVoice, useTake, approveVoice, genVisual, fixVisual, saveVisualCode, loadCode, approveVisual, approveScene, prefetchVoices, runAuto, pauseAuto, saveNow, sendNow, isDone }
}
