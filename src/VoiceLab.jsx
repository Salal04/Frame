import { useRef, useState, useEffect } from 'react'
import * as P from './playlist.js'
import { CONSENT, CUSTOM_VOICE_MODELS, SAMPLE, csv } from './config.js'
import { toWav24k, createVoice, deleteVoice, SRC_MIN, SRC_MAX } from './voiceClone.js'
import { previewVoice } from './tts.js'

// One recording: the person records with the microphone or uploads a file. It is turned into a 24 kHz WAV right here in the browser.
function AudioInput({ title, hint, max, value, onValue, run }) {
  const f = useRef(), rec = useRef(null), [on, setOn] = useState(false), [secs, setSecs] = useState(0)
  useEffect(() => { if (!on) return; const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t) }, [on])
  const take = file => run('Preparing the recording…', async () => onValue(await toWav24k(file, max)))
  const start = () => run('Starting the microphone…', async () => {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), ch = []
    const mr = new MediaRecorder(st); rec.current = mr
    mr.ondataavailable = e => e.data.size && ch.push(e.data)
    mr.onstop = () => { st.getTracks().forEach(x => x.stop()); setOn(false); take(new File([new Blob(ch, { type: mr.mimeType })], 'rec')) }
    setSecs(0); mr.start(); setOn(true)
  })
  const stop = () => rec.current?.state === 'recording' && rec.current.stop()
  useEffect(() => { if (on && secs >= max) stop() }, [secs])   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="panel vl-in"><h4>{title}</h4><small className="hint">{hint}</small>
    <div className="row tight"><input ref={f} type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" hidden onChange={e => { const x = e.target.files[0]; e.target.value = ''; if (x) take(x) }} />
      <button className={'ghost sm' + (on ? ' danger' : '')} onClick={on ? stop : start}>{on ? `Stop (${secs}s)` : 'Record now'}</button>
      <button className="ghost sm" disabled={on} onClick={() => f.current.click()}>Upload audio file</button>
      {value && <button className="ghost sm" onClick={() => onValue(null)}>Clear</button>}</div>
    {value && <><audio controls src={value.url} /><small className={'hint ' + (value.seconds < (title.startsWith('1') ? SRC_MIN : 2) ? 'bad' : 'ok')}>{value.seconds.toFixed(1)} s ready{value.fullSeconds > value.seconds + 0.5 ? ` (cut to the first ${max} s)` : ''}</small></>}
  </div>
}

// "My voices": record your voice + the consent sentence, Gemini returns an ID, the ID is saved and used by the backend.
export default function VoiceLab({ gl, cfg, current, onUse, run }) {
  const g = gl.cfg, [list, setList] = useState(g.my_voices || []), [name, setName] = useState(''), [lang, setLang] = useState('en-US')
  const [src, setSrc] = useState(null), [con, setCon] = useState(null), [ok, setOk] = useState(false), [url, setUrl] = useState(''), [now, setNow] = useState(''), au = useRef()
  const key = csv(g.keys.tts)[0] || csv(g.keys.gemini)[0], models = csv(g.models.tts).filter(CUSTOM_VOICE_MODELS), model = models[0] || 'gemini-3.8-flash-tts'
  useEffect(() => { if (url && au.current) au.current.play().catch(() => {}) }, [url])
  const persist = next => run('Saving your voices…', async () => { await P.saveGlobal(gl, { ...gl.cfg, my_voices: next }); setList(next); return true })
  const ready = name.trim() && src && src.seconds >= SRC_MIN && con && con.seconds >= 2 && ok
  const make = () => run('Gemini is checking your consent and building your voice…', async () => {
    const r = await createVoice({ key, model, name: name.trim(), source: src, consent: con })
    const next = [...list, { id: r.id, name: name.trim(), model, lang, created: new Date().toISOString().slice(0, 10) }]
    await P.saveGlobal(gl, { ...gl.cfg, my_voices: next }); setList(next); setSrc(null); setCon(null); setOk(false); setName(''); onUse(r.id)
  })
  const hear = v => run(`${v.name} is warming up…`, async () => {
    const u = await previewVoice({ key, models: [v.model, ...models].filter(Boolean), voice: v.id, style: 'natural', text: SAMPLE[cfg.language] || SAMPLE.en }); setUrl(u); setNow(v.id)
  })
  const del = v => run('Deleting the voice at Gemini…', async () => { await deleteVoice({ key, id: v.id }); const next = list.filter(x => x.id !== v.id); await P.saveGlobal(gl, { ...gl.cfg, my_voices: next }); setList(next); if (current === v.id) onUse('') })
  return <div className="vlab">
    <audio ref={au} src={url} onEnded={() => setNow('')} hidden />
    <h4>My voices</h4>
    {!list.length && <p className="muted">No voice of your own yet. Make one below: it takes two short recordings.</p>}
    <div className="voices">{list.map(v => <div key={v.id} className={'voice' + (current === v.id ? ' on' : '')}>
      <b>{v.name}</b><span className="tone">my voice</span><small className="mono">{v.id}</small>
      <div className="row tight"><button className="ghost sm" onClick={() => hear(v)}>{now === v.id ? 'Playing…' : 'Hear'}</button>
        <button className={current === v.id ? 'cta sm' : 'ghost sm'} onClick={() => onUse(v.id)}>{current === v.id ? 'Chosen' : 'Choose'}</button>
        <button className="ghost sm danger" onClick={() => del(v)}>Delete</button></div></div>)}</div>
    <h4>Make my voice</h4>
    <p className="hint">Your recordings go to Gemini once. Gemini checks that it is really you, keeps the voice in <b>your</b> Gemini project and gives back an ID. Frame saves only that ID (in the Control-room config), never the recordings. Needs a Paid-Tier Gemini key and a gemini-3.8 TTS model ({model}).</p>
    <label>Name for this voice<input value={name} maxLength={60} placeholder="e.g. My teaching voice" onChange={e => setName(e.target.value)} /></label>
    <AudioInput title="1. Voice sample" hint={`${SRC_MIN} to ${SRC_MAX} seconds of you talking naturally, in a quiet room. Longer files are cut to ${SRC_MAX} s.`} max={SRC_MAX} value={src} onValue={setSrc} run={run} />
    <label>Consent sentence language<select value={lang} onChange={e => setLang(e.target.value)}>{Object.entries(CONSENT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      <small className="hint">Urdu is not a supported consent language: read the English or Hindi sentence. Your videos can still be narrated in Urdu.</small></label>
    <blockquote className="consent" dir={lang === 'ar-XA' ? 'rtl' : 'ltr'}>{CONSENT[lang][1]}</blockquote>
    <AudioInput title="2. Consent recording" hint="Read the sentence above out loud, exactly as written. Use the same microphone and room as the sample." max={20} value={con} onValue={setCon} run={run} />
    <label className="chk"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />This is my own voice, I am an adult, and I agree that Google creates a synthetic voice model from it.</label>
    <div className="row tight"><button className="cta sm" disabled={!ready} onClick={make}>Send to Gemini and get my voice ID</button></div>
    {!key && <p className="bad">No Gemini key yet. Add one in the Control room first.</p>}
  </div>
}
