import { useEffect, useMemo, useRef, useState } from 'react'
import { createGemini } from '../engine/gemini.js'
import { genCode, repairCode, validateTsx, visualPlan } from '../engine/visual.js'
import { fetchAsset, garbageCollectAssets, uploadAsset } from '../session.js'

const current = s => s.scenes.find(x => x.id === s.current) || s.scenes[0]
const sizeOf = aspect => ({ '16:9': [640, 360], '9:16': [360, 640], '1:1': [480, 480], '4:5': [384, 480] }[aspect] || [640, 360])
const sceneExt = /\.(tsx|ts|jsx|js)$/i
const fileText = file => file.text()

async function sceneFromZip(file) {
  if (file.size > 2_000_000) throw new Error('The scene ZIP must be smaller than 2 MB.')
  const bytes = await file.arrayBuffer(), view = new DataView(bytes), sig = 0x06054b50
  let end = -1
  for (let i = Math.max(0, bytes.byteLength - 65557); i <= bytes.byteLength - 22; i++) if (view.getUint32(i, true) === sig) { end = i; break }
  if (end < 0) throw new Error('This is not a valid ZIP file.')
  const count = view.getUint16(end + 10, true), central = view.getUint32(end + 16, true), entries = []
  let offset = central
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The ZIP directory is invalid.')
    const method = view.getUint16(offset + 10, true), packed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true), nameLen = view.getUint16(offset + 28, true), extraLen = view.getUint16(offset + 30, true), commentLen = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(new Uint8Array(bytes, offset + 46, nameLen)); offset += 46 + nameLen + extraLen + commentLen
    if (!name.endsWith('/') && sceneExt.test(name)) entries.push({ name, method, packed, size, local })
  }
  if (entries.length !== 1) throw new Error('The ZIP must contain exactly one .tsx, .ts, .jsx, or .js scene file.')
  const entry = entries[0]; if (entry.size > 2_000_000) throw new Error('The scene file inside the ZIP is larger than 2 MB.')
  if (view.getUint32(entry.local, true) !== 0x04034b50) throw new Error('The ZIP scene entry is invalid.')
  const dataAt = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true), packed = bytes.slice(dataAt, dataAt + entry.packed)
  let raw
  if (entry.method === 0) raw = packed
  else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') raw = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()
  else throw new Error('This ZIP compression method is not supported by this browser.')
  if (raw.byteLength !== entry.size) throw new Error('The ZIP scene file size did not match its directory.')
  return { name: entry.name.split(/[\\/]/).pop(), code: new TextDecoder().decode(raw) }
}

const diffLines = (before, after) => {
  const a = String(before || '').split('\n'), b = String(after || '').split('\n'), out = [], n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) { if (a[i] === b[i]) out.push(`  ${a[i] ?? ''}`); else { if (a[i] !== undefined) out.push(`- ${a[i]}`); if (b[i] !== undefined) out.push(`+ ${b[i]}`) } }
  return out.join('\n')
}

