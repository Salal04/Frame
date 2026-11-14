import { useEffect, useMemo, useRef, useState } from 'react'
import { VOICES } from '../config.js'
import { buildTimeline } from '../engine/voice.js'
import { alignTimeline, decode, mono, peaksOf, sliceToWav, splitPoints, startMic, trimPoints } from './audio.js'
import { hasVoice, words, fmtTime } from './model.js'
import WaveCuts from './WaveCuts.jsx'

// One decoded recording (from the microphone or a file) that can be trimmed, auditioned and stored as the scene's voice.
function Trimmer({ clip, onUse, onDiscard, narration, busy }) {
  const [points, setPoints] = useState(() => trimPoints(mono(clip.buf), clip.buf.sampleRate)), audio = useRef(null)
  const peaks = useMemo(() => peaksOf(mono(clip.buf), 900), [clip])
  const url = useMemo(() => URL.createObjectURL(clip.blob), [clip]); useEffect(() => () => URL.revokeObjectURL(url), [url])
  const play = () => { const a = audio.current; a.currentTime = points[0]; a.play().catch(() => {}); const stop = () => { if (a.currentTime >= points[1]) { a.pause(); a.removeEventListener('timeupdate', stop) } }; a.addEventListener('timeupdate', stop) }
  const use = () => onUse(sliceToWav(clip.buf, points[0], points[1]))
  return <div className="gs-trim"><p className="hint">Drag the two handles to cut off the silence or any mistake at the start and end.</p>
    <WaveCuts peaks={peaks} duration={clip.buf.duration} points={points} setPoints={setPoints} /><audio ref={audio} src={url} preload="auto" />
    <div className="row tight"><button className="ghost sm" onClick={play}>▶ Play the cut</button><button className="ghost sm" onClick={() => setPoints(trimPoints(mono(clip.buf), clip.buf.sampleRate))}>Auto-trim silence</button><small className="muted">{fmtTime(points[1] - points[0])} of {fmtTime(clip.buf.duration)}</small><span className="gs-sp" />
      <button className="ghost sm" onClick={onDiscard}>Discard</button><button className="cta sm" disabled={busy || points[1] - points[0] < .3} onClick={use}>{busy ? 'Saving…' : 'Use this recording'}</button></div></div>
}

