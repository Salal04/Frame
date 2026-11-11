import { useState } from 'react'
import { speak } from '../engine/voice.js'
import { garbageCollectAssets, uploadAsset } from '../session.js'
import { VOICES } from '../config.js'

const current = s => s.scenes.find(x => x.id === s.current) || s.scenes[0]
const staleVisual = visual => visual?.codeFileId || visual?.status === 'approved' ? { ...visual, status: 'stale' } : visual
const takeRecord = voice => ({ type: 'voice-take', ...voice })

export default function SceneVoice({ session, setSession, autosave, global, folders }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [styleNote, setStyleNote] = useState('')
  const scene = current(session)
  if (!scene) return <p className="hint">Approve a blueprint before generating scene voices.</p>
  const update = patch => { const next = { ...session, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, ...patch } : x) }; setSession(next); return next }
  const updateVoiceSettings = patch => update({ voice: { ...scene.voice, ...patch, status: scene.voice?.fileId ? 'stale' : scene.voice?.status || 'none' }, visual: staleVisual(scene.visual) })
  const setNarration = value => update({ narration: value, narrationStatus: 'stale', voice: { ...scene.voice, status: scene.voice?.fileId ? 'stale' : scene.voice?.status || 'none' }, visual: staleVisual(scene.visual) })
  const generate = async retry => {
    const voice = scene.voice?.voice || session.settings.voice || 'Charon', style = [scene.voice?.style || session.settings.tts_style || 'calm, clear and friendly', styleNote].filter(Boolean).join(', ')
    setBusy('Generating voice...'); setError('')
    const running = { ...session, activeStep: { kind: 'voice', sceneId: scene.id, params: { retry }, startedAt: new Date().toISOString() } }; setSession(running)
    try {
      const out = await speak({ keys: global?.keys?.tts?.length ? global.keys.tts : global?.keys?.gemini || [], models: global?.models?.tts || [], voice, style, text: scene.narration })
      const take = (scene.voice?.take || 0) + 1, asset = await uploadAsset(folders, 'audio', `scene_${String(scene.id).padStart(2, '0')}_take_${take}.wav`, out.wav)
      const latest = { ...scene.voice, status: 'draft', fileId: asset.fileId, name: asset.name, duration: out.duration, timeline: out.timeline, take, voice, style }
      const priorTakes = (scene.history || []).filter(x => x.type === 'voice-take'), prior = scene.voice?.fileId ? takeRecord(scene.voice) : null
      const voiceHistory = [...priorTakes, ...(prior ? [prior] : [])].filter((x, i, a) => a.findIndex(y => y.fileId === x.fileId) === i).slice(-4)
      const history = [...(scene.history || []).filter(x => x.type !== 'voice-take'), ...voiceHistory]
      const next = { ...session, activeStep: null, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, voice: latest, visual: staleVisual(x.visual), narrationStatus: 'draft', history } : x) }
      setSession(next); await autosave.flush(true, next); await garbageCollectAssets(session, next); setStyleNote('')
    } catch (e) { setError(e.message); setSession(s => ({ ...s, activeStep: null })) } finally { setBusy('') }
  }
  const approve = async () => {
    const queue = session.redoQueue?.sceneId === scene.id ? session.redoQueue.steps.filter(x => x !== 'voice') : session.redoQueue?.steps || []
    const redoQueue = session.redoQueue?.sceneId === scene.id ? (queue.length ? { ...session.redoQueue, steps: queue } : null) : session.redoQueue
    const next = { ...session, redoQueue, scenes: session.scenes.map(x => x.id === scene.id ? { ...x, voice: { ...x.voice, status: 'approved' }, visual: staleVisual(x.visual) } : x) }
    setSession(next); await autosave.flush(true, next)
  }
  const useTake = async item => {
    const old = scene.voice?.fileId ? takeRecord(scene.voice) : null
    const takes = [...(scene.history || []).filter(x => x.type === 'voice-take').filter(x => x.fileId !== item.fileId), ...(old && old.fileId !== item.fileId ? [old] : [])].filter((x, i, a) => a.findIndex(y => y.fileId === x.fileId) === i).slice(-4)
    const history = [...(scene.history || []).filter(x => x.type !== 'voice-take'), ...takes]
    const next = update({ voice: { ...scene.voice, ...item, status: 'draft' }, visual: staleVisual(scene.visual), history })
    await autosave.flush(true, next); await garbageCollectAssets(session, next)
  }
  const takes = (scene.history || []).filter(x => x.type === 'voice-take').slice().reverse()
  return <div className="panel"><h3>2. Scene voice {session.backend?.failedSceneIds?.includes(scene.id) && <small className="pill">Backend flagged</small>}</h3>{session.redoQueue?.sceneId === scene.id && session.redoQueue.steps.includes('voice') && <p className="note">Redo queued: update this voice first, then review the scene visual.</p>}<div className="seg tabs">{session.scenes.map(s => <button key={s.id} className={s.id === scene.id ? 'on' : ''} disabled={!!busy} onClick={() => setSession(x => ({ ...x, current: s.id }))}>{s.id}</button>)}</div>
    <label>Narration<textarea rows={6} disabled={!!busy} value={scene.narration} onChange={e => setNarration(e.target.value)} /></label>
    <div className="cols"><label>Voice<select disabled={!!busy} value={scene.voice?.voice || session.settings.voice || 'Charon'} onChange={e => updateVoiceSettings({ voice: e.target.value })}>{VOICES.map(v => <option key={v[0]} value={v[0]}>{v[0]}</option>)}</select></label><label>Style<input disabled={!!busy} value={scene.voice?.style || session.settings.tts_style || ''} onChange={e => updateVoiceSettings({ style: e.target.value })} /></label></div>
    <div className="row tight"><button className="cta sm" disabled={!scene.narration.trim() || !!busy} onClick={() => generate(false)}>{busy || (scene.voice?.fileId ? 'Retry voice' : 'Generate voice')}</button><button className="ghost sm" disabled={!!busy} onClick={() => setStyleNote('slower')}>Slower</button><button className="ghost sm" disabled={!!busy} onClick={() => setStyleNote('calmer')}>Calmer</button><button className="ghost sm" disabled={!!busy} onClick={() => setStyleNote('more energetic')}>More energetic</button>{scene.voice?.fileId && <button className="ghost sm" disabled={!!busy} onClick={approve}>Approve voice</button>}</div>
    {scene.voice?.fileId && <p className="hint">Take {scene.voice.take} - {scene.voice.duration?.toFixed(1)} seconds - {scene.voice.status}</p>}
    {takes.length > 0 && <details><summary>Previous voice takes</summary>{takes.map(x => <div className="row tight" key={x.fileId}><span>Take {x.take} - {x.name} - {Number(x.duration || 0).toFixed(1)} s</span><button className="ghost sm" disabled={!!busy || x.fileId === scene.voice?.fileId} onClick={() => useTake(x)}>Use this take</button></div>)}</details>}
    {scene.voice?.timeline?.length > 0 && <ol>{scene.voice.timeline.map(x => <li key={x.i}>{x.text}</li>)}</ol>}{error && <p className="err">{error}</p>}
  </div>
}
