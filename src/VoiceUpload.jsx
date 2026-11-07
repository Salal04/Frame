import { useEffect, useRef, useState } from 'react'
import { AUDIO_ACCEPT, VOICE_USES, isAudioFile, fmtT } from './config.js'

// length of an audio file in seconds (null if the browser cannot tell)
export async function audioSeconds(file) {
  const fromTag = await new Promise(res => {
    const a = new Audio(), u = URL.createObjectURL(file), done = x => { URL.revokeObjectURL(u); res(x) }
    a.preload = 'metadata'; a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : null); a.onerror = () => done(null); a.src = u
  })
  if (fromTag) return Math.round(fromTag * 10) / 10
  if (file.size > 150 * 1048576) return null   // a recording from the microphone has no length in its header: decode it (skipped for huge files)
  const ac = new (window.AudioContext || window.webkitAudioContext)()
  try { return Math.round((await ac.decodeAudioData(await file.arrayBuffer())).duration * 10) / 10 } catch { return null } finally { ac.close?.() }
}

// "How Frame uses my recording" (shared by videos and summaries)
export function UseSelect({ value, onChange, disabled }) {
  return <label>How Frame uses my recording<select value={value} disabled={disabled} onChange={ev => onChange(ev.target.value)}>{VOICE_USES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
}

// Record with the microphone or upload an audio file. onPick(file, seconds) decides what happens with it (upload now, or keep until "Add video").
// value = { name, url, seconds } of the recording that is already chosen (or null).
export default function VoiceUpload({ value, onPick, onClear, locked, run, busy = 'Saving your recording…' }) {
  const f = useRef(), rec = useRef(null), [on, setOn] = useState(false), [secs, setSecs] = useState(0), [local, setLocal] = useState('')
  useEffect(() => { if (!on) return; const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t) }, [on])
  useEffect(() => () => { if (local) URL.revokeObjectURL(local) }, [local])
  const take = file => run(busy, async () => {
    if (!isAudioFile(file)) throw new Error(`${file.name} is not an audio file. Use .mp3, .wav, .m4a, .ogg, .webm or .flac.`)
    const s = await audioSeconds(file)
    if (s !== null && s < 1) throw new Error('The recording is too short (under 1 second).')
    await onPick(file, s)
    setLocal(URL.createObjectURL(file))
  })
  const start = () => run('Starting the microphone…', async () => {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), ch = []
    const mr = new MediaRecorder(st); rec.current = mr
    mr.ondataavailable = e => e.data.size && ch.push(e.data)
    mr.onstop = () => {
      st.getTracks().forEach(x => x.stop()); setOn(false)
      const ext = /mp4/.test(mr.mimeType) ? 'm4a' : /ogg/.test(mr.mimeType) ? 'ogg' : 'webm'
      take(new File([new Blob(ch, { type: mr.mimeType || 'audio/webm' })], `my-voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: mr.mimeType || 'audio/webm' }))
    }
    setSecs(0); mr.start(); setOn(true)
  })
  const stop = () => rec.current?.state === 'recording' && rec.current.stop()
  return <div className="voiceup">
    {value
      ? <div className="clip"><div className="clip-h"><b>{value.name || 'my recording'}</b>{value.seconds > 0 && <small className="muted">{fmtT(value.seconds)}</small>}{value.url && <a href={value.url} target="_blank" rel="noreferrer">open</a>}
        {!locked && onClear && <span className="clip-btns"><button className="ghost sm danger" disabled={on} onClick={() => { setLocal(''); onClear() }}>Remove</button></span>}</div>
        {local && <audio controls src={local} />}</div>
      : <p className="muted">No recording yet.</p>}
    {locked
      ? <p className="muted">🔒 The backend has taken this one, so the recording can no longer be changed here.</p>
      : <div className="row tight"><input ref={f} type="file" accept={AUDIO_ACCEPT} hidden onChange={ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) take(x) }} />
        <button className={'ghost sm' + (on ? ' danger' : '')} onClick={on ? stop : start}>{on ? `Stop (${fmtT(secs)})` : '🎙 Record now'}</button>
        <button className="ghost sm" disabled={on} onClick={() => f.current.click()}>{value ? 'Replace with a file' : 'Upload audio file'}</button>
        <small className="muted">.mp3, .wav, .m4a, .ogg, .webm, .flac</small></div>}
  </div>
}
