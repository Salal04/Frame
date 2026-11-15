import { useEffect, useRef, useState } from 'react'
import { fetchAsset } from '../session.js'
import { validateTsx } from '../engine/visual.js'
import { sceneFromZip } from './SceneVisual.jsx'
import { hasVoice } from './model.js'
import { CopyButton, FocusModal, visualText } from './Focus.jsx'

const ext = /\.(tsx|ts|jsx|js)$/i
export default function VisualTab({ session, scene, pl, sceneError }) {
  const [code, setCode] = useState(''), [note, setNote] = useState(''), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [full, setFull] = useState(false), file = useRef(null)
  const job = pl.jobs[`${scene.id}:visual`], v = scene.visual || {}, problem = err || pl.errors[`${scene.id}:visual`] || sceneError || ''
  useEffect(() => { let on = true; setErr(''); setNote(''); if (!v.codeFileId) { setCode(''); return } fetchAsset(v.codeFileId).then(b => b.text()).then(t => on && setCode(t)).catch(e => on && setErr(e.message)); return () => { on = false } }, [scene.id, v.codeFileId])
  if (!hasVoice(scene)) return <div className="gs-tab"><p className="hint">The visual is timed to the voice, so make (or record) the voice first. Open the Voice tab.</p></div>
  const run = fn => async () => { setErr(''); setMsg(''); try { await fn() } catch (e) { setErr(e.message) } }
  const setTail = value => pl.patch(scene.id, x => ({ ...x, visual: { ...x.visual, tailSec: value, durationSec: (x.voice?.duration || 0) + value, status: x.visual?.status === 'approved' ? 'stale' : x.visual?.status || 'none' } }))
  const own = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); try { let got; if (/\.zip$/i.test(f.name)) got = await sceneFromZip(f); else { if (!ext.test(f.name)) throw new Error('Use a .tsx, .ts, .jsx, .js or ZIP scene file.'); if (f.size > 2e6) throw new Error('The scene file must be smaller than 2 MB.'); got = { name: f.name, code: await f.text() } } const bad = validateTsx(got.code); if (bad) throw new Error(`This scene cannot run in the sandbox: ${bad}`); await pl.saveVisualCode(scene.id, got.code, { engine: 'own', sourceName: got.name }) } catch (x) { setErr(x.message) } }
  const history = (scene.history || []).filter(x => x.type === 'visual-code').slice(-10).reverse()
  return <div className="gs-tab">
    <p className="hint">Draft preview only. The final video is rendered later by the backend and looks sharper.</p>
    {(() => { const desc = visualText(scene); return desc ? <div className="gs-desc"><div className="row tight"><b>Visual description</b><span className="gs-sp" /><CopyButton text={desc} /><button className="ghost sm" onClick={() => setFull(true)}>⛶ Full screen</button></div><pre>{desc}</pre>
      {full && <FocusModal title={`Visual description · ${scene.heading || 'scene'}`} onClose={() => setFull(false)} actions={<CopyButton text={desc} />}><pre className="gs-big">{desc}</pre></FocusModal>}</div> : <p className="hint">The visual description (idea, metaphor, animation steps) shows here once the visual has been planned.</p> })()}
    <div className="row tight">
      <button className="cta sm" disabled={!!job} onClick={run(() => pl.genVisual(scene.id, { note }))}>{job || (v.codeFileId ? '↻ Retry visual' : 'Design visual')}</button>
      {v.codeFileId && <button className="ghost sm" disabled={!!job} onClick={run(() => pl.genVisual(scene.id, { note: note || 'Improve this scene and keep what works.', mode: 'improve', replan: false }))}>Improve this version</button>}
      {v.codeFileId && <button className="ghost sm" disabled={!!job} onClick={run(() => pl.genVisual(scene.id, { note: 'Re-time the animation steps to match the voice timeline exactly.', mode: 'improve' }))}>Sync to voice</button>}
      <button className="ghost sm" disabled={!!job} onClick={() => file.current.click()}>Upload my own scene</button><input ref={file} type="file" accept=".tsx,.ts,.jsx,.js,.zip" hidden onChange={own} />
    </div>
    <label>What should change?<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. bigger text, show the numbers one by one, calmer colours" /></label>
    {problem && <div className="err">{problem}{v.codeFileId && <> <button className="ghost sm" disabled={!!job} onClick={run(() => pl.fixVisual(scene.id, problem))}>Fix with AI</button></>}</div>}
    {v.status === 'stale' && v.codeFileId && !job && <p className="note">The voice or text changed after this visual was made. Press <b>Sync to voice</b> (or Retry) so the animation matches.</p>}
    <label>Extra time after the voice: {+(v.tailSec ?? .4).toFixed(1)} s<input type="range" min="0" max="10" step=".1" value={v.tailSec ?? .4} onChange={e => setTail(+e.target.value)} /></label>
    {code && <details><summary>Scene code{v.engine === 'own' ? ' (your file)' : ''} · version {v.version || 1}</summary><textarea rows={12} spellCheck="false" value={code} onChange={e => setCode(e.target.value)} onBlur={() => { if (code !== '' && v.codeFileId) pl.saveVisualCode(scene.id, code, { engine: v.engine || 'remotion', sourceName: v.codeName }).catch(e => setErr(e.message)) }} /></details>}
    {history.length > 0 && <details><summary>Earlier versions ({history.length})</summary>{history.map(x => <div className="row tight" key={x.fileId}><span>v{x.version} · {x.name}</span><button className="ghost sm" disabled={!!job || x.fileId === v.codeFileId} onClick={run(async () => { const t = await (await fetchAsset(x.fileId)).text(); await pl.saveVisualCode(scene.id, t, { engine: v.engine || 'remotion', sourceName: x.name }) })}>Restore</button></div>)}</details>}
    {msg && <p className="ok">{msg}</p>}
  </div>
}
