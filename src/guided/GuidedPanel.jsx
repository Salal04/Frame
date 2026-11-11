import { progress } from './state.js'
import Blueprint from './Blueprint.jsx'
import SceneVoice from './SceneVoice.jsx'
import SceneVisual from './SceneVisual.jsx'
import WholeVideoPreview from './WholeVideoPreview.jsx'
import Finish from './Finish.jsx'
import SceneManager from './SceneManager.jsx'

export default function GuidedPanel({ session, status, onContinue, onSkip, setSession, autosave, global, folders, row, playlist, project, onRow, onEdit, onSocial, onClone }) {
  const p = progress(session), readOnly = ['Waiting', 'In Process', 'Completed'].includes(row?.status), stage = readOnly ? 'finish' : session.stage
  const changeStage = next => { if (readOnly) return; const value = { ...session, stage: next }; setSession(value); autosave.flush(true, value).catch(() => {}) }
  return <div className="panel"><h3>Guided builder <small className="pill">{status}</small></h3>
    <div className="seg tabs"><button className={stage === 'blueprint' ? 'on' : ''} disabled={readOnly} onClick={() => changeStage('blueprint')}>1 Blueprint</button><button className={stage === 'scenes' ? 'on' : ''} disabled={readOnly} onClick={() => changeStage('scenes')}>2 Scenes</button><button className={stage === 'finish' ? 'on' : ''} onClick={() => changeStage('finish')}>3 Finish</button></div>
    {session.activeStep && !readOnly && <div className="note"><b>Interrupted step:</b> {session.activeStep.kind}. <button className="ghost sm" onClick={onContinue}>Continue</button><button className="ghost sm" onClick={onSkip}>Skip</button></div>}
    {row?.status === 'Failed' && session.stage !== 'finish' && <div className="note"><b>Backend status: Failed.</b> {row.notes} <button className="ghost sm" onClick={() => changeStage('finish')}>Review backend result</button></div>}
    <p className="hint">{p.approved}/{p.total} scenes approved.</p>
    {!readOnly && session.stage === 'blueprint' && <Blueprint session={session} setSession={setSession} autosave={autosave} global={global} />}
    {!readOnly && session.stage === 'scenes' && <SceneVoice session={session} setSession={setSession} autosave={autosave} global={global} folders={folders} />}
    {!readOnly && session.stage === 'scenes' && <SceneVisual session={session} setSession={setSession} autosave={autosave} global={global} folders={folders} />}
    {!readOnly && session.stage === 'scenes' && <SceneManager session={session} setSession={setSession} autosave={autosave} />}
    {!readOnly && session.stage === 'scenes' && <WholeVideoPreview session={session} />}
    {(readOnly || session.stage === 'finish') && <Finish session={session} setSession={setSession} autosave={autosave} global={global} playlist={playlist} project={project} row={row} onRow={onRow} onEdit={onEdit} onSocial={onSocial} onClone={onClone} />}
    {!!session.scenes.length && <ol>{session.scenes.map(s => <li key={s.id}>{s.heading || `Scene ${s.id}`} <small className="muted">- voice {s.voice?.status || 'none'} - visual {s.visual?.status || 'none'}</small></li>)}</ol>}
    {!readOnly && <details><summary>Session JSON</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(session, null, 2)}</pre></details>}
  </div>
}
