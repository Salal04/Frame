import { useState, useEffect, useMemo } from 'react'
import * as S from './social.js'
import * as X from './socialPlan.js'
import * as P from './playlist.js'
import { csv } from './config.js'

// Review window for ONE upload: edit title / description / tags / caption / thumbnail, see the picture in every shape,
// see how the post will read on the platform, and run the pre-upload checklist.
// Used twice: before items are added to the schedule (mode "draft") and on items that are already planned (mode "saved").

const SHAPES = [['16:9', 'Wide 16:9', 'YouTube and Facebook video'], ['9:16', 'Vertical 9:16', 'Shorts, Reels, TikTok'], ['1:1', 'Square 1:1', 'Feed post'], ['4:5', 'Portrait 4:5', 'Instagram / Facebook feed']]
const ICON = { ok: '✓', info: 'ℹ', warn: '⚠', bad: '✕' }
const FOLD = { instagram: 125, tiktok: 100, facebook: 140 }   // characters people see before “more”

export const headline = it => it.platform === 'youtube' ? (it.title || it.video?.title || '') : ((it.caption || '').split('\n')[0].slice(0, 80) || it.video?.title || '')
export const labelOf = it => { const Pf = X.platformOf(it.platform); return it.kind === 'video' ? `${Pf.name} video` : `${Pf.name} ${Pf.reelName.toLowerCase()} ${it.reel?.part}/${it.reel?.of}` }

export function IssueChip({ list }) {
  const bad = list.filter(x => x.level === 'bad'), warn = list.filter(x => x.level === 'warn'), n = bad.length + warn.length
  if (!n) return <span className="chip-s ok" title="Nothing to fix">✓ Ready</span>
  return <span className={'chip-s' + (bad.length ? ' late' : '')} title={[...bad, ...warn].map(x => x.text).join('\n')}>{bad.length ? '✕' : '⚠'} {n} to check</span>
}

export function ReviewRow({ e, connected, onOpen }) {
  const it = e.item, list = X.checkItem(it, { connected, date: e.date })
  return <div className="irow"><span className="chip-s">{labelOf(it)}</span>
    <div className="grow"><b>{headline(it)}</b><small className="muted"> · {X.niceDay(e.date)}{it.edited ? ' · edited' : ''}</small></div>
    <IssueChip list={list} /><button className="ghost sm" onClick={onOpen}>Review</button></div>
}

