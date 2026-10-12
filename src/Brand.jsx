import { useState, useEffect } from 'react'
import * as B from './brand.js'
import { setPath } from './config.js'

// Brand: one kit for every playlist and every platform. Upload the logo once, see exactly how it will look
// (channel page and on the video), and the backend burns it into each video and reel.
const initialsOf = n => (String(n || '').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2) || 'F').toUpperCase()
const PREV = [['youtube', 'YouTube'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']]

function useImg(f) {
  const [u, setU] = useState('')
  useEffect(() => { let off = false; setU(''); if (f?.id) B.imageUrl(f.id).then(x => { if (!off) setU(x) }).catch(() => {}); return () => { off = true } }, [f?.id])
  return u
}

// the logo laid over a frame; with no logo uploaded yet, a dashed placeholder shows the size and place
function Wm({ wm, aspect, url, initials }) {
  if (!wm.on) return null
  const st = B.boxStyle(wm, aspect)
  return url ? <img className="wm" src={url} alt="" style={st} /> : <div className="wm ph" style={st}>{initials}</div>
}

export default function Brand({ w, run }) {
  const [s, setS] = useState(null), [b, setB] = useState(null), [ok, setOk] = useState(''), [bg, setBg] = useState('dark'), [zone, setZone] = useState(true)
  useEffect(() => { run('Opening your brand kit…', async () => { const x = await B.loadBrand(w); setS(x); setB(x.b) }) }, [])
  if (!b) return <main className="page"><h2>Brand</h2><p className="muted">Opening your brand kit…</p></main>

  const up = (path, v) => { setB(setPath(b, path, v)); setOk('') }
  const save = next => run('Saving your brand kit…', async () => { await B.saveBrand(w, s, next); setB(next); setOk('Saved to Frame AI / Brand / brand.json') })
  const pick = slot => e => {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    run(`Uploading ${f.name}…`, async () => {
      if (slot.kind === 'image' && !f.type.startsWith('image/')) throw new Error(`${slot.name} must be a picture (PNG is best).`)
      if (slot.kind === 'video' && !f.type.startsWith('video/')) throw new Error(`${slot.name} must be a video clip.`)
      if (f.size > 200 * 1048576) throw new Error('That file is over 200 MB. Use a smaller one.')
      const meta = await B.setSlot(w, slot, f, b.files[slot.id]), next = { ...b, files: { ...b.files, [slot.id]: meta } }
      await B.saveBrand(w, s, next); setB(next); setOk('Saved to Frame AI / Brand / brand.json')
    })
  }
  const drop = slot => run(`Removing ${slot.name}…`, async () => {
    await B.dropFile(b.files[slot.id])
    const files = { ...b.files }; delete files[slot.id]
    const next = { ...b, files, extras: B.EXTRAS.some(e => e[0] === slot.id) ? { ...b.extras, [slot.id]: false } : b.extras, watermark: { video: { ...b.watermark.video, use: b.watermark.video.use === slot.id ? 'logo' : b.watermark.video.use }, reel: { ...b.watermark.reel, use: b.watermark.reel.use === slot.id ? 'logo' : b.watermark.reel.use } } }
    await B.saveBrand(w, s, next); setB(next); setOk('Saved to Frame AI / Brand / brand.json')
  })

  return <main className="page"><h2>Brand</h2>
    <p className="muted">One brand kit for every playlist and every platform. Upload the logo and pictures once; Frame AI shows how they will look, and the backend puts the logo on each video and reel. Saved in <b>Frame AI / Brand</b> in your Drive. Files you keep inside one playlist (the Assets tab) are untouched.</p>

    <h3>How it looks</h3>
    <ChannelPreview b={b} />

    <h3>Name and colours</h3>
    <div className="panel">
      <div className="cols">
        <label>Channel / brand name<input value={b.identity.name} onChange={e => up('identity.name', e.target.value)} placeholder="e.g. Frame AI" /></label>
        <label>Tagline (short bio)<input value={b.identity.tagline} onChange={e => up('identity.tagline', e.target.value)} placeholder="e.g. Learn AI the easy way" /></label>
        <label>Call to action<input value={b.identity.cta} onChange={e => up('identity.cta', e.target.value)} placeholder="e.g. Subscribe for a new video every day" /></label>
        <div className="colorrow"><label>Main colour<input type="color" value={b.identity.primary} onChange={e => up('identity.primary', e.target.value)} /></label>
          <label>Accent colour<input type="color" value={b.identity.accent} onChange={e => up('identity.accent', e.target.value)} /></label></div></div>
      <h4>Handles</h4>
      <div className="cols">{PREV.map(([k, l]) => <label key={k}>{l}<input value={b.handles[k]} onChange={e => up(`handles.${k}`, e.target.value)} placeholder="@yourhandle" /></label>)}</div></div>

    <h3>Files</h3>
    <div className="slots">{B.SLOTS.map(slot => <SlotCard key={slot.id} slot={slot} file={b.files[slot.id]} onPick={pick(slot)} onRemove={() => drop(slot)} />)}</div>

    <h3>Your logo on the video</h3>
    <p className="muted">Click a square to choose the corner. Check it on a dark, light and busy picture, because a logo that disappears on one of them is not working.</p>
    <div className="row tight"><div className="seg tabs" style={{ margin: 0 }}>{[['dark', 'Dark'], ['light', 'Light'], ['busy', 'Busy']].map(([k, l]) => <button key={k} className={bg === k ? 'on' : ''} onClick={() => setBg(k)}>{l}</button>)}</div>
      <label className="chk"><input type="checkbox" checked={zone} onChange={e => setZone(e.target.checked)} />Show where the app buttons cover a reel</label></div>
    <div className="wmcols">
      <Placement kind="video" title="Complete videos (16:9)" b={b} bg={bg} up={up} />
      <Placement kind="reel" title="Reels (9:16)" b={b} bg={bg} up={up} zone={zone} /></div>
    <p className="hint">The reel position is used for YouTube Shorts, Facebook Reels, Instagram and TikTok. The red areas are only a guide: each app moves its buttons and captions a little.</p>

    <h3>Also add to complete videos</h3>
    <div className="panel">{B.EXTRAS.map(([k, l]) => <label className="chk" key={k}><input type="checkbox" checked={!!b.extras[k] && !!b.files[k]} disabled={!b.files[k]} onChange={e => up(`extras.${k}`, e.target.checked)} />{l}{!b.files[k] && <small className="muted"> (upload it in Files first)</small>}</label>)}</div>

    <div className="row"><button className="cta sm" onClick={() => save(b)}>Save brand kit</button>{ok && <span className="ok">{ok}</span>}
      <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${w.brand.folderId}`}>Open Brand folder</a></div>
    <p className="hint">For the backend: <b>brand.json</b> holds the Drive id of every file, plus a <b>backend</b> block with the logo placement already worked out as ffmpeg overlay expressions for videos and for reels. Uploading a file saves straight away; the other edits need Save brand kit.</p>
  </main>
}

function SlotCard({ slot, file, onPick, onRemove }) {
  const url = useImg(slot.kind === 'image' ? file : null)
  return <div className="slot">
    <div className="slot-art">{url ? <img src={url} alt={slot.name} /> : <span className="muted">{file ? (slot.kind === 'video' ? 'Clip saved' : 'Loading…') : 'Nothing yet'}</span>}</div>
    <b>{slot.name}</b><small className="muted">{slot.hint}</small>
    {file && <small>{file.name}{file.link && <> · <a href={file.link} target="_blank" rel="noreferrer">open</a></>}</small>}
    <div className="row tight"><label className="ghost sm">{file ? 'Replace' : 'Upload'}<input type="file" hidden accept={slot.accept} onChange={onPick} /></label>
      {file && <button className="ghost sm danger" onClick={onRemove}>Remove</button>}</div></div>
}

// ---------------------------------------------------------------- the channel page, as each platform would show it
function ChannelPreview({ b }) {
  const [pf, setPf] = useState('youtube')
  const f = b.files, id = b.identity, avatar = useImg(f.avatar), banner = useImg(f.banner)
  const vUrl = useImg(f[b.watermark.video.use] || f.logo), rUrl = useImg(f[b.watermark.reel.use] || f.logo)
  const name = id.name || 'Your channel name', handle = '@' + (b.handles[pf] || 'yourhandle').replace(/^@/, ''), ini = initialsOf(id.name)
  const cover = pf === 'youtube' || pf === 'facebook', vertical = pf === 'tiktok' || pf === 'instagram'
  const art = banner ? { backgroundImage: `url(${banner})` } : { background: `linear-gradient(120deg, ${id.primary}, ${id.accent})` }
  const tile = i => ({ background: `linear-gradient(${135 + i * 40}deg, ${i % 2 ? id.accent : id.primary}, ${i % 2 ? id.primary : '#2a2550'})` })
  const wm = vertical ? b.watermark.reel : b.watermark.video   // Instagram and TikTok show vertical reels, YouTube and Facebook show wide videos
  return <div>
    <div className="seg tabs" style={{ marginBottom: 12 }}>{PREV.map(([k, l]) => <button key={k} className={pf === k ? 'on' : ''} onClick={() => setPf(k)}>{l}</button>)}</div>
    <div className="pv">
      {cover && <div className="pv-banner" style={art} />}
      <div className={'pv-head' + (cover ? '' : ' flat')}>
        <div className="avatar">{avatar ? <img src={avatar} alt="" /> : <span>{ini}</span>}</div>
        <div><div className="pv-name">{name}</div><div className="pv-sub">{handle}</div>{id.tagline && <div className="pv-sub">{id.tagline}</div>}</div>
        <span className="pv-btn">{pf === 'youtube' ? 'Subscribe' : 'Follow'}</span></div>
      <div className="pv-tiles">{[0, 1, 2].map(i => <div key={i} className={'tile ' + (vertical ? 'v' : 'h')} style={tile(i)}>
        <Wm wm={wm} aspect={vertical ? 9 / 16 : 16 / 9} url={vertical ? rUrl : vUrl} initials={ini} />
        <span className="t">{vertical ? `Reel ${i + 1}` : `Video title ${i + 1}`}</span></div>)}</div></div>
    <small className="hint">A preview only. Each platform shows the picture and the name you set up on that platform; this is to check they look right together.</small>
  </div>
}

// ---------------------------------------------------------------- where the logo goes (complete videos or reels)
function Placement({ kind, title, b, bg, up, zone }) {
  const wm = b.watermark[kind], base = `watermark.${kind}`, url = useImg(b.files[wm.use] || b.files.logo), vertical = kind === 'reel', ini = initialsOf(b.identity.name)
  const aspect = vertical ? 9 / 16 : 16 / 9
  return <div className="panel">
    <label className="chk"><input type="checkbox" checked={wm.on} onChange={e => up(`${base}.on`, e.target.checked)} /><b>{title}</b></label>
    <div className={`frame ${vertical ? 'v' : 'h'} bg-${bg}`}>
      <div className="frame-art">{vertical ? 'Reel' : 'Your video'}</div>
      {zone && vertical && <><i className="zone t" /><i className="zone r" /><i className="zone b" /></>}
      <Wm wm={wm} aspect={aspect} url={url} initials={ini} /></div>
    <div className="ctl">
      <div className="inl"><div className="posgrid">{B.POS.map(p => <button key={p} className={wm.pos === p ? 'on' : ''} aria-label={B.POS_NAME[p]} title={B.POS_NAME[p]} onClick={() => up(`${base}.pos`, p)} />)}</div><span className="muted">{B.POS_NAME[wm.pos]}</span></div>
      <label>Size: {wm.size}% of the width<input type="range" min="4" max="50" value={wm.size} onChange={e => up(`${base}.size`, +e.target.value)} /></label>
      <label>Opacity: {wm.opacity}%<input type="range" min="10" max="100" value={wm.opacity} onChange={e => up(`${base}.opacity`, +e.target.value)} /></label>
      <label>Distance from the edge: {wm.margin}%<input type="range" min="0" max="15" value={wm.margin} onChange={e => up(`${base}.margin`, +e.target.value)} /></label>
      <label>When it shows<select value={wm.when} onChange={e => up(`${base}.when`, e.target.value)}><option value="always">The whole video</option><option value="first">Only at the start</option><option value="last">Only at the end</option></select></label>
      {wm.when !== 'always' && <label>Seconds<input type="number" min="1" max="60" value={wm.seconds} onChange={e => up(`${base}.seconds`, +e.target.value || 1)} /></label>}
      {b.files.logoAlt && <label>Which logo<select value={wm.use} onChange={e => up(`${base}.use`, e.target.value)}><option value="logo">Main logo</option><option value="logoAlt">Alternate logo</option></select></label>}
    </div></div>
}
