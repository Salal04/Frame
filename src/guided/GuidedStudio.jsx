import { useEffect, useRef, useState } from 'react'
import Blueprint from './Blueprint.jsx'
import Finish from './Finish.jsx'
import Stage, { makeHead, useHead } from './Stage.jsx'
import Timeline from './Timeline.jsx'
import ScriptTab from './ScriptTab.jsx'
import VoiceTab, { LongRecording } from './VoiceTab.jsx'
import VisualTab from './VisualTab.jsx'
import LogPanel from './LogPanel.jsx'
import { usePipeline } from './pipeline.js'
import { FPS, fmtTime, hasVoice, isApproved, layout, sceneAtFrame } from './model.js'

function Time({ head, total }) { const { frame } = useHead(head); return <span className="gs-time">{fmtTime(frame / FPS)} <small>/ {fmtTime(total)}</small></span> }

// The three build switches, used both before and inside the studio
function Options({ session, pl, compact }) {
  const st = session.settings, set = patch => pl.commit(s => ({ ...s, settings: { ...s.settings, ...patch } }))
  return <div className={`gs-opts${compact ? ' compact' : ''}`}>
    <label className="chk"><input type="checkbox" checked={!!st.continuous} onChange={e => set({ continuous: e.target.checked })} /> <span><b>Continuous build</b>{!compact && <small>Frame builds every scene by itself (voice, visual, approve) one after another, without asking you.</small>}</span></label>
    <label className="chk"><input type="checkbox" checked={st.bgVoices !== false} onChange={e => set({ bgVoices: e.target.checked })} /> <span><b>Voices in the background</b>{!compact && <small>The next 3 scenes get their voice at the same time while you work on the current one.</small>}</span></label>
    <label className="chk"><input type="checkbox" checked={!!session.auto?.send} onChange={e => pl.commit(s => ({ ...s, auto: { ...(s.auto || {}), send: e.target.checked } }))} /> <span><b>Send to backend when finished</b>{!compact && <small>After the last scene is approved, the Render Map goes to the render queue by itself.</small>}</span></label>
    {!compact && <label>Voice for this video<select value={st.voiceMode || 'ai'} onChange={e => set({ voiceMode: e.target.value })}><option value="ai">AI voice (Gemini)</option><option value="mine">My own voice (I record or upload)</option></select></label>}
  </div>
}