export default function SceneVisual({ session, setSession, autosave, global, folders }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [code, setCode] = useState(''), [instruction, setInstruction] = useState(''), [compare, setCompare] = useState(''), [stepsText, setStepsText] = useState('[]'), frame = useRef(null), fileInput = useRef(null)
  const scene = current(session), gem = useMemo(() => { try { return createGemini({ keys: global?.keys?.gemini || [], models: global?.models || {}, rpm: global?.limits?.rpm || 5, maxWait: global?.limits?.max_wait || 240 }) } catch { return null } }, [global])
  useEffect(() => { let alive = true; if (!scene?.visual?.codeFileId) { setCode(''); return } fetchAsset(scene.visual.codeFileId).then(b => b.text()).then(x => alive && setCode(x)).catch(e => alive && setError(e.message)); return () => { alive = false } }, [scene?.id, scene?.visual?.codeFileId])
  useEffect(() => { setStepsText(JSON.stringify(scene?.visual?.steps || [], null, 2)) }, [scene?.id, scene?.visual?.steps])
  useEffect(() => { if (!frame.current || !code || !scene?.voice?.duration) return; let dead = false; const timer = setTimeout(async () => { try { const blob = scene.voice.fileId ? await fetchAsset(scene.voice.fileId) : null; if (dead) return; const audioBytes = blob ? await blob.arrayBuffer() : null, [width, height] = sizeOf(session.settings.aspect), durationInFrames = Math.max(30, Math.round((scene.voice.duration + (scene.visual?.tailSec || .4)) * 30)); frame.current.contentWindow?.postMessage({ type: 'frame-preview', tsx: code, width, height, fps: 30, durationInFrames, audioBytes }, '*') } catch (e) { if (!dead) setError(e.message) } }, 400); return () => { dead = true; clearTimeout(timer) } }, [code, scene?.voice?.fileId, scene?.voice?.duration, scene?.visual?.tailSec, session.settings.aspect])
  useEffect(() => { const on = e => { if (e.source !== frame.current?.contentWindow) return; if (e.data?.type === 'frame-sandbox-error') setError(e.data.error); if (e.data?.type === 'frame-sandbox-ready') setError('') }; addEventListener('message', on); return () => removeEventListener('message', on) }, [])
  const update = patch => setSession(s => ({ ...s, scenes: s.scenes.map(x => x.id === scene.id ? { ...x, ...patch } : x) }))
  const send = async () => { if (!code || !frame.current || !scene?.voice?.duration) return; const err = validateTsx(code); if (err) return setError(err); try { const blob = scene.voice.fileId ? await fetchAsset(scene.voice.fileId) : null, audioBytes = blob ? await blob.arrayBuffer() : null, [width, height] = sizeOf(session.settings.aspect), durationInFrames = Math.max(30, Math.round((scene.voice.duration + (scene.visual?.tailSec || .4)) * 30)); frame.current.contentWindow?.postMessage({ type: 'frame-preview', tsx: code, width, height, fps: 30, durationInFrames, audioBytes }, '*'); setError('') } catch (e) { setError(e.message) } }
  const saveCode = async (value, { engine = 'remotion', sourceName = '' } = {}) => {
    const err = validateTsx(value); if (err) throw new Error(err)
    const previous = scene.visual?.codeFileId ? { fileId: scene.visual.codeFileId, version: scene.visual.version || 1, name: scene.visual.codeName || `scene_${scene.id}.tsx` } : null
    const version = (scene.visual?.version || 0) + 1, ext = (sourceName.match(/\.(tsx|ts|jsx|js)$/i) || [])[0] || '.tsx'
    const asset = await uploadAsset(folders, 'code', `scene_${String(scene.id).padStart(2, '0')}.v${version}${ext}`, new Blob([value], { type: 'text/plain' }))
    const entries = [...(scene.history || []).filter(x => x.type === 'visual-code'), ...(previous ? [{ type: 'visual-code', ...previous }] : []), { type: 'visual-code', fileId: asset.fileId, version, name: asset.name }].filter((x, i, a) => a.findIndex(y => y.fileId === x.fileId) === i).slice(-10)
    const history = [...(scene.history || []).filter(x => x.type !== 'visual-code'), ...entries]
    const visual = { ...scene.visual, status: 'draft', engine, codeFileId: asset.fileId, codeName: sourceName || asset.name, version, durationSec: scene.voice.duration + (scene.visual?.tailSec || .4), error: '' }, snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual, history } : x) }
    setSession(snapshot); setCode(value); await autosave.flush(true, snapshot); await garbageCollectAssets(session, snapshot); return asset
  }
  const persistNotes = async next => { const snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, notes: next } : x) }; setSession(snapshot); await autosave.flush(true, snapshot) }
  const plan = async () => { if (!gem) return setError('Add a Gemini key in Control room.'); setBusy('Planning visuals…'); try { const spec = await visualPlan(gem, session.settings, scene), visual = { ...scene.visual, status: 'draft', steps: spec.steps || [], visuals: spec.visuals || [] }, snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual } : x) }; setSession(snapshot); await autosave.flush(true, snapshot) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const generate = async mode => { if (!gem) return setError('Add a Gemini key in Control room.'); const note = instruction.trim(); setBusy(mode === 'improve' ? 'Improving scene…' : 'Generating scene…'); setSession(s => ({ ...s, activeStep: { kind: 'visual', sceneId: scene.id, params: { mode, note }, startedAt: new Date().toISOString() } })); try { if (note) await persistNotes([...(scene.notes || []), { kind: 'visual', text: note, at: new Date().toISOString() }]); const previous = mode === 'improve' ? code : ''; const out = await genCode(gem, session.settings, { ...scene, ...scene.visual }, { note, previous }); await saveCode(out); setInstruction(''); setSession(s => ({ ...s, activeStep: null })) } catch (e) { setError(e.message); setSession(s => ({ ...s, activeStep: null })) } finally { setBusy('') } }
  const fix = async () => { if (!gem || !code) return; setBusy('Fixing scene…'); try { const out = await repairCode(gem, session.settings, { ...scene, ...scene.visual }, code, error); await saveCode(out) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const approve = async () => { const visual = { ...scene.visual, status: 'approved', error: '' }, steps = session.redoQueue?.sceneId === scene.id ? session.redoQueue.steps.filter(x => x !== 'visual') : session.redoQueue?.steps || [], redoQueue = session.redoQueue?.sceneId === scene.id ? (steps.length ? { ...session.redoQueue, steps } : null) : session.redoQueue, snapshot = { ...session, redoQueue, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual } : x) }; setSession(snapshot); await autosave.flush(true, snapshot) }
  const setTail = async value => { const visual = { ...scene.visual, tailSec: value, status: scene.visual?.status === 'approved' ? 'stale' : scene.visual?.status || 'none', durationSec: (scene.voice?.duration || 0) + value }, snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual } : x) }; setSession(snapshot); await autosave.flush(true, snapshot) }
  const saveSteps = async () => { try { const steps = JSON.parse(stepsText); if (!Array.isArray(steps)) throw new Error('Visual steps must be a JSON array.'); const visual = { ...scene.visual, steps, status: scene.visual?.status === 'approved' ? 'stale' : 'draft' }, snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual } : x) }; setSession(snapshot); await autosave.flush(true, snapshot); setError('') } catch (e) { setError(e instanceof SyntaxError ? 'Visual steps must be valid JSON.' : e.message) } }
  const restoreVersion = async item => { setBusy('Restoring scene version…'); try { const blob = await fetchAsset(item.fileId), text = await blob.text(); setCompare(diffLines(code, text)); await saveCode(text, { engine: scene.visual.engine || 'remotion', sourceName: item.name }) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const pickOwn = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setBusy('Opening your scene…'); setError(''); try { let loaded; if (/\.zip$/i.test(file.name)) loaded = await sceneFromZip(file); else { if (!sceneExt.test(file.name)) throw new Error('Use a .tsx, .ts, .jsx, .js, or ZIP scene file.'); if (file.size > 2_000_000) throw new Error('The scene file must be smaller than 2 MB.'); loaded = { name: file.name, code: await fileText(file) } } const bad = validateTsx(loaded.code); if (bad) throw new Error(`This scene cannot run in the sandbox: ${bad}`); await saveCode(loaded.code, { engine: 'own', sourceName: loaded.name }) } catch (e) { setError(e.message) } finally { setBusy('') } }
  const retime = async () => { if (!gem || !code) return setError('Generate or upload a scene first.'); setBusy('Retiming scene…'); try { const spec = await visualPlan(gem, session.settings, scene), patched = { ...scene, visual: { ...scene.visual, steps: spec.steps || [] } }, out = await genCode(gem, session.settings, patched, { note: instruction || 'Re-time the existing visual steps to match the approved narration timeline.', previous: code }); const snapshot = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, visual: patched.visual } : x) }; setSession(snapshot); await saveCode(out) } catch (e) { setError(e.message) } finally { setBusy('') } }
  if (!scene?.voice || scene.voice.status !== 'approved') return <p className="hint">Approve the voice for this scene before designing visuals.</p>
  const history = (scene.history || []).filter(x => x.type === 'visual-code').slice(-10).reverse()
  return <div className="panel"><h3>Scene visual draft {session.backend?.failedSceneIds?.includes(scene.id) && <small className="pill">Backend flagged</small>}</h3><p className="hint">Draft preview only. The final video is rendered later by the backend and will look sharper.</p>{session.redoQueue?.sceneId === scene.id && session.redoQueue.steps.includes('visual') && <p className="note">Redo queued: generate and approve this scene visual after the voice is approved.</p>}
    <div className="row tight"><button className="ghost sm" disabled={!!busy} onClick={plan}>Plan visuals</button><button className="cta sm" disabled={!!busy} onClick={() => generate('fresh')}>{busy || 'Start fresh'}</button>{code && <button className="ghost sm" disabled={!!busy} onClick={() => generate('improve')}>Improve this version</button>}<button className="ghost sm" disabled={!!busy} onClick={() => fileInput.current?.click()}>Upload my own scene</button><input ref={fileInput} type="file" accept=".tsx,.ts,.jsx,.js,.zip" hidden onChange={pickOwn} />{code && <button className="ghost sm" onClick={send}>Preview</button>}{code && <button className="ghost sm" onClick={approve}>Approve scene</button>}{error && code && <button className="ghost sm" disabled={!!busy} onClick={fix}>Fix with AI</button>}</div>
    <label>Instruction<textarea rows={2} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Describe how to change the narration or visuals; this note is saved with the scene." /></label>
    <details><summary>Visual steps</summary><label>Edit planned steps (JSON)<textarea rows={6} spellCheck="false" value={stepsText} onChange={e => setStepsText(e.target.value)} onBlur={saveSteps} /></label></details>
    <label>Extra time at the end: {+(scene.visual?.tailSec ?? .4).toFixed(1)} s<input type="range" min="0" max="10" step="0.1" value={scene.visual?.tailSec ?? .4} onChange={e => setTail(+e.target.value)} /></label>
    {code && <><label>Edit scene code<textarea rows={12} spellCheck="false" value={code} onChange={e => setCode(e.target.value)} onBlur={() => saveCode(code, { engine: scene.visual.engine || 'remotion', sourceName: scene.visual.codeName }).catch(e => setError(e.message))} /></label><div className="row tight"><small className="muted">{scene.visual?.engine === 'own' ? 'Your scene file' : 'Generated scene'} · version {scene.visual?.version || 1}</small><button className="ghost sm" disabled={!!busy} onClick={retime}>Re-time animation</button></div></>}
    {history.length > 0 && <details><summary>Version history (last 10)</summary>{history.map(x => <div className="row tight" key={x.fileId}><span>v{x.version} · {x.name}</span><button className="ghost sm" disabled={!!busy || x.fileId === scene.visual.codeFileId} onClick={() => restoreVersion(x)}>Restore</button></div>)}{compare && <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{compare}</pre>}</details>}
    {error && <p className="err">{error}</p>}<iframe ref={frame} title="Sandboxed scene preview" src="/sandbox.html" sandbox="allow-scripts" style={{ width: '100%', border: 0, minHeight: 280, background: '#0e1024' }} onLoad={() => send()} />
  </div>
}