// ---------------------------------------------------------------- picture helpers
const cache = new Map()   // Drive file id -> decoded image
async function driveImage(id) {
  if (cache.has(id)) return cache.get(id)
  const u = await P.fileBlobUrl(id), im = new Image(); im.src = u; await im.decode(); cache.set(id, im); return im
}
// same drawing as the Thumbnails tab, so the preview matches what the backend writes. No text = just the picture.
function drawThumb(cv, img, text, t) {
  const W = 1280, H = 720, c = cv.getContext('2d'); cv.width = W; cv.height = H
  if (img) { const s = Math.max(W / img.width, H / img.height); c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s) }
  else { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#8aa0ff'); g.addColorStop(1, '#ffb59a'); c.fillStyle = g; c.fillRect(0, 0, W, H) }
  if (!text) return
  if (t.shade) { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(32,26,76,.7)'); g.addColorStop(1, 'rgba(32,26,76,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H) }
  c.font = `700 ${t.size}px "${t.font}", sans-serif`; c.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr'; c.textAlign = t.align; c.textBaseline = 'middle'
  const mw = W * t.maxWidth / 100, lines = []; let cur = ''
  for (const w of text.split(/\s+/)) { const tr = cur ? cur + ' ' + w : w; if (c.measureText(tr).width > mw && cur) { lines.push(cur); cur = w } else cur = tr }
  if (cur) lines.push(cur)
  const lh = t.size * 1.18, y0 = H * t.y / 100 - (lines.length - 1) * lh / 2, x = W * t.x / 100
  c.lineJoin = 'round'; c.lineWidth = t.size * .16; c.strokeStyle = t.stroke; c.fillStyle = t.color
  lines.forEach((l, i) => { c.strokeText(l, x, y0 + i * lh); c.fillText(l, x, y0 + i * lh) })
}
async function renderThumb(th, title) {
  const cv = document.createElement('canvas'), st = { font: th?.font || 'Fredoka', size: th?.size || 110, color: th?.color || '#ffffff', stroke: th?.stroke || '#2a2550', align: th?.align || 'left', x: th?.x ?? 6, y: th?.y ?? 50, maxWidth: th?.max_width || 58, shade: th?.shade !== false }
  try { await document.fonts.load(`700 ${st.size}px "${st.font}"`) } catch { /* the canvas falls back to a default font */ }
  let note = ''
  if (th?.source === 'video') {
    const id = X.fileIdOf(th.url); if (!id) throw new Error('This thumbnail link is not a Drive file, so it cannot be previewed here.')
    drawThumb(cv, await driveImage(id), '', st)
  } else {
    let img = null
    if (th?.template_file_id) { try { img = await driveImage(th.template_file_id) } catch { note = 'The project template could not be opened here, so a plain background is shown.' } }
    drawThumb(cv, img, th ? (th.title_text || title) : title, st)
  }
  return { url: cv.toDataURL('image/jpeg', .88), note }
}
function useThumb(th, title) {
  const [s, setS] = useState({ url: '', note: '', busy: true }), key = JSON.stringify([th, th?.source === 'video' ? '' : title])
  useEffect(() => {
    let live = true; setS(x => ({ ...x, busy: true }))
    renderThumb(th, title).then(r => live && setS({ ...r, busy: false }))
      .catch(async e => { const r = await renderThumb(null, title).catch(() => ({ url: '' })); live && setS({ url: r.url, note: `${e.message || 'Could not open the picture'} A stand-in picture is shown. (This app can only open files it created.)`, busy: false }) })
    return () => { live = false }
  }, [key])
  return s
}
// the picture re-cut to the shape of the finished video, so “wide picture in a vertical frame” looks like the real thing
function useStandIn(url, ar) {
  const [u, setU] = useState('')
  useEffect(() => {
    if (!url) { setU(''); return }
    let live = true; const im = new Image()
    im.onload = () => { if (!live) return; const H = 720, W = Math.round(H * ar), c = document.createElement('canvas'); c.width = W; c.height = H; const s = Math.max(W / im.width, H / im.height); c.getContext('2d').drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); setU(c.toDataURL('image/jpeg', .85)) }
    im.src = url; return () => { live = false }
  }, [url, ar])
  return u
}
const inspect = file => new Promise((res, rej) => {
  if (!/^image\//.test(file.type)) return rej(new Error('Choose a picture (JPG or PNG).'))
  const u = URL.createObjectURL(file), im = new Image(), say = []
  im.onload = () => {
    URL.revokeObjectURL(u)
    if (im.width < 640) say.push(`It is only ${im.width}px wide. 1280×720 looks sharp.`)
    if (Math.abs(im.width / im.height - 16 / 9) > .05) say.push(`It is ${im.width}×${im.height}, not 16:9, so players will crop or pad it.`)
    if (file.size > 2 * 1048576) say.push(`It is ${(file.size / 1048576).toFixed(1)} MB. YouTube accepts thumbnails up to 2 MB.`)
    res(say.join(' '))
  }
  im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('This picture cannot be opened.')) }
  im.src = u
})

// ---------------------------------------------------------------- small parts
const Count = ({ n, max }) => <small className={n > max ? 'bad' : 'muted'}>{n}{max ? `/${max}` : ''}</small>

