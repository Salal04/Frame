import { useState } from 'react'
import { sceneText } from '../engine/script.js'
import { garbageCollectAssets } from '../session.js'
import { blankScene, words } from './model.js'

export default function ScriptTab({ session, scene, pl, onSelect }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const i = session.scenes.findIndex(x => x.id === scene.id), last = i === session.scenes.length - 1
  const edit = p => pl.patch(scene.id, x => { const nc = 'narration' in p && p.narration !== x.narration, vc = nc || ('heading' in p && p.heading !== x.heading) || ('idea' in p && p.idea !== x.idea); return { ...x, ...p, ...(nc ? { narrationStatus: 'stale', voice: { ...x.voice, status: x.voice?.fileId ? 'stale' : x.voice?.status || 'none' } } : {}), ...(vc && x.visual?.codeFileId ? { visual: { ...x.visual, status: 'stale' } } : {}) } })
  const regen = async () => { if (!pl.gem) return setErr('Add a Gemini API key in Control room first.'); setBusy('Rewriting…'); setErr(''); try { const item = await sceneText(pl.gem, { ...session.settings, topic: session.title }, session.blueprint?.plan || {}, session.scenes, scene.id, note); edit({ heading: item.heading, idea: item.idea, narration: item.narration, history: [...(scene.history || []), { at: new Date().toISOString(), narration: scene.narration, heading: scene.heading }] }); setNote('') } catch (e) { setErr(e.message) } finally { setBusy('') } }
  const mutate = (fn, pick) => { const before = pl.sRef.current, next = pl.commit(s => { const scenes = fn([...s.scenes]); return { ...s, scenes, current: pick(scenes) ?? s.current } }); pl.saveNow(); garbageCollectAssets(before, next).catch(() => {}) }
  const newId = () => Math.max(0, ...session.scenes.map(s => s.id)) + 1
  const move = d => mutate(a => { const j = i + d; if (j < 0 || j >= a.length) return a;[a[i], a[j]] = [a[j], a[i]]; return a }, () => scene.id)
  const insert = () => { const id = newId(); mutate(a => { a.splice(i + 1, 0, blankScene(id)); return a }, () => id) }
  const dup = () => { const id = newId(); mutate(a => { a.splice(i + 1, 0, { ...blankScene(id), heading: `${scene.heading || `Scene ${scene.id}`} (copy)`, idea: scene.idea, narration: scene.narration }); return a }, () => id) }
  const del = () => { if (session.scenes.length < 2 || !confirm('Delete this scene and its voice and visual?')) return; mutate(a => a.filter(x => x.id !== scene.id), a => a[Math.min(i, a.length - 1)]?.id) }
  return <div className="gs-tab">
    <label>Heading<input value={scene.heading} onChange={e => edit({ heading: e.target.value })} /></label>
    <label>Idea (what the picture should show)<input value={scene.idea} onChange={e => edit({ idea: e.target.value })} /></label>
    <label>Narration <small>{words(scene.narration)} words</small><textarea rows={7} value={scene.narration} onChange={e => edit({ narration: e.target.value })} dir="auto" /></label>
    {(scene.voice?.status === 'stale' || scene.narrationStatus === 'stale') && <p className="note">The text changed. Make the voice again in the Voice tab.</p>}
    <div className="row tight"><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. use a simpler example" /><button className="ghost sm" disabled={!!busy || scene.locked} onClick={regen}>{busy || 'Rewrite with AI'}</button></div>
    <label className="chk"><input type="checkbox" checked={!!scene.locked} onChange={e => edit({ locked: e.target.checked })} /> Keep my text when the script is regenerated</label>
    {err && <p className="err">{err}</p>}
    <div className="row tight gs-ops"><button className="ghost sm" disabled={!i} onClick={() => move(-1)}>← Earlier</button><button className="ghost sm" disabled={last} onClick={() => move(1)}>Later →</button><button className="ghost sm" onClick={insert}>+ Add after</button><button className="ghost sm" onClick={dup}>Duplicate</button><button className="ghost sm danger" onClick={del}>Delete</button></div>
  </div>
}
