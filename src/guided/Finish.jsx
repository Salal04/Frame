import { useState } from 'react'
import * as G from '../drive.js'
import * as P from '../playlist.js'
import WholeVideoPreview from './WholeVideoPreview.jsx'

const tailOf = scene => Number.isFinite(+scene.visual?.tailSec) ? +scene.visual.tailSec : .4
const approved = s => s.narrationStatus !== 'stale' && s.voice?.status === 'approved' && s.visual?.status === 'approved'
const statusLocked = status => ['Waiting', 'In Process', 'Completed'].includes(status)

export default function Finish({ session, setSession, autosave, global, playlist, project, row, onRow, onEdit, onSocial, onClone }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [queued, setQueued] = useState(false)
  const locked = statusLocked(row?.status), ready = session.scenes.length > 0 && session.scenes.every(s => approved(s) && !!s.voice?.fileId && !!s.visual?.codeFileId && Number.isFinite(+s.voice?.duration) && +s.voice.duration > 0), failed = row?.status === 'Failed'
  const goScene = async id => {
    const target = session.scenes.find(s => s.id === id), steps = []
    if (target && (target.narrationStatus === 'stale' || target.voice?.status !== 'approved')) steps.push('voice')
    if (target && target.visual?.status !== 'approved') steps.push('visual')
    const next = { ...session, stage: 'scenes', current: id, redoQueue: steps.length ? { sceneId: id, steps } : null, backend: failed ? { ...session.backend, failedSceneIds: failedIds } : session.backend }
    setSession(next); await autosave.flush(true, next)
  }
  const send = async () => {
    setBusy('Checking saved scene files...'); setError(''); setQueued(false)
    setSession(s => ({ ...s, activeStep: { kind: 'finish', sceneId: null, params: {}, startedAt: new Date().toISOString() } }))
    try {
      if (!ready) throw new Error('Approve every narration, voice, and visual before sending the Render Map.')
      const assets = session.scenes.flatMap(s => [{ id: s.voice.fileId, scene: s.id, kind: 'voice' }, { id: s.visual.codeFileId, scene: s.id, kind: 'visual' }])
      for (const item of assets) {
        if (!item.id) throw new Error(`Scene ${item.scene} is missing its ${item.kind} file.`)
        let file
        try { file = await G.getFile(item.id) } catch { throw new Error(`Scene ${item.scene} ${item.kind} file is missing or unavailable in Drive. Re-save it, then try again.`) }
        if (file.trashed) throw new Error(`Scene ${item.scene} ${item.kind} file was deleted from Drive. Re-save it, then try again.`)
      }
      let start = 0
      const scenes = session.scenes.map(s => {
        const duration = Number(s.voice.duration), tailSec = tailOf(s), scene = {
          id: s.id, heading: s.heading || `Scene ${s.id}`, narration: s.narration || '', start, tailSec,
          voice: { fileId: s.voice.fileId, name: s.voice.name || `scene_${s.id}.wav`, duration, timeline: s.voice.timeline || [] },
          visual: { engine: 'remotion', fileId: s.visual.codeFileId, name: s.visual.codeName || `scene_${s.id}.v${s.visual.version || 1}.tsx`, version: s.visual.version || 1, durationSec: duration + tailSec },
        }
        start += duration + tailSec
        return scene
      })
      const renderMap = { version: 1, title: session.title, createdAt: new Date().toISOString(), settings: {
        aspect: session.settings.aspect || project?.aspect || '16:9', quality: 'high', fps: 30,
        language: session.settings.language || project?.language || 'en',
        screen_language: session.settings.screen_language || project?.screen_language || session.settings.language || 'en',
        urdu_font: global?.tools?.urdu_font || 'Noto Naskh Arabic',
      }, scenes, captions: true, total: start }
      setBusy('Sending Render Map to the backend...')
      const submitted = await P.sendGuidedRenderMap(playlist, row, renderMap)
      const fileIds = assets.map(x => x.id), sent = [...(session.submittedMaps || []), { at: renderMap.createdAt, fileIds }]
      const next = { ...session, stage: 'finish', submittedMaps: sent, backend: { status: 'Waiting', notes: '', submittedAt: renderMap.createdAt } }
      setSession(next); onRow?.(submitted); setQueued(true); await autosave.flush(true, next)
    } catch (e) { setError(e.message || 'Could not send the Render Map.'); setSession(s => ({ ...s, activeStep: null })) } finally { setBusy('') }
  }
  const failedIds = [...String(row?.notes || '').matchAll(/scene\s+#?(\d+)/ig)].map(x => +x[1]).filter(id => session.scenes.some(s => s.id === id))
  return <div className="panel"><h3>3. Finish</h3>
    {(queued || (row?.status === 'Waiting' && session.backend?.status === 'Waiting')) && <div className="note"><b>Queued.</b> The backend picks it up on its next run (every 6 hours, or press Run workflow in GitHub Actions).{global?.tools?.actions_url && <> <a href={global.tools.actions_url} target="_blank" rel="noreferrer">Open GitHub Actions</a></>}</div>}
    {row?.status && <div className="note"><b>Backend status: {row.status}</b>{row.notes && <p>{row.notes}</p>}{row.status === 'Completed' && row.output && <a href={row.output} target="_blank" rel="noreferrer">Open final video</a>}</div>}
    {row?.status === 'Completed' ? <><p className="hint">This guided session is read-only. Make a new version to continue editing.</p><div className="row tight"><button className="cta sm" onClick={() => onEdit?.(playlist, row)}>Edit video</button><button className="ghost sm" onClick={() => { const id = (String(row.output || '').match(/\/d\/([\w-]{10,})/) || String(row.output || '').match(/[?&]id=([\w-]{10,})/) || [])[1]; onSocial?.(id || `${playlist.folderId}|${row.row}`) }}>Social</button><button className="ghost sm" onClick={onClone}>Make a new version</button></div><WholeVideoPreview session={session} /></>
      : locked ? <><p className="hint">The backend owns this row while it is {row.status.toLowerCase()}. Your guided session and Render Map are preserved.</p><WholeVideoPreview session={session} /></>
      : <>
        {failed && <><p className="err">The backend stopped this render. Review its Notes, fix the scene, then send the map again.</p>{failedIds.length > 0 && <p>Reported scenes: {failedIds.map(id => <button key={id} className="ghost sm" onClick={() => goScene(id)}>Go to scene {id}</button>)}</p>}<button className="ghost sm" onClick={() => goScene(failedIds[0] || session.scenes[0]?.id)}>Fix in guided builder</button></>}
        <p className="hint">Every scene needs an approved narration, voice WAV, and Remotion scene file. The backend renders the final video at high quality.</p>
        <ul>{session.scenes.map(s => <li key={s.id}><b>{s.heading || `Scene ${s.id}`}</b> - {approved(s) && s.voice.fileId && s.visual.codeFileId && Number(s.voice.duration) > 0 ? 'Ready' : 'Needs approval or a saved file'} <button className="ghost sm" onClick={() => goScene(s.id)}>{approved(s) ? 'Go to scene' : 'Redo from here'}</button></li>)}</ul>
        {error && <p className="err">{error}</p>}
        <button className="cta sm" disabled={!ready || !!busy} onClick={send}>{busy || 'Send to backend for final render'}</button>
      </>}
    {error && locked && <p className="err">{error}</p>}
  </div>
}