export default function GuidedStudio(props) {
  const { session, autosave, onAdvanced } = props
  const pl = usePipeline({ session, setSession: props.setSession, autosave, global: props.global, folders: props.folders, playlist: props.playlist, row: props.row, project: props.project, onRow: props.onRow })
  const head = useRef(makeHead()).current, stage = useRef(null), init = useRef(false), layRef = useRef(null), prevStage = useRef(session.stage), recRef = useRef(false)
  const [tab, setTab] = useState('script'), [mode, setMode] = useState('whole'), [bad, setBad] = useState({}), [long, setLong] = useState(false), [saveErr, setSaveErr] = useState('')
  const lay = layout(session.scenes, session.settings); layRef.current = lay
  const n = session.scenes.length, scene = session.scenes.find(s => s.id === session.current) || session.scenes[0], idx = scene ? session.scenes.findIndex(s => s.id === scene.id) : -1
  const done = session.scenes.filter(isApproved).length, fresh = { ...autosave, flush: (f, snap) => autosave.flush(f, snap || pl.sRef.current) }
  if (!init.current) { init.current = true; const L = lay.items.find(x => x.id === session.current); head.frame = L ? L.from : 0 }   // reopen exactly where you stopped

  const setStage = next => { pl.commit(s => ({ ...s, stage: next })); pl.saveNow() }
  const select = (id, seek = true) => { pl.commit(s => (s.current === id ? s : { ...s, current: id })); if (seek) { const L = layRef.current.items.find(x => x.id === id); if (L) stage.current?.seek(L.from) } if (session.settings.bgVoices !== false && !pl.auto.running) pl.prefetchVoices(Math.max(0, pl.sRef.current.scenes.findIndex(x => x.id === id))) }
  const go = d => { const j = Math.max(0, Math.min(n - 1, idx + d)); if (session.scenes[j]) select(session.scenes[j].id) }
  const follow = f => { if (!head.playing) return; const L = sceneAtFrame(layRef.current, f); if (L && L.id !== pl.sRef.current.current) pl.commit(s => ({ ...s, current: L.id })) }
  const toggle = () => {
    if (head.playing) return stage.current?.pause()
    const L = lay.items[idx]
    if (mode === 'scene' && L) { if (!(head.frame >= L.from && head.frame < L.end - 1)) stage.current.seek(L.from); stage.current.play({ from: L.from, end: L.end }) }
    else { if (head.frame >= lay.frames - 2) stage.current.seek(0); stage.current.play() }
  }
  const save = async () => { setSaveErr(''); try { await autosave.flush(true, pl.sRef.current) } catch (e) { setSaveErr(e.message || 'Could not save to Drive. Your work is kept in this browser.'); pl.log('error', `Could not save to Drive: ${e.message || 'unknown error'}`) } }

  useEffect(() => { const h = e => { recRef.current = !!e.detail; if (e.detail) stage.current?.pause() }; addEventListener('frame-rec', h); return () => removeEventListener('frame-rec', h) }, [])   // while you record, the preview stops and the space bar is yours
  useEffect(() => {
    const key = e => {
      const t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t?.tagName) || t?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
      else if (e.code === 'Space' && !typing && !recRef.current) { e.preventDefault(); toggle() }
    }
    addEventListener('keydown', key); return () => removeEventListener('keydown', key)
  })
  // moving from the script to the studio: start the continuous build, or start voices in the background
  useEffect(() => {
    if (prevStage.current === session.stage) return; prevStage.current = session.stage
    if (session.stage !== 'scenes') return
    if (session.settings.continuous && !pl.auto.running && session.scenes.some(s => !isApproved(s))) pl.runAuto()
    else if (session.settings.bgVoices !== false) pl.prefetchVoices(Math.max(0, idx))
  }, [session.stage])
  useEffect(() => { const s = autosave.state; if (s) pl.log(/not saved|fail|error|conflict/i.test(s) ? 'error' : 'info', `Drive: ${s}`) }, [autosave.state])
  const onErrors = (list, replace) => { list.forEach(x => x.error && pl.log('error', `Preview error: ${x.error}`, x.id)); setBad(b => { const o = replace ? {} : { ...b }; list.forEach(x => { o[x.id] = x.error }); return o }) }

  // ---- the one button that always does the sensible next thing for this scene ----
  const mine = (session.settings.voiceMode || 'ai') === 'mine', jobs = scene ? [pl.jobs[`${scene.id}:voice`], pl.jobs[`${scene.id}:visual`]].filter(Boolean) : []
  const needVoice = scene && (!hasVoice(scene) || scene.narrationStatus === 'stale' || scene.voice.status === 'stale')
  const next = !scene ? null : needVoice ? (mine ? { label: hasVoice(scene) ? 'Record the voice again' : 'Record the voice', run: () => setTab('voice') } : { label: hasVoice(scene) ? 'Make the voice again' : 'Make the voice', run: () => pl.genVoice(scene.id).catch(() => {}) })
    : !scene.visual?.codeFileId ? { label: 'Design the visual', run: () => pl.genVisual(scene.id).catch(() => {}) }
    : scene.visual.status === 'stale' ? { label: 'Sync the visual to the voice', run: () => pl.genVisual(scene.id, { mode: 'improve', note: 'Re-time the animation steps to match the voice timeline exactly.' }).catch(() => {}) }
    : idx < n - 1 ? { label: 'Approve and go to the next scene →', run: () => { pl.approveScene(scene.id); go(1) } }
    : { label: isApproved(scene) ? 'Finish →' : 'Approve and finish →', run: () => { pl.approveScene(scene.id); setStage('finish') } }
  const redoScene = async () => { try { if (mine) { setTab('voice'); return } await pl.genVoice(scene.id); pl.approveVoice(scene.id); await pl.genVisual(scene.id) } catch { /* errors show on the scene */ } }

  const stageChips = [['blueprint', '1  Script'], ['scenes', '2  Studio'], ['finish', '3  Finish']]
  const header = <header className="gs-top">
    <div className="gs-title"><input aria-label="Video title" value={session.title} onChange={e => pl.commit(s => ({ ...s, title: e.target.value }))} placeholder="Video title" /><small className="muted">{done}/{n} scenes approved</small></div>
    <div className="gs-chips">{stageChips.map(([k, l]) => <button key={k} className={session.stage === k ? 'on' : ''} disabled={k !== 'blueprint' && !n} onClick={() => setStage(k)}>{l}</button>)}</div>
    <div className="gs-save"><button className="cta sm" onClick={save} title="Ctrl+S">Save to Drive</button><small className={saveErr || /Not saved/.test(autosave.state) ? 'bad' : 'muted'}>{saveErr || autosave.state}{autosave.savedAt && !saveErr ? ` · ${autosave.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</small></div>
    {onAdvanced && <button className="ghost sm" onClick={onAdvanced} title="Open the full multi-track editor">Advanced editor</button>}
  </header>

  return <main className="gs">
    {header}
    {session.auto?.on && !pl.auto.running && session.stage === 'scenes' && <div className="note gs-resume">Continuous build was interrupted (the tab was closed or the connection dropped). Everything done so far is saved. <button className="cta sm" onClick={() => pl.runAuto()}>Resume the build</button> <button className="ghost sm" onClick={() => pl.commit(s => ({ ...s, auto: { ...(s.auto || {}), on: false } }))}>Dismiss</button></div>}

    {session.stage === 'blueprint' && <section className="gs-script">
      <h2>Script and scenes</h2>
      <p className="muted">{['Script', 'Source'].includes(session.inputType) ? 'Your text is split into scenes. Edit anything you like.' : 'Step 1: Frame writes the script and the scene list. Edit anything you like, then continue to the studio.'}</p>
      <Blueprint session={session} setSession={pl.commit} autosave={fresh} global={props.global} log={pl.log} />
      {n > 0 && <div className="panel"><h3>How should the rest be built?</h3><Options session={session} pl={pl} />
        <button className="cta" onClick={() => { pl.commit(s => ({ ...s, stage: 'scenes', current: s.scenes.some(x => x.id === s.current) ? s.current : s.scenes[0].id, blueprint: { ...s.blueprint, status: 'approved' } })); pl.saveNow() }}>{session.settings.continuous ? 'Approve the script and build everything' : 'Approve the script and open the studio'}</button></div>}
    </section>}

    {session.stage === 'scenes' && scene && <>
      <section className="gs-build">
        <div className="gs-prog" title={`${done} of ${n} scenes approved`}><i style={{ width: `${n ? done / n * 100 : 0}%` }} /></div>
        {pl.auto.running ? <><span className="gs-spin" /><span className="gs-msg">{pl.auto.msg}</span><button className="ghost sm" onClick={pl.pauseAuto}>Pause</button></>
          : <><button className="cta sm" disabled={done === n} onClick={() => pl.runAuto()}>{done === n ? 'Everything is built' : done ? 'Build the remaining scenes' : 'Build all scenes now'}</button><span className="gs-msg">{pl.auto.msg || (done === n ? '' : 'Or work scene by scene below.')}</span></>}
        <span className="gs-sp" /><Options session={session} pl={pl} compact />
      </section>
      <div className="gs-main">
        <div className="gs-left">
          <Stage ref={stage} session={session} lay={lay} head={head} onFrame={follow} onErrors={onErrors} />
          <div className="gs-transport">
            <button className="ghost sm" title="Previous scene" onClick={() => go(-1)}>⏮</button>
            <button className="cta sm gs-play" onClick={toggle}><PlayLabel head={head} /></button>
            <button className="ghost sm" title="Next scene" onClick={() => go(1)}>⏭</button>
            <Time head={head} total={lay.sec} /><span className="gs-sp" />
            <div className="gs-seg sm"><button className={mode === 'scene' ? 'on' : ''} onClick={() => setMode('scene')}>This scene</button><button className={mode === 'whole' ? 'on' : ''} onClick={() => setMode('whole')}>Whole video</button></div>
          </div>
        </div>
        <aside className="gs-right">
          <div className="gs-sc-head"><b>Scene {idx + 1} of {n}</b><span className="gs-sc-name">{scene.heading}</span>
            <span className={`gs-dot s-${scene.voice?.status || 'none'}`} title={`voice ${scene.voice?.status || 'none'}`}>voice</span><span className={`gs-dot s-${bad[scene.id] ? 'error' : scene.visual?.status || 'none'}`} title={`visual ${scene.visual?.status || 'none'}`}>visual</span></div>
          <button className="cta gs-next" disabled={jobs.length > 0} onClick={next.run}>{jobs[0] || next.label}</button>
          <div className="gs-seg">{[['script', 'Script'], ['voice', 'Voice'], ['visual', 'Visual']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'script' && <ScriptTab session={session} scene={scene} pl={pl} />}
          {tab === 'voice' && <VoiceTab session={session} scene={scene} pl={pl} onLong={() => setLong(true)} />}
          {tab === 'visual' && <VisualTab session={session} scene={scene} pl={pl} sceneError={bad[scene.id]} />}
        </aside>
      </div>
      <Timeline session={session} lay={lay} head={head} current={scene.id} onSelect={id => select(id)} onSeek={f => stage.current?.seek(f)} jobs={pl.jobs} errors={pl.errors} bad={new Set(Object.keys(bad).map(Number))}>
        <b className="gs-tl-title">Scene {idx + 1}</b>
        <button className="ghost sm" disabled={!!pl.jobs[`${scene.id}:voice`]} onClick={() => (mine ? setTab('voice') : pl.genVoice(scene.id).catch(() => {}))}>↻ Voice</button>
        <button className="ghost sm" disabled={!hasVoice(scene) || !!pl.jobs[`${scene.id}:visual`]} onClick={() => pl.genVisual(scene.id).catch(() => {})}>↻ Visual</button>
        <button className="ghost sm" disabled={jobs.length > 0} onClick={redoScene}>↻ Whole scene</button>
        <button className="ghost sm" disabled={!hasVoice(scene) || !scene.visual?.codeFileId} onClick={() => pl.approveScene(scene.id)}>✓ Approve</button>
      </Timeline>
    </>}

    {session.stage === 'finish' && <section className="gs-finish"><Finish session={session} setSession={pl.commit} autosave={fresh} global={props.global} playlist={props.playlist} project={props.project} row={props.row} onRow={props.onRow} onEdit={props.onEdit} onSocial={props.onSocial} onClone={props.onClone} />
      <div className="row tight"><button className="ghost sm" onClick={() => setStage('scenes')}>← Back to the studio</button></div></section>}
    <LogPanel logs={pl.logs} scenes={session.scenes} onClear={pl.clearLogs} />
    {long && <LongRecording session={session} pl={pl} onClose={() => setLong(false)} />}
  </main>
}
function PlayLabel({ head }) { const { playing } = useHead(head); return playing ? '⏸ Pause' : '▶ Play' }