function Tags({ tags, set, text, setText, suggest }) {
  const add = raw => { const next = csv(String(raw).replace(/#/g, '')).filter(t => !tags.some(x => x.toLowerCase() === t.toLowerCase())); if (next.length) set([...tags, ...next]); setText('') }
  return <div>
    <div className="rv-tags" onClick={e => e.currentTarget.querySelector('input')?.focus()}>
      {tags.map(t => <span key={t} className="rv-tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set(tags.filter(x => x !== t))}>×</button></span>)}
      <input value={text} placeholder={tags.length ? 'Add a tag…' : 'Type a tag, press Enter or comma'} onChange={e => /[,\n]/.test(e.target.value) ? add(e.target.value) : setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text) } else if (e.key === 'Backspace' && !text && tags.length) set(tags.slice(0, -1)) }}
        onBlur={() => text.trim() && add(text)} onPaste={e => { const t = e.clipboardData.getData('text'); if (/[,\n]/.test(t)) { e.preventDefault(); add(t) } }} />
    </div>
    {suggest.length > 0 && <div className="rv-sug"><small className="muted">Suggestions:</small>{suggest.map(t => <button key={t} type="button" className="chip" onClick={() => add(t)}>+ {t}</button>)}</div>}
  </div>
}

// one picture shown in one shape. ratio = shape of the frame, sa = shape of the video itself
function Frame({ ratio, src, sa, fit, label, sub, on, over }) {
  const same = Math.abs(ratio - sa) < .03, mode = same ? 'cover' : fit
  const lost = ratio < sa ? 1 - ratio / sa : 1 - sa / ratio
  const how = same ? 'Fits exactly' : mode === 'crop' ? `About ${Math.round(lost * 100)}% of the picture is cut off` : mode === 'blur' ? 'Whole picture, blurred background' : 'Whole picture, black bars'
  return <figure className={'rv-tile' + (on ? ' on' : '')}>
    <div className="rv-fr" style={{ aspectRatio: ratio }}>
      {src ? <>{mode === 'blur' && <img className="bgb" src={src} alt="" />}<img className="fg" src={src} alt="" style={{ objectFit: mode === 'crop' || same ? 'cover' : 'contain' }} /></> : <div className="ph" />}
      {over}</div>
    <figcaption><b>{label}</b>{on && <span className="chip-s">this upload</span>}<small className="muted">{sub}</small><small className={mode === 'crop' && lost > .25 ? 'bad' : 'muted'}>{how}</small></figcaption></figure>
}

// ---------------------------------------------------------------- the window
export default function Review({ w, item, date, cfg, vids, connected, mode, nav, onClose, onSave, onReset }) {
  const yt = item.platform === 'youtube', Pf = X.platformOf(item.platform), reel = item.kind === 'reel', hasThumb = Pf.hasVideo && item.kind === 'video', pc = cfg.platforms[item.platform] || {}
  const vid = vids?.find(v => v.key === item.video?.key)
  const [f, setF] = useState(() => ({
    title: item.title || '', description: item.description || '', caption: item.caption || '', tags: [...(item.publish?.tags || [])],
    privacy: item.publish?.privacy || 'public', category: item.publish?.category || '27', kids: !!item.publish?.made_for_kids,
    fit: item.reel?.fit || 'blur', partLabel: !!item.reel?.part_label, day: date, thumb: item.thumbnail || null }))
  const [tab, setTab] = useState('post'), [safe, setSafe] = useState(true), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [upMsg, setUpMsg] = useState(''), [tagText, setTagText] = useState('')
  const set = k => v => setF(x => ({ ...x, [k]: v }))
  const patch = () => ({
    ...(yt ? { title: f.title.trim(), description: f.description, publish: { privacy: f.privacy, category: f.category, made_for_kids: f.kids, tags: f.tags } } : { caption: f.caption }),
    ...(hasThumb ? { thumbnail: f.thumb } : {}), ...(reel ? { reel: { fit: f.fit, part_label: f.partLabel } } : {}) })
  const draft = X.applyPatch(item, patch()), checks = X.checkItem(draft, { connected, date: mode === 'saved' ? f.day : date }), todo = X.issuesOf(checks)
  const poster = hasThumb ? f.thumb : (vid?.thumbnail || null), th = useThumb(poster, item.video?.title || ''), sa = X.arOf(item.video?.aspect), stand = useStandIn(th.url, sa)
  const dirty = JSON.stringify(patch()) !== JSON.stringify({ ...(yt ? { title: (item.title || '').trim(), description: item.description || '', publish: { privacy: item.publish?.privacy || 'public', category: item.publish?.category || '27', made_for_kids: !!item.publish?.made_for_kids, tags: item.publish?.tags || [] } } : { caption: item.caption || '' }), ...(hasThumb ? { thumbnail: item.thumbnail || null } : {}), ...(reel ? { reel: { fit: item.reel?.fit || 'blur', part_label: !!item.reel?.part_label } } : {}) }) || (mode === 'saved' && f.day !== date)

  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o } }, [])

  const save = async next => { setBusy(true); setMsg(''); const er = await onSave(patch(), mode === 'saved' ? f.day : '', next); setBusy(false); if (er) setMsg(er) }
  const pickThumb = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return
    setBusy(true); setUpMsg('')
    try { const note = await inspect(file); const link = await S.uploadThumb(w, file); set('thumb')({ source: 'video', url: link }); setUpMsg(note || 'Uploaded. This thumbnail is used for this upload only.') } catch (er) { setUpMsg(er.message) }
    setBusy(false)
  }
  const sugg = useMemo(() => {
    if (!yt) return []
    const words = (item.video?.title || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 3)
    return [...new Set([...csv(cfg.platforms.youtube.tags), item.video?.single ? '' : item.video?.project, ...words].filter(Boolean))].filter(t => !f.tags.some(x => x.toLowerCase() === t.toLowerCase())).slice(0, 8)
  }, [f.tags.join('|'), item.video?.title])
  const addDefaultHashtags = key => { const h = (pc.hashtags || '').trim(); if (h && !f[key].includes(h)) set(key)(`${f[key].replace(/\s+$/, '')}\n\n${h}`) }

  const who = yt ? (cfg.accounts.youtube.channel_title || 'Your channel') : (pc.channel_name || `Your ${item.platform === 'facebook' ? 'page' : 'account'}`)
  const text = yt ? f.title : f.caption, fold = FOLD[item.platform] || 150, shown = text.slice(0, fold), hidden = text.slice(fold)
  const over = ratio => ratio < .6 && reel && <>
    {f.partLabel && <span className="rv-part">Part {item.reel.part}/{item.reel.of}</span>}
    <div className="rv-cap"><b>{(item.video?.title || '').slice(0, 40)}</b></div>
    {safe && <><i className="z r" /><i className="z b" /><i className="z t" /></>}</>
  const fitFor = reel ? f.fit : 'contain'

  const Post = () => reel
    ? <div className="rv-phone"><div className="rv-fr" style={{ aspectRatio: 9 / 16 }}>
        {stand ? <>{fitFor === 'blur' && Math.abs(9 / 16 - sa) > .03 && <img className="bgb" src={stand} alt="" />}<img className="fg" src={stand} alt="" style={{ objectFit: fitFor === 'crop' || Math.abs(9 / 16 - sa) < .03 ? 'cover' : 'contain' }} /></> : <div className="ph" />}
        {f.partLabel && <span className="rv-part">Part {item.reel.part}/{item.reel.of}</span>}
        <div className="rv-side"><span>♥</span><span>💬</span><span>↗</span></div>
        <div className="rv-bot"><b>@{who}</b><span dir="auto">{shown}{hidden && <span className="dim"> … more</span>}</span></div></div>
        <small className="muted">{Pf.name} {Pf.reelName.toLowerCase()} · simplified mock-up</small></div>
    : <div className="rv-card">
        <div className="rv-fr" style={{ aspectRatio: 16 / 9 }}>{th.url ? <img className="fg" src={th.url} alt="Thumbnail" /> : <div className="ph" />}{item.video?.minutes > 0 && <span className="rv-dur">{Math.floor(item.video.minutes)}:{String(Math.round((item.video.minutes % 1) * 60)).padStart(2, '0')}</span>}</div>
        <div className="rv-meta"><span className="rv-av">{who.slice(0, 1)}</span>
          <div><b dir="auto" className="rv-t">{yt ? (f.title || 'Untitled') : who}</b><small className="muted">{yt ? `${who} · scheduled` : 'Scheduled post'}</small></div></div>
        {yt ? <p className="rv-d" dir="auto">{f.description || <span className="muted">No description</span>}</p> : <p className="rv-d" dir="auto">{shown}{hidden && <span className="dim">… See more</span>}</p>}
        {yt && f.tags.length > 0 && <small className="muted">{f.tags.slice(0, 6).map(t => `#${t.replace(/\s+/g, '')}`).join(' ')}</small>}</div>

  return <div className="rv-m" role="dialog" aria-modal="true" aria-label="Review upload"><style>{RVCSS}</style>
    <div className="rv-b">
      <div className="rv-h"><div className="grow"><h3>Review before it goes out</h3><small className="muted">{labelOf(item)} · {item.video?.title}{item.edited ? ' · edited' : ''}</small></div>
        {nav && <div className="row tight" style={{ margin: 0 }}><button className="ghost sm" disabled={!nav.i} onClick={() => nav.go(nav.i - 1)} aria-label="Previous upload">‹</button><small className="muted">{nav.i + 1} / {nav.n}</small><button className="ghost sm" disabled={nav.i >= nav.n - 1} onClick={() => nav.go(nav.i + 1)} aria-label="Next upload">›</button></div>}
        <button className="ghost sm" onClick={onClose} aria-label="Close">✕</button></div>

      <div className="rv-body">
        <div>
          {yt ? <>
            <label>Title <Count n={f.title.length} max={X.LIMITS.ytTitle} /><input dir="auto" value={f.title} onChange={e => set('title')(e.target.value)} placeholder="What people see in search and on the video" /></label>
            <label>Description <Count n={f.description.length} max={X.LIMITS.ytDesc} /><textarea dir="auto" rows={6} value={f.description} onChange={e => set('description')(e.target.value)} />
              {pc.hashtags && <button type="button" className="link" onClick={() => addDefaultHashtags('description')}>+ add my default hashtags ({pc.hashtags})</button>}</label>
            <label>Tags <Count n={X.tagChars(f.tags)} max={X.LIMITS.ytTags} /><Tags tags={f.tags} set={set('tags')} text={tagText} setText={setTagText} suggest={sugg} /></label>
            <div className="cols"><label>Who can watch<select value={f.privacy} onChange={e => set('privacy')(e.target.value)}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
              <label>Category<select value={f.category} onChange={e => set('category')(e.target.value)}>{X.YT_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
            <label className="chk"><input type="checkbox" checked={f.kids} onChange={e => set('kids')(e.target.checked)} />Made for kids (YouTube requires this to be declared)</label></>
            : <label>Caption <Count n={f.caption.length} max={item.platform === 'instagram' ? X.LIMITS.igCaption : item.platform === 'tiktok' ? X.LIMITS.ttCaption : 0} />
              <textarea dir="auto" rows={9} value={f.caption} onChange={e => set('caption')(e.target.value)} />
              <small className="hint">{X.hashtagsIn(f.caption).length} hashtag{X.hashtagsIn(f.caption).length === 1 ? '' : 's'}{item.platform === 'instagram' ? ` (Instagram allows ${X.LIMITS.igTags})` : ''}. Only the first {fold} characters show before “more”, so put the hook first.</small>
              {pc.hashtags && <button type="button" className="link" onClick={() => addDefaultHashtags('caption')}>+ add my default hashtags ({pc.hashtags})</button>}</label>}

          {hasThumb && <div className="panel"><h4 style={{ marginTop: 0 }}>Thumbnail</h4>
            <div className="rv-th">{th.url ? <img src={th.url} alt="Thumbnail preview" /> : <div className="ph">{th.busy ? 'Drawing…' : 'No preview'}</div>}</div>
            {th.note && <small className="hint">{th.note}</small>}
            {f.thumb && f.thumb.source !== 'video' && <label>Text on the thumbnail<input dir="auto" value={f.thumb.title_text ?? ''} onChange={e => set('thumb')({ ...f.thumb, title_text: e.target.value })} placeholder="Empty = the video title" /><small className="hint">Written on the project’s template by the backend, in the style set in the Thumbnails tab.</small></label>}
            <div className="row tight"><label className="ghost sm" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : 'Upload a different picture'}<input type="file" accept="image/*" hidden disabled={busy} onChange={pickThumb} /></label>
              {JSON.stringify(f.thumb) !== JSON.stringify(item.thumbnail || null) && <button className="ghost sm" onClick={() => { set('thumb')(item.thumbnail || null); setUpMsg('') }}>Back to the original</button>}</div>
            {upMsg && <small className="hint">{upMsg}</small>}</div>}

          {reel && <div className="panel"><h4 style={{ marginTop: 0 }}>Vertical format</h4>
            <div className="seg tabs" style={{ margin: '4px 0' }}>{[['blur', 'Whole picture on a blurred background'], ['crop', 'Centre crop to fill the screen']].map(([k, l]) => <button key={k} className={f.fit === k ? 'on' : ''} onClick={() => set('fit')(k)}>{l}</button>)}</div>
            <label className="chk"><input type="checkbox" checked={f.partLabel} onChange={e => set('partLabel')(e.target.checked)} />Show “Part {item.reel.part}/{item.reel.of}” on the reel</label>
            <small className="hint">Cut: {item.reel.cut}{item.reel.range_sec ? ` · ${item.reel.range_sec[0]}s to ${item.reel.range_sec[1]}s` : ''}. See the result in the Shapes tab.</small></div>}

          {mode === 'saved' && <label>Goes out on<input type="date" min={X.todayISO()} value={f.day} onChange={e => set('day')(e.target.value)} /></label>}
        </div>

        <aside className="rv-r">
          <div className="seg tabs" style={{ margin: '4px 0 10px' }}>{[['post', 'Post'], ['shapes', 'Shapes'], ['checks', `Checks${todo.length ? ` (${todo.length})` : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'post' && <>{Post()}<small className="hint">A simplified look. The real apps change their layout from time to time.</small></>}
          {tab === 'shapes' && <>
            <p className="hint" style={{ marginTop: 0 }}>The video is <b>{item.video?.aspect || '16:9'}</b>. {reel ? 'This is how it looks in each shape.' : 'A complete video is posted as it is, never cropped.'}{!th.url || th.note ? ' The picture is a stand-in for the video.' : ' The thumbnail stands in for the video picture.'}</p>
            {reel && <label className="chk"><input type="checkbox" checked={safe} onChange={e => setSafe(e.target.checked)} />Show where the app’s buttons and text cover the picture</label>}
            <div className="rv-tiles">{SHAPES.map(([k, l, s]) => { const r = X.arOf(k); return <Frame key={k} ratio={r} src={stand} sa={sa} fit={fitFor} label={l} sub={s} on={reel ? k === '9:16' : Math.abs(r - sa) < .03} over={over(r)} /> })}</div></>}
          {tab === 'checks' && <><ul className="rv-ck">{[...checks].sort((a, b) => 'bad,warn,info,ok'.indexOf(a.level) - 'bad,warn,info,ok'.indexOf(b.level)).map((c, i) => <li key={i} className={c.level}><i>{ICON[c.level]}</i><span>{c.text}</span></li>)}</ul></>}
        </aside>
      </div>

      {msg && <p className="bad" style={{ margin: '0 22px 8px' }}>{msg}</p>}
      <div className="rv-f">
        <button className="cta sm" disabled={busy} onClick={() => save(false)}>{mode === 'draft' ? (dirty ? 'Keep my changes' : 'Looks good') : 'Save changes'}</button>
        {nav && nav.i < nav.n - 1 && <button className="ghost" disabled={busy} onClick={() => save(true)}>{mode === 'draft' ? 'Keep and next ›' : 'Save and next ›'}</button>}
        {mode === 'draft' && item.edited && onReset && <button className="ghost" disabled={busy} onClick={onReset}>Back to the defaults</button>}
        <button className="ghost" onClick={onClose}>Close without saving</button>
        <span className="grow" /><IssueChip list={checks} /></div>
    </div></div>
}

const RVCSS = `
.rv-m{position:fixed;inset:0;background:rgba(42,37,80,.5);z-index:20;display:grid;place-items:center;padding:14px}
.rv-b{background:var(--clay);border-radius:28px;box-shadow:var(--out);width:min(1120px,100%);max-height:94vh;max-height:94dvh;display:flex;flex-direction:column;overflow:hidden}
.rv-h{display:flex;gap:12px;align-items:center;padding:16px 22px;border-bottom:1px solid rgba(112,96,185,.2)}.rv-h h3{margin:0}.rv-h .grow,.rv-f .grow{flex:1;min-width:0}
.rv-body{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:24px;padding:6px 22px 14px;overflow:auto;align-items:start}
.rv-r{position:sticky;top:0}
.rv-f{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 22px;border-top:1px solid rgba(112,96,185,.2)}
.rv-b label small.bad,.rv-b label small.muted{margin-left:6px}
.rv-tags{display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--bg);border-radius:20px;box-shadow:var(--in);margin-top:6px;cursor:text}
.rv-tags input{flex:1;min-width:130px;box-shadow:none;margin:0;padding:4px 8px;background:transparent;border-radius:10px}
.rv-tag{display:inline-flex;align-items:center;gap:4px;background:var(--clay);box-shadow:var(--small);border-radius:999px;padding:2px 4px 2px 12px;font-size:.9rem;color:var(--ink)}
.rv-tag button{border:0;background:0;cursor:pointer;color:var(--mute);font-size:1.1rem;line-height:1;padding:2px 6px}
.rv-sug{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}.rv-sug .chip{padding:3px 12px;font-size:.85rem}
.rv-th{border-radius:16px;overflow:hidden;box-shadow:var(--in);aspect-ratio:16/9;background:var(--bg);display:grid;place-items:center;color:var(--mute)}.rv-th img{width:100%;height:100%;object-fit:cover;display:block}
.rv-fr{position:relative;overflow:hidden;background:#000;border-radius:12px;width:100%}
.rv-fr .bgb,.rv-fr .fg{position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none}
.rv-fr .bgb{object-fit:cover;filter:blur(14px) brightness(.55);transform:scale(1.2)}
.rv-fr .ph{position:absolute;inset:0;background:linear-gradient(135deg,#8aa0ff,#ffb59a)}
.rv-tiles{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;align-items:start;margin-top:10px}
.rv-tile{margin:0;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:16px}.rv-tile.on{box-shadow:var(--in);background:var(--bg)}
.rv-tile figcaption{display:flex;flex-direction:column;gap:1px;font-size:.88rem}.rv-tile figcaption .chip-s{align-self:flex-start;margin:2px 0}
.rv-part{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:1px 9px;font-size:.72rem;font-weight:600}
.rv-cap{position:absolute;left:8px;right:34px;bottom:8px;color:#fff;font-size:.72rem;text-shadow:0 1px 3px rgba(0,0,0,.7);line-height:1.2}
.z{position:absolute;display:block;background:repeating-linear-gradient(135deg,rgba(217,58,95,.42) 0 5px,rgba(217,58,95,.16) 5px 10px);border:1px dashed rgba(217,58,95,.9)}
.z.r{right:0;bottom:12%;width:16%;height:40%}.z.b{left:0;right:0;bottom:0;height:16%}.z.t{left:0;right:0;top:0;height:7%}
.rv-phone{width:min(240px,72%);margin:0 auto;padding:7px;border-radius:26px;background:#14122b;box-shadow:var(--out);display:grid;gap:6px}.rv-phone small{text-align:center;color:#c9c5ee}
.rv-phone .rv-fr{border-radius:20px}
.rv-side{position:absolute;right:6px;bottom:18%;display:grid;gap:10px;color:#fff;font-size:1.05rem;text-shadow:0 1px 3px rgba(0,0,0,.7)}
.rv-bot{position:absolute;left:0;right:0;bottom:0;padding:26px 36px 10px 10px;color:#fff;font-size:.74rem;line-height:1.3;background:linear-gradient(transparent,rgba(0,0,0,.65));display:grid;gap:3px;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.rv-bot span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.dim{opacity:.6}
.rv-card{background:var(--bg);border-radius:20px;padding:8px;box-shadow:var(--in);display:grid;gap:8px}
.rv-dur{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.8);color:#fff;border-radius:6px;padding:0 6px;font-size:.75rem}
.rv-meta{display:flex;gap:10px;align-items:flex-start;padding:0 4px}.rv-meta>div{display:grid;min-width:0}
.rv-av{width:34px;height:34px;border-radius:50%;background:var(--bolt);color:#fff;display:grid;place-items:center;font-weight:700;flex:0 0 auto}
.rv-t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3}
.rv-d{margin:0 4px;font-size:.9rem;color:var(--mute);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}
.rv-ck{list-style:none;margin:0;padding:0;display:grid;gap:8px}.rv-ck li{display:flex;gap:10px;align-items:flex-start;font-size:.93rem}.rv-ck i{font-style:normal;flex:0 0 22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-weight:700;background:var(--bg);box-shadow:var(--in)}
.rv-ck .ok i{color:#0b7a5d}.rv-ck .warn i{background:var(--butter);color:#4b3a00}.rv-ck .bad i{background:#ffc2cf;color:#7a1630}.rv-ck .info i{color:var(--bolt)}.rv-ck .bad span{font-weight:600}
@media(max-width:900px){.rv-body{grid-template-columns:1fr}.rv-r{position:static}.rv-m{padding:0}.rv-b{border-radius:0;max-height:100vh;max-height:100dvh;width:100%}}
`