export default function VoiceTab({ session, scene, pl, onLong }) {
  const st = session.settings, mode = st.voiceMode || 'ai', source = scene.voice?.source || 'ai'
  const [clip, setClip] = useState(null), [rec, setRec] = useState(null), [secs, setSecs] = useState(0), [level, setLevel] = useState(0), [err, setErr] = useState(''), [saving, setSaving] = useState(false), [note, setNote] = useState(''), [anchor, setAnchor] = useState(null)
  const mic = useRef(null), prompter = useRef(null), file = useRef(null)
  const job = pl.jobs[`${scene.id}:voice`], rtl = /[\u0600-\u06FF]/.test(scene.narration)
  useEffect(() => { setClip(null); setErr(''); setAnchor(null); return () => { const m = mic.current; if (m) { mic.current = null; m.stop().catch(() => {}); setRec(false) } } }, [scene.id])
  useEffect(() => { dispatchEvent(new CustomEvent('frame-rec', { detail: !!rec })); return () => dispatchEvent(new CustomEvent('frame-rec', { detail: false })) }, [rec])   // tells the studio: stop the preview, ignore the space bar
  useEffect(() => { if (!rec) return; const t0 = Date.now(), t = setInterval(() => { setSecs((Date.now() - t0) / 1000); setLevel(mic.current?.level() || 0) }, 90); return () => clearInterval(t) }, [rec])
  const estimate = Math.max(4, words(scene.narration) / (st.language === 'ur' ? 2.3 : 2.5))
  const live = useMemo(() => buildTimeline(scene.narration, estimate), [scene.narration, estimate])
  const base = anchor && live[anchor.i] ? live[anchor.i].start + (secs - anchor.t) : secs
  const lineNow = rec ? (base >= (live.at(-1)?.end ?? 0) ? live.length - 1 : live.findIndex(x => base >= x.start && base < x.end)) : -1
  useEffect(() => { if (lineNow >= 0) prompter.current?.querySelector(`[data-i="${lineNow}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [lineNow])
  const setMode = m => pl.commit(s => ({ ...s, settings: { ...s.settings, voiceMode: m } }))
  const start = async () => { setErr(''); setAnchor(null); try { mic.current = await startMic(); setRec(true); setSecs(0) } catch (e) { setErr(e.message) } }
  const stop = async () => { try { const m = mic.current; mic.current = null; const blob = await m.stop(); setRec(false); setClip({ blob, buf: await decode(blob) }) } catch (e) { setRec(false); setErr(e.message) } }
  const pickFile = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); try { setClip({ blob: f, buf: await decode(f), name: f.name }) } catch (x) { setErr(x.message) } }
  const useClip = async cut => {
    setSaving(true); setErr('')
    try { const buf = await decode(cut.blob), timeline = alignTimeline(buf.getChannelData(0), buf.sampleRate, scene.narration, cut.duration); await pl.attachVoice(scene.id, { blob: cut.blob, duration: cut.duration, timeline, source: 'mine' }); setClip(null) }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  const takes = (scene.history || []).filter(x => x.type === 'voice-take').slice().reverse()
  const aiErr = pl.errors[`${scene.id}:voice`]
  return <div className="gs-tab">
    <div className="gs-seg"><button className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}>AI voice (Gemini)</button><button className={mode === 'mine' ? 'on' : ''} onClick={() => setMode('mine')}>My own voice</button></div>
    <p className="hint">{mode === 'mine' && rec ? 'Reading faster or slower than the guide? Click the line you are on and the highlight follows you.' : mode === 'ai' ? 'Voices for the next scenes are made together in the background while you work.' : 'You record or upload. Continuous build waits for you on scenes that have no recording yet.'}</p>

    {mode === 'ai' && <>
      <div className="cols"><label>Voice<select disabled={!!job} value={scene.voice?.voice || st.voice || 'Charon'} onChange={e => pl.patch(scene.id, x => ({ ...x, voice: { ...x.voice, voice: e.target.value, status: x.voice?.fileId ? 'stale' : x.voice?.status || 'none' } }))}>{VOICES.map(v => <option key={v[0]} value={v[0]}>{v[0]} · {v[1]}</option>)}</select></label>
        <label>Style<input disabled={!!job} value={scene.voice?.style ?? st.tts_style ?? ''} placeholder="calm, clear and friendly" onChange={e => pl.patch(scene.id, x => ({ ...x, voice: { ...x.voice, style: e.target.value } }))} /></label></div>
      <div className="row tight">{['slower', 'calmer', 'more energetic'].map(x => <button key={x} className={`ghost sm${note === x ? ' on' : ''}`} onClick={() => setNote(n => (n === x ? '' : x))}>{x}</button>)}</div>
      <div className="row tight"><button className="cta sm" disabled={!!job || !scene.narration.trim()} onClick={() => pl.genVoice(scene.id, { note }).catch(() => {})}>{job || (hasVoice(scene) && source === 'ai' ? '↻ Retry voice' : 'Generate voice')}</button><button className="ghost sm" disabled={!!job} onClick={() => pl.prefetchVoices(session.scenes.findIndex(x => x.id === scene.id), true)}>Also make the next {3} in the background</button></div>
      {aiErr && <p className="err" onClick={() => { }}>{aiErr}</p>}
    </>}

    {mode === 'mine' && <>
      <div className="gs-prompter" ref={prompter} dir={rtl ? 'rtl' : 'ltr'}>
        {live.length ? live.map(x => <p key={x.i} data-i={x.i} onClick={() => rec && setAnchor({ i: x.i, t: secs })} title={rec ? 'Click when you start reading this line, the highlight will follow you' : undefined} className={x.i === lineNow ? 'now' : rec && x.i < lineNow ? 'done' : ''}>{x.text}</p>) : <p className="muted">This scene has no script yet. Write the narration in the Script tab.</p>}
      </div>
      {!clip && <div className="row tight">
        {!rec ? <button className="cta sm red" disabled={!scene.narration.trim()} onClick={start}>● Record</button> : <button className="cta sm red" onClick={stop}>■ Stop · {secs.toFixed(1)} s</button>}
        {rec && <span className="gs-meter"><i style={{ width: `${Math.min(100, level * 160)}%` }} /></span>}
        {!rec && <><button className="ghost sm" onClick={() => file.current.click()}>Upload this scene's audio</button><input ref={file} type="file" accept="audio/*,video/*" hidden onChange={pickFile} /></>}
        {!rec && <button className="ghost sm" onClick={onLong}>One recording for the whole video…</button>}
      </div>}
      {clip && <Trimmer clip={clip} busy={saving} narration={scene.narration} onUse={useClip} onDiscard={() => setClip(null)} />}
    </>}
    {err && <p className="err">{err}</p>}

    {hasVoice(scene) && <p className="hint">Take {scene.voice.take || 1} · {scene.voice.duration.toFixed(1)} s · {source === 'mine' ? 'your recording' : 'AI'} · {scene.voice.status}</p>}
    {takes.length > 0 && <details><summary>Earlier takes ({takes.length})</summary>{takes.map(x => <div className="row tight" key={x.fileId}><span>Take {x.take} · {Number(x.duration || 0).toFixed(1)} s {x.source === 'mine' ? '· mine' : ''}</span><button className="ghost sm" disabled={x.fileId === scene.voice?.fileId} onClick={() => pl.useTake(scene.id, x)}>Use this take</button></div>)}</details>}
  </div>
}

// ---------- one long recording for the whole video: cut it into scenes ----------
export function LongRecording({ session, pl, onClose }) {
  const scenes = session.scenes, [clip, setClip] = useState(null), [points, setPoints] = useState([]), [busy, setBusy] = useState(''), [err, setErr] = useState(''), file = useRef(null), audio = useRef(null), [recording, setRecording] = useState(false), mic = useRef(null), [secs, setSecs] = useState(0)
  useEffect(() => { if (!recording) return; const t0 = Date.now(), t = setInterval(() => setSecs((Date.now() - t0) / 1000), 200); return () => clearInterval(t) }, [recording])
  useEffect(() => { dispatchEvent(new CustomEvent('frame-rec', { detail: recording })); return () => dispatchEvent(new CustomEvent('frame-rec', { detail: false })) }, [recording])
  const load = async (blob, name) => { setErr(''); try { const buf = await decode(blob); setClip({ blob, buf, name }); setPoints(splitPoints(mono(buf), buf.sampleRate, scenes.map(s => s.narration))) } catch (e) { setErr(e.message) } }
  const peaks = useMemo(() => (clip ? peaksOf(mono(clip.buf), 1600) : null), [clip]), url = useMemo(() => (clip ? URL.createObjectURL(clip.blob) : ''), [clip]); useEffect(() => () => url && URL.revokeObjectURL(url), [url])
  const apply = async () => {
    setErr('')
    try { for (let i = 0; i < scenes.length; i++) { setBusy(`Saving scene ${i + 1} of ${scenes.length}…`); const cut = sliceToWav(clip.buf, points[i], points[i + 1]), buf = await decode(cut.blob), timeline = alignTimeline(buf.getChannelData(0), buf.sampleRate, scenes[i].narration, cut.duration); await pl.attachVoice(scenes[i].id, { blob: cut.blob, duration: cut.duration, timeline, source: 'mine' }) } setBusy(''); onClose() }
    catch (e) { setErr(e.message); setBusy('') }
  }
  return <div className="modal" onClick={e => e.target === e.currentTarget && !busy && onClose()}><div className="box gs-long">
    <h3>One recording for the whole video</h3>
    <p className="hint">Read the whole script in one go (or upload a file). Frame finds the pauses and cuts it into {scenes.length} scenes. Drag any handle to fix a cut, double-click the wave to listen from there.</p>
    {!clip && <div className="row tight">{!recording ? <button className="cta sm red" onClick={async () => { try { mic.current = await startMic(); setRecording(true); setSecs(0) } catch (e) { setErr(e.message) } }}>● Record everything</button> : <button className="cta sm red" onClick={async () => { const b = await mic.current.stop(); setRecording(false); load(b, 'recording') }}>■ Stop · {secs.toFixed(0)} s</button>}<button className="ghost sm" disabled={recording} onClick={() => file.current.click()}>Upload an audio file</button><input ref={file} type="file" accept="audio/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f, f.name) }} /></div>}
    {recording && <div className="gs-prompter">{scenes.map((s, i) => <p key={s.id}><b>{i + 1}.</b> {s.narration}</p>)}</div>}
    {clip && <><WaveCuts peaks={peaks} duration={clip.buf.duration} points={points} setPoints={setPoints} labels={scenes.map((_, i) => i + 1)} height={120} playAt={t => { audio.current.currentTime = t; audio.current.play() }} /><audio ref={audio} src={url} controls style={{ width: '100%', marginTop: 8 }} />
      <ol className="gs-cutlist">{scenes.map((s, i) => <li key={s.id}><b>{i + 1}</b> {s.heading} <small className="muted">{fmtTime(points[i])} → {fmtTime(points[i + 1])} ({(points[i + 1] - points[i]).toFixed(1)} s)</small></li>)}</ol></>}
    {err && <p className="err">{err}</p>}
    <div className="row tight"><span className="gs-sp" /><button className="ghost sm" disabled={!!busy} onClick={onClose}>Cancel</button>{clip && <button className="ghost sm" disabled={!!busy} onClick={() => setClip(null)}>Start over</button>}{clip && <button className="cta sm" disabled={!!busy} onClick={apply}>{busy || `Cut into ${scenes.length} scenes and save`}</button>}</div>
  </div></div>
}
