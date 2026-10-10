import { useState, useEffect, useRef } from 'react'
import * as P from './playlist.js'
import { VOICES, STYLE_PRESETS, PROJECT_FIELDS, GLOBAL_FIELDS, GLOBAL_DEFAULTS, LIST_PATHS, LIST_INFO, SAMPLE, csv, getPath, setPath, ttsNote } from './config.js'
import { previewVoice } from './tts.js'
import Robot from './Robot.jsx'

// ---------- one generic input: [path, label, type, hint, options] ----------
function Field({ d, value, onChange }) {
  const [, label, type, hint, opts] = d
  if (type === 'bool') return <label className="chk"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />{label}</label>
  return <label>{label}
    {type === 'select'
      ? <select value={value ?? ''} onChange={e => onChange(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      : <input type={type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)} />}
    {hint && <small className="hint">{hint}</small>}</label>
}

// ---------- playlist defaults (project_config.json) ----------
export function ProjectSettings({ cfg, save, run }) {
  const [d, setD] = useState(cfg), [ok, setOk] = useState(false)
  return <section><p className="muted">Starting point for every video in this playlist. A video row can override the main ones.</p>
    <div className="cols">{PROJECT_FIELDS.map(f => <Field key={f[0]} d={f} value={d[f[0]]} onChange={v => { setD({ ...d, [f[0]]: v }); setOk(false) }} />)}</div>
    <button className="cta sm" onClick={() => run('Saving playlist settings…', async () => { await save(d); setOk(true) })}>Save settings</button>
    {ok && <p className="ok">Saved to project_config.json</p>}</section>
}

// ---------- narrator: one voice + one tone + one TTS model for the whole playlist ----------
export function Narrator({ cfg, save, g, run }) {
  const keep = ['voice', 'tts_style', 'tts_engine', 'tts_model', 'tts_strict', 'cloud_voices']
  const [n, setN] = useState(() => Object.fromEntries(keep.map(k => [k, cfg[k]]))), [q, setQ] = useState(''), [url, setUrl] = useState(''), [now, setNow] = useState(''), [ok, setOk] = useState(false)
  const au = useRef(), set = k => v => { setN({ ...n, [k]: v }); setOk(false) }
  const key = csv(g.keys.tts)[0] || csv(g.keys.gemini)[0], models = [...new Set([n.tts_model, ...csv(g.models.tts)].filter(Boolean))]
  const hear = voice => run(`${voice} is warming up…`, async () => {
    if (!key) throw new Error('Add a Gemini key in the Control room first.')
    const u = await previewVoice({ key, models, voice, style: n.tts_style, text: SAMPLE[cfg.language] || SAMPLE.en })
    setUrl(u); setNow(voice)
  })
  useEffect(() => { if (url && au.current) au.current.play().catch(() => {}) }, [url])
  const list = VOICES.filter(v => v.join(' ').toLowerCase().includes(q.toLowerCase()))
  return <section>
    <div className="narr-head"><Robot mood={now ? 'talk' : 'idle'} size={84} /><div><h3>Narrator for this playlist</h3>
      <p className="muted">Pick once and every video sounds the same. Press Hear to test it with your own key.</p></div></div>
    <audio ref={au} src={url} onEnded={() => setNow('')} hidden />
    <label>Tone of delivery<input value={n.tts_style} onChange={e => set('tts_style')(e.target.value)} /></label>
    <div className="chips">{STYLE_PRESETS.map(s => <button key={s} className={'chip' + (n.tts_style === s ? ' on' : '')} onClick={() => set('tts_style')(s)}>{s}</button>)}</div>
    <h3>Voice: <span className="pick">{n.voice}</span></h3>
    <input placeholder="Search voices by name or tone, e.g. warm" value={q} onChange={e => setQ(e.target.value)} />
    <div className="voices">{list.map(([name, tone, feel]) => <div key={name} className={'voice' + (n.voice === name ? ' on' : '')}>
      <b>{name}</b><span className="tone">{tone}</span><small>{feel}</small>
      <div className="row tight"><button className="ghost sm" onClick={() => hear(name)}>{now === name ? 'Playing…' : 'Hear'}</button><button className={n.voice === name ? 'cta sm' : 'ghost sm'} onClick={() => set('voice')(name)}>{n.voice === name ? 'Chosen' : 'Choose'}</button></div></div>)}
      {!list.length && <p className="muted">No voice matches that.</p>}</div>
    <h3>Speech model</h3>
    <p className="muted">The same voice name sounds slightly different on each model. Pin one so the whole playlist matches.</p>
    <div className="models">
      <label className={'model' + (!n.tts_model ? ' on' : '')}><input type="radio" name="m" checked={!n.tts_model} onChange={() => set('tts_model')('')} /><b>Automatic</b><small>First model in your list that has quota left</small></label>
      {csv(g.models.tts).map(m => <label key={m} className={'model' + (n.tts_model === m ? ' on' : '')}><input type="radio" name="m" checked={n.tts_model === m} onChange={() => set('tts_model')(m)} /><b>{m}</b><small>{ttsNote(m)}</small></label>)}</div>
    <label className="chk"><input type="checkbox" checked={!!n.tts_strict} onChange={e => set('tts_strict')(e.target.checked)} />Never fall back to another model (voice stays identical, but a run stops when this model is out of quota)</label>
    <div className="cols"><label>Speech engine<select value={n.tts_engine} onChange={e => set('tts_engine')(e.target.value)}>{[['auto', 'Auto: Gemini, then Cloud TTS'], ['gemini', 'Gemini only'], ['cloud', 'Cloud TTS only']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Cloud TTS voices<input value={n.cloud_voices} placeholder="Empty = default for the language" onChange={e => set('cloud_voices')(e.target.value)} /></label></div>
    <button className="cta sm" onClick={() => run('Saving narrator…', async () => { await save({ ...cfg, ...n }); setOk(true) })}>Save narrator</button>
    {ok && <p className="ok">Narrator saved. New videos use it.</p>}</section>
}

// ---------- thumbnails ----------
const FONTS = ['Fredoka', 'Noto Naskh Arabic', 'Arial']
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'thumb'
function drawThumb(cv, img, text, t) {
  const W = 1280, H = 720, c = cv.getContext('2d'); cv.width = W; cv.height = H
  if (img) { const s = Math.max(W / img.width, H / img.height); c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s) }
  else { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#8aa0ff'); g.addColorStop(1, '#ffb59a'); c.fillStyle = g; c.fillRect(0, 0, W, H) }
  if (t.shade) { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(32,26,76,.7)'); g.addColorStop(1, 'rgba(32,26,76,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H) }
  c.font = `700 ${t.size}px "${t.font}", sans-serif`; c.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr'; c.textAlign = t.align; c.textBaseline = 'middle'
  const mw = W * t.maxWidth / 100, lines = []; let cur = ''
  for (const w of text.split(/\s+/)) { const tr = cur ? cur + ' ' + w : w; if (c.measureText(tr).width > mw && cur) { lines.push(cur); cur = w } else cur = tr }
  if (cur) lines.push(cur)
  const lh = t.size * 1.18, y0 = H * t.y / 100 - (lines.length - 1) * lh / 2, x = W * t.x / 100
  c.lineJoin = 'round'; c.lineWidth = t.size * .16; c.strokeStyle = t.stroke; c.fillStyle = t.color
  lines.forEach((l, i) => { c.strokeText(l, x, y0 + i * lh); c.fillText(l, x, y0 + i * lh) })
}

export function ThumbStudio({ p, cfg, save, rows, setRows, run, focus }) {
  const first = rows.find(r => r.row === +focus) || rows[0]
  const [th, setTh] = useState(cfg.thumb), [sel, setSel] = useState(first?.row || ''), [txt, setTxt] = useState(first?.thumbText || first?.title || ''), [img, setImg] = useState(null)
  const cv = useRef(), f = useRef(), row = rows.find(r => r.row === +sel), text = txt || 'Your video title'
  const pickRow = v => { setSel(v); const r = rows.find(x => x.row === +v); setTxt(r?.thumbText || r?.title || '') }
  const set = k => v => setTh({ ...th, [k]: v })
  useEffect(() => {
    let live = true, u
    if (!th.templateId) { setImg(null); return }
    P.fileBlobUrl(th.templateId).then(async x => { u = x; const i = new Image(); i.src = x; await i.decode(); live && setImg(i) }).catch(() => live && setImg(null))
    return () => { live = false; u && URL.revokeObjectURL(u) }
  }, [th.templateId])
  useEffect(() => {
    let live = true
    ;(async () => { try { await document.fonts.load(`700 ${th.size}px "${th.font}"`) } catch { /* font missing: canvas falls back */ } live && cv.current && drawThumb(cv.current, img, text, th) })()
    return () => { live = false }
  }, [img, text, th])
  const upload = e => { const x = e.target.files[0]; e.target.value = ''; if (x) run('Uploading template…', async () => { const t = { ...th, ...await P.uploadTemplate(p, x) }; setTh(t); await save({ ...cfg, thumb: t }) }) }
  const toDrive = () => run('Saving thumbnail to Drive…', async () => {
    if (!row) throw new Error('Pick a video first.')
    const b = await new Promise(r => cv.current.toBlob(r, 'image/png'))
    const link = await P.saveThumb(p, b, `${String(row.order || row.row).padStart(2, '0')}-${slug(row.title)}.png`)
    await P.saveVideo(p, { ...row, thumbText: txt, thumbLink: link }); setRows(await P.loadVideos(p))
  })
  const slider = (k, label, min, max) => <label>{label}: {th[k]}<input type="range" min={min} max={max} value={th[k]} onChange={e => set(k)(+e.target.value)} /></label>
  return <section className="thumb">
    <div><canvas ref={cv} className="canvas" aria-label="Thumbnail preview" />
      <div className="row"><button className="cta sm" onClick={toDrive}>Save to Drive and sheet</button>
        <button className="ghost" onClick={() => { const a = document.createElement('a'); a.href = cv.current.toDataURL('image/png'); a.download = `${slug(text)}.png`; a.click() }}>Download PNG</button></div></div>
    <div>
      <label>Video<select value={sel} onChange={e => pickRow(e.target.value)}>{!rows.length && <option value="">Add a video first</option>}{rows.map(r => <option key={r.row} value={r.row}>{r.order || r.row}. {r.title}</option>)}</select></label>
      <label>Text on thumbnail<input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Empty = video title" /></label>
      <div className="row"><input ref={f} type="file" accept="image/*" hidden onChange={upload} /><button className="ghost" onClick={() => f.current.click()}>{th.templateId ? 'Change template' : 'Upload template'}</button><small className="muted">{th.templateName || 'No template yet: a clay gradient is used'}</small></div>
      <label>Font<select value={th.font} onChange={e => set('font')(e.target.value)}>{FONTS.map(x => <option key={x}>{x}</option>)}</select></label>
      {slider('size', 'Text size', 40, 220)}{slider('x', 'Horizontal position (%)', 0, 100)}{slider('y', 'Vertical position (%)', 5, 95)}{slider('maxWidth', 'Line width (%)', 20, 95)}
      <div className="row"><label>Text colour<input type="color" value={th.color} onChange={e => set('color')(e.target.value)} /></label><label>Outline<input type="color" value={th.stroke} onChange={e => set('stroke')(e.target.value)} /></label>
        <label>Align<select value={th.align} onChange={e => set('align')(e.target.value)}>{['left', 'center', 'right'].map(x => <option key={x}>{x}</option>)}</select></label></div>
      <label className="chk"><input type="checkbox" checked={th.shade} onChange={e => set('shade')(e.target.checked)} />Dark fade behind the text</label>
      <button className="ghost" onClick={() => run('Saving style…', () => save({ ...cfg, thumb: th }))}>Save as this playlist’s style</button></div></section>
}

// ---------- Control room: global config file ----------
export function ControlRoom({ g, run }) {
  const init = () => { let d = structuredClone(g.cfg); LIST_PATHS.forEach(p => { d = setPath(d, p, getPath(d, p).join('\n')) }); return d }
  const [d, setD] = useState(init), [show, setShow] = useState(false), [ok, setOk] = useState(false)
  const put = (p, v) => { setD(setPath(d, p, v)); setOk(false) }
  const out = () => { let o = structuredClone(d); LIST_PATHS.forEach(p => { o = setPath(o, p, csv(getPath(o, p))) }); return o }
  const list = p => <label key={p}>{LIST_INFO[p][0]}<textarea rows={p.startsWith('keys') ? 3 : 5} className={p.startsWith('keys') && !show ? 'secret' : ''} spellCheck="false" value={getPath(d, p)} onChange={e => put(p, e.target.value)} /><small className="hint">{LIST_INFO[p][1]}</small></label>
  return <main className="page"><h2>Control room</h2>
    <p className="muted">These settings apply to every playlist. They live in <b>Frame AI Config / frame_config.json</b> in your Drive, a private folder outside the shared one.</p>
    <h3>Keys</h3>{['keys.gemini', 'keys.tts', 'keys.cloudTts'].map(list)}
    <label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show keys</label>
    <h3>Models</h3><div className="cols">{LIST_PATHS.filter(p => p.startsWith('models')).map(list)}</div>
    <button className="ghost" onClick={() => { let n = d; LIST_PATHS.filter(p => p.startsWith('models')).forEach(p => { n = setPath(n, p, getPath(GLOBAL_DEFAULTS, p).join('\n')) }); setD(n); setOk(false) }}>Reset model lists to defaults</button>
    {GLOBAL_FIELDS.map(([title, fs]) => <div key={title}><h3>{title}</h3><div className="cols">{fs.map(f => <Field key={f[0]} d={f} value={getPath(d, f[0])} onChange={v => put(f[0], v)} />)}</div></div>)}
    <div className="row"><button className="cta sm" onClick={() => run('Saving config to Drive…', async () => { await P.saveGlobal(g, out()); setOk(true) })}>Save config</button></div>
    {ok && <p className="ok">Saved to frame_config.json</p>}</main>
}
