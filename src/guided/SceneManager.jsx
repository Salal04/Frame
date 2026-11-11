import { garbageCollectAssets } from '../session.js'

const blank = id => ({ id, heading: `Scene ${id}`, idea: '', narration: '', locked: false, narrationStatus: 'draft', voice: { status: 'none', fileId: '', duration: 0, timeline: [], take: 0, voice: '', style: '' }, visual: { status: 'none', engine: 'remotion', steps: [], visuals: [], codeFileId: '', version: 0, durationSec: 0, tailSec: .4, clipFileId: '', error: '' }, notes: [], history: [] })
export default function SceneManager({ session, setSession, autosave }) {
  const update = async (scenes, current = session.current) => { const next = { ...session, scenes, current }; setSession(next); await autosave.flush(true, next).catch(() => {}); await garbageCollectAssets(session, next) }
  const move = (index, delta) => { const next = [...session.scenes], target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; return update(next) }
  const insert = index => { const id = Math.max(0, ...session.scenes.map(s => s.id)) + 1, next = [...session.scenes]; next.splice(index, 0, blank(id)); return update(next, id) }
  const duplicate = index => { const source = session.scenes[index], id = Math.max(0, ...session.scenes.map(s => s.id)) + 1, copy = { ...blank(id), heading: `${source.heading || `Scene ${source.id}`} (copy)`, idea: source.idea, narration: source.narration }, next = [...session.scenes]; next.splice(index + 1, 0, copy); return update(next, id) }
  const remove = index => { const next = session.scenes.filter((_, i) => i !== index), current = next.some(s => s.id === session.current) ? session.current : next[Math.min(index, next.length - 1)]?.id || 1; return update(next, current) }
  return <div className="panel"><h3>Manage scenes</h3><p className="hint">Insert, reorder, duplicate, or remove scenes. A duplicate starts without approved voice or visuals.</p>
    <div className="row tight"><button className="ghost sm" onClick={() => insert(session.scenes.length)}>Add scene</button></div>
    <ol>{session.scenes.map((s, i) => <li key={s.id}><b>{s.heading || `Scene ${s.id}`}</b> <small className="muted">voice {s.voice?.status || 'none'} - visual {s.visual?.status || 'none'}{session.backend?.failedSceneIds?.includes(s.id) ? ' - backend flagged' : ''}</small><div className="row tight"><button className="ghost sm" disabled={!i} onClick={() => move(i, -1)}>Move up</button><button className="ghost sm" disabled={i === session.scenes.length - 1} onClick={() => move(i, 1)}>Move down</button><button className="ghost sm" onClick={() => duplicate(i)}>Duplicate</button><button className="ghost sm danger" onClick={() => remove(i)}>Delete</button></div></li>)}</ol>
  </div>
}
import { garbageCollectAssets } from '../session.js'

