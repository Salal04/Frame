import { useState, useRef, useEffect } from 'react'
import * as G from './drive.js'
import * as P from './playlist.js'

// Browser video editor (v2). Tracks: V1 main (video / image / text slides), V2 (videos placed anywhere, with position, size, opacity),
// Text & logo layer (opacity, fade), and 3 audio tracks: Voice (clip sound + voiceover), Background, Effects.
// No extra libraries: <video>/canvas for the picture, WebAudio for sound, MediaRecorder to export.
// Export runs in real time (a 3 minute video takes about 3 minutes) and the tab must stay open.

const FONTS = ['Fredoka', 'Figtree', 'Noto Naskh Arabic', 'Arial']
const ASP = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 }
const BITS = { 480: 2.5e6, 720: 5e6, 1080: 8e6 }
const SPEEDS = [.25, .5, .75, 1, 1.25, 1.5, 2, 3, 4]
const DEF = { bright: 1, contrast: 1, sat: 1, gray: 0, sepia: 0, hue: 0, blur: 0 }
const LOOKS = [['Normal', DEF], ['Black & white', { ...DEF, gray: 1 }], ['Warm', { ...DEF, sepia: .35, sat: 1.25 }], ['Cool', { ...DEF, hue: 348, sat: 1.1 }], ['Vivid', { ...DEF, contrast: 1.15, sat: 1.5 }], ['Faded', { ...DEF, contrast: .9, bright: 1.1, sat: .8 }]]
const LOOK0 = { ...DEF, aspect: 'orig', fit: 'contain', zoom: 1, px: 0, py: 0, rot: 0, flip: false, fi: 0, fo: 0, res: 720, subSize: .055, subColor: '#ffffff', subBg: true }
const TRK0 = { voice: { vol: 1, mute: false }, bg: { vol: 1, mute: false }, fx: { vol: 1, mute: false } }
const TRACKS = [['voice', 'Voice'], ['bg', 'Background'], ['fx', 'Effects']]
const PLACE = [['Full screen', { x: .5, y: .5, w: 1 }], ['Picture in picture', { x: .78, y: .78, w: .38 }], ['Left half', { x: .25, y: .5, w: .5 }], ['Right half', { x: .75, y: .5, w: .5 }]]
const AR = /[\u0600-\u06FF]/

const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
const filt = l => `brightness(${l.bright}) contrast(${l.contrast}) saturate(${l.sat}) grayscale(${l.gray}) sepia(${l.sepia}) hue-rotate(${l.hue}deg) blur(${l.blur}px)`
const idOf = u => ((u || '').match(/\/d\/([\w-]{15,})/) || (u || '').match(/[?&]id=([\w-]{15,})/) || [])[1]
const pickMime = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => window.MediaRecorder?.isTypeSupported(t))
const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
const idur = c => c.kind === 'video' ? (c.end - c.start) / c.speed : c.len
const alen = (a, total) => a.loop ? Math.max(0, total - a.at) : a.end - a.start
const fadeOf = (t, a, b, f) => f > 0 ? clamp(Math.min((t - a) / f, (b - t) / f), 0, 1) : 1
const timing = (main, v2, aud, ov) => {
  const off = []; let m = 0; main.forEach(c => { off.push(m); m += idur(c) })
  const total = Math.max(m, ...v2.map(o => o.at + idur(o)), ...aud.filter(a => !a.loop).map(a => a.at + a.end - a.start), ...ov.map(o => o.to))
  return { off, main: m, total: isFinite(total) ? total : 0 }
}
const locate = (s, t) => {
  let i = -1; s.main.forEach((_, k) => { if (s.tm.off[k] <= t + 1e-6) i = k }); const c = s.main[i]; if (!c) return { i: -1, local: 0, inside: false }
  const d = idur(c), lt = clamp(t - s.tm.off[i], 0, d); return { i, local: c.kind === 'video' ? c.start + lt * c.speed : lt, inside: t <= s.tm.off[i] + d + 1e-6 }
}
const dims = (L, short, c) => { let a = ASP[L.aspect] || (c ? c.vw / c.vh : 16 / 9); if (!ASP[L.aspect] && c && L.rot % 2) a = 1 / a; const w = a >= 1 ? short * a : short, h = a >= 1 ? short : short / a; return [Math.round(w / 2) * 2, Math.round(h / 2) * 2] }
const ts = s => { const m = (s || '').trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]) : 0 }
const parseSrt = t => t.replace(/\r/g, '').split(/\n\n+/).map(b => { const l = b.split('\n').filter(Boolean), i = l.findIndex(x => x.includes('-->')); if (i < 0) return null; const [a, z] = l[i].split('-->'); return { from: ts(a), to: ts(z), text: l.slice(i + 1).join('\n') } }).filter(Boolean)
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h) }

function drawText(ctx, o, W, H) {
  const px = o.size * H, lines = String(o.text || '').split('\n'), cx = o.x * W, cy = o.y * H
  ctx.save(); ctx.globalAlpha = o.opacity ?? 1; ctx.font = `${o.weight || 700} ${px}px "${o.font}", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = AR.test(o.text) ? 'rtl' : 'ltr'
  const lh = px * 1.25, w = Math.max(1, ...lines.map(l => ctx.measureText(l).width)), h = lh * lines.length
  if (o.bg) { const pad = px * .35; ctx.fillStyle = o.bg; rr(ctx, cx - w / 2 - pad, cy - h / 2 - pad / 2, w + pad * 2, h + pad, px * .25); ctx.fill() }
  lines.forEach((l, i) => { const y = cy - h / 2 + lh * (i + .5); if (o.stroke) { ctx.lineWidth = px * .12; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(l, cx, y) } ctx.fillStyle = o.color; ctx.fillText(l, cx, y) })
  ctx.restore(); return [cx - w / 2, cy - h / 2, w, h]
}
// a picture or video placed on the canvas: centre x/y and width are fractions of the canvas
function drawBox(ctx, el, sw, sh, o, W, H, alpha) {
  const iw = o.w * W, ih = iw * sh / sw
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(o.x * W, o.y * H); ctx.rotate((o.rot || 0) * Math.PI / 180)
  if (o.round) { rr(ctx, -iw / 2, -ih / 2, iw, ih, o.round * Math.min(iw, ih)); ctx.clip() }
  ctx.drawImage(el, -iw / 2, -ih / 2, iw, ih); ctx.restore(); return [o.x * W - iw / 2, o.y * H - ih / 2, iw, ih]
}

const Rng = ({ l, v, set, min, max, step = .01, u = '' }) => <label>{l}: <b>{+(+v).toFixed(2)}{u}</b><input type="range" min={min} max={max} step={step} value={v} onChange={e => set(+e.target.value)} /></label>

export default function Editor({ w, run, start }) {
  const [main, setMain] = useState([]), [v2, setV2] = useState([]), [ov, setOv] = useState([]), [aud, setAud] = useState([]), [subs, setSubs] = useState([]), [look, setLook] = useState(LOOK0), [trk, setTrk] = useState(TRK0)
  const [sel, setSel] = useState(''), [tab, setTab] = useState('main'), [t, setT] = useState(0), [playing, setPlaying] = useState(false), [recording, setRecording] = useState(false)
  const [prog, setProg] = useState(null), [out, setOut] = useState(null), [list, setList] = useState(null), [link, setLink] = useState(''), [title, setTitle] = useState(start?.r?.title || '')
  const tm = timing(main, v2, aud, ov), S = useRef(), E = useRef({ t: 0, t0: 0, w0: 0, playing: false, raf: 0 }).current, D = useRef(() => { })
  const cv = useRef(), els = useRef({}), imgs = useRef({}), nodes = useRef({}), bx = useRef({}), drag = useRef(''), tdrag = useRef(null), ac = useRef(), bus = useRef(), tg = useRef({}), vo = useRef(null), audTrack = useRef('bg')
  const fm = useRef(), f2 = useRef(), fi = useRef(), fa = useRef(), fs = useRef()
  S.current = { main, v2, ov, aud, subs, look, trk, tm }
  const firstSized = main.find(c => c.vw), [pw, ph] = dims(look, 540, firstSized)

  // ---------- picture ----------
  const draw = () => {
    const c = cv.current; if (!c) return
    const s = S.current, ctx = c.getContext('2d'), W = c.width, H = c.height, L = s.look, tt = E.t, { i, inside } = locate(s, tt), cl = inside ? s.main[i] : null
    let el = null
    if (cl?.kind === 'video') { el = els.current[cl.id]; if (el && el.readyState < 2) { if (E.playing) return; el = null } } else if (cl?.kind === 'image') el = imgs.current[cl.id]
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
    if (cl?.kind === 'text') { ctx.fillStyle = cl.bg; ctx.fillRect(0, 0, W, H); drawText(ctx, { ...cl, x: .5, y: .5, stroke: false, bg: '', opacity: 1 }, W, H) }
    else if (el) {
      const vw = el.videoWidth || el.naturalWidth, vh = el.videoHeight || el.naturalHeight, odd = L.rot % 2, ew = odd ? vh : vw, eh = odd ? vw : vh
      const put = (cover, f, z, pan) => { ctx.save(); ctx.filter = f; ctx.translate(W / 2 + (pan ? L.px * W / 2 : 0), H / 2 + (pan ? L.py * H / 2 : 0)); ctx.rotate(L.rot * Math.PI / 2); if (L.flip) ctx.scale(-1, 1); const k = (cover ? Math.max(W / ew, H / eh) : Math.min(W / ew, H / eh)) * z; ctx.drawImage(el, -vw * k / 2, -vh * k / 2, vw * k, vh * k); ctx.restore() }
      if (L.fit === 'blur') put(true, 'blur(28px) brightness(.55)', 1.15, false)
      put(L.fit === 'cover', filt(L), L.zoom, true)
    }
    const boxes = {}
    s.v2.forEach(o => { const d = idur(o); if (tt < o.at || tt > o.at + d) return; const e = els.current[o.id]; if (e && e.readyState >= 2) boxes[o.id] = drawBox(ctx, e, e.videoWidth, e.videoHeight, o, W, H, o.opacity * fadeOf(tt, o.at, o.at + d, o.fade)) })
    s.ov.forEach(o => {
      if (tt < o.from || tt > o.to) return; const a = o.opacity * fadeOf(tt, o.from, o.to, o.fade)
      if (o.kind === 'text') boxes[o.id] = drawText(ctx, { ...o, opacity: a }, W, H)
      else { const im = imgs.current[o.id]; if (im) boxes[o.id] = drawBox(ctx, im, im.naturalWidth, im.naturalHeight, o, W, H, a) }
    })
    const q = s.subs.find(x => tt >= x.from && tt <= x.to)
    if (q) drawText(ctx, { text: q.text, x: .5, y: .88, size: L.subSize, color: L.subColor, bg: L.subBg ? 'rgba(0,0,0,.6)' : '', stroke: !L.subBg, font: AR.test(q.text) ? 'Noto Naskh Arabic' : 'Figtree', weight: 600 }, W, H)
    const fa_ = Math.min(L.fi > 0 ? tt / L.fi : 1, L.fo > 0 ? (s.tm.total - tt) / L.fo : 1)
    if (fa_ < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, fa_)})`; ctx.fillRect(0, 0, W, H) }
    bx.current = boxes
  }
  D.current = draw
  useEffect(() => { if (!E.playing) draw() })
  useEffect(() => { if (E.t > tm.total) { E.t = tm.total; setT(E.t) } }, [tm.total])

  // ---------- sound graph: item -> track (voice / bg / fx) -> mix -> speakers + recorder ----------
  const itemOf = id => { const s = S.current; return s.main.find(x => x.id === id) || s.v2.find(x => x.id === id) || s.aud.find(x => x.id === id) }
  const ensureGraph = async () => {
    if (!ac.current) {
      const a = new (window.AudioContext || window.webkitAudioContext)(), mix = a.createGain(), mon = a.createGain(), dst = a.createMediaStreamDestination(); mix.connect(dst); mix.connect(mon); mon.connect(a.destination)
      TRACKS.forEach(([k]) => { const g = a.createGain(); g.connect(mix); tg.current[k] = g }); ac.current = a; bus.current = { mix, mon, dst }
    }
    Object.entries(els.current).forEach(([id, el]) => {
      const it = itemOf(id); if (nodes.current[id] || !it) return
      const g = ac.current.createGain(); ac.current.createMediaElementSource(el).connect(g); g.connect(tg.current[it.track || 'voice']); nodes.current[id] = g
    })
    await ac.current.resume()
  }
  useEffect(() => {
    if (!bus.current) return
    Object.entries(nodes.current).forEach(([id, g]) => { const it = itemOf(id); if (it) g.gain.value = it.vol ?? 1 })
    TRACKS.forEach(([k]) => { tg.current[k].gain.value = trk[k].mute ? 0 : trk[k].vol })
  })
  useEffect(() => { aud.forEach(a => { const el = els.current[a.id]; if (el) el.loop = !!a.loop }) })

  // ---------- playback: one master clock, every video/audio element is kept in step with it ----------
  const sync = (tt, force) => {
    const s = S.current, go = E.playing
    const act = (el, active, local, rate, upAt, upLocal) => {
      if (!el) return
      if (active) {
        if (el.playbackRate !== rate) el.playbackRate = rate
        if (!go) return
        if (el.paused || force) { if (force || Math.abs(el.currentTime - local) > .05) el.currentTime = local; el.play().catch(() => { }) }
        else if (Math.abs(el.currentTime - local) > .35) el.currentTime = local
      } else {
        if (!el.paused) el.pause()
        if (upAt !== undefined && upAt > tt && upAt - tt < 1 && Math.abs(el.currentTime - upLocal) > .1) el.currentTime = upLocal   // pre-position the next clip
      }
    }
    s.main.forEach((c, k) => { if (c.kind !== 'video') return; const o = s.tm.off[k]; act(els.current[c.id], tt >= o && tt < o + idur(c), c.start + (tt - o) * c.speed, c.speed, o, c.start) })
    s.v2.forEach(c => act(els.current[c.id], tt >= c.at && tt < c.at + idur(c), c.start + (tt - c.at) * c.speed, c.speed, c.at, c.start))
    s.aud.forEach(a => { const el = els.current[a.id]; if (!el) return; const d = el.duration || 0, local = a.loop && d ? (tt - a.at) % d : a.start + (tt - a.at); act(el, tt >= a.at && tt < a.at + alen(a, s.tm.total), local, 1) })
  }
  const stopVoice = () => { const mr = vo.current; vo.current = null; setRecording(false); if (mr && mr.state !== 'inactive') mr.stop() }
  const stop = end => {
    E.playing = false; cancelAnimationFrame(E.raf); Object.values(els.current).forEach(e => e.pause()); setPlaying(false); if (vo.current) stopVoice()
    if (end) { E.t = S.current.tm.total; setT(E.t); draw(); const f = E.onEnd; E.onEnd = null; f?.() }
  }
  const tick = () => {
    if (!E.playing) return
    E.t = E.t0 + (performance.now() - E.w0) / 1000
    if (E.t >= S.current.tm.total) return stop(true)
    sync(E.t, false); draw(); setT(E.t); E.raf = requestAnimationFrame(tick)
  }
  const play = async () => {
    const s = S.current; if (E.playing || !s.tm.total) return
    await ensureGraph(); if (E.t >= s.tm.total - .05) E.t = 0
    E.t0 = E.t; E.w0 = performance.now(); E.playing = true; setPlaying(true); sync(E.t, true); E.raf = requestAnimationFrame(tick)
  }
  const seek = async x => {
    stop(false); const s = S.current; x = clamp(x, 0, s.tm.total); E.t = x; setT(x); const waits = []
    const pos = (el, local) => { if (el && Math.abs(el.currentTime - local) > .02) waits.push(new Promise(r => { const f = () => { el.removeEventListener('seeked', f); r() }; el.addEventListener('seeked', f); el.currentTime = local; setTimeout(r, 1500) })) }
    const { i, local, inside } = locate(s, x); if (inside && s.main[i].kind === 'video') pos(els.current[s.main[i].id], local)
    s.v2.forEach(o => { if (x >= o.at && x <= o.at + idur(o)) pos(els.current[o.id], o.start + (x - o.at) * o.speed) })
    await Promise.all(waits); draw()
  }

  // ---------- loading media ----------
  const mkEl = (url, video) => { const v = video ? document.createElement('video') : new Audio(); v.preload = 'auto'; if (video) { v.playsInline = true; v.onseeked = v.onloadeddata = () => D.current() } v.src = url; return v }
  const meta = v => new Promise((res, rej) => {
    v.onloadedmetadata = async () => { if (!isFinite(v.duration)) { await new Promise(r => { v.ontimeupdate = () => { v.ontimeupdate = null; r() }; v.currentTime = 1e9 }); v.currentTime = 0 } res() }
    v.onerror = () => rej(new Error('The browser cannot open this file. Use MP4 (H.264) / WebM for video and MP3 / WAV / M4A for audio.'))
  })
  const addMedia = async (file, nm, target) => {
    const url = URL.createObjectURL(file), id = uid(), name = nm || file.name
    if (/^image\//.test(file.type)) {
      if (target !== 'main') throw new Error('V2 takes videos. Use “Text & logo” to place a picture over the video.')
      const im = new Image(); await new Promise((r, j) => { im.onload = r; im.onerror = () => j(new Error('This image cannot be opened.')); im.src = url }); imgs.current[id] = im
      setMain(a => [...a, { id, kind: 'image', name, url, vw: im.naturalWidth, vh: im.naturalHeight, len: 5 }])
    } else {
      const v = mkEl(url, true); await meta(v); els.current[id] = v
      const base = { id, kind: 'video', name, url, vw: v.videoWidth, vh: v.videoHeight, dur: v.duration, start: 0, end: v.duration, speed: 1, vol: 1 }
      if (target === 'v2') setV2(a => [...a, { ...base, at: +E.t.toFixed(1), x: .75, y: .75, w: .38, opacity: 1, rot: 0, round: 0, fade: 0 }]); else setMain(a => [...a, base])
    }
    setSel(id); setTab(target === 'v2' ? 'v2' : 'main'); setTitle(x => x || name.replace(/\.[^.]+$/, '') + ' edited')
  }
  const pickMedia = target => e => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) run('Opening…', async () => { for (const f of fl) await addMedia(f, '', target) }) }
  const fromDrive = (r, target) => run('Downloading the video from Drive…', async () => {
    const id = idOf(r.output); if (!id) throw new Error('This output link is not a Drive file. Download it and use “From my device”.')
    const res = await fetch(`${G.D}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${G.getToken()}` } })
    if (!res.ok) throw new Error('Drive did not let this app open that file (it can only open files it created). Download it and use “From my device”.')
    const b = await res.blob(); await addMedia(new File([b], r.title + '.mp4', { type: b.type || 'video/mp4' }), r.title, target); setList(null)
  })
  const openList = target => run('Reading your projects…', async () => { const items = []; for (const p of [...await G.listProjects(w), w.singles]) (await P.loadVideos(p)).forEach(r => r.output && items.push({ p, r })); setList({ target, items }) })
  const addSlide = () => { const o = { id: uid(), kind: 'text', name: 'Text slide', text: 'Your text', bg: '#101828', color: '#ffffff', font: 'Fredoka', size: .08, weight: 700, len: 5 }; setMain(a => [...a, o]); setSel(o.id); setTab('main') }
  const addAudio = async (file, track, at) => {
    const url = URL.createObjectURL(file), el = mkEl(url, false); await meta(el); const id = uid(), bg = track === 'bg'; els.current[id] = el
    setAud(a => [...a, { id, track, name: file.name, url, dur: el.duration, at: at ?? (bg ? 0 : +E.t.toFixed(1)), start: 0, end: el.duration, vol: bg ? .5 : 1, loop: bg }]); setSel(id); setTab('audio')
  }
  const pickAudio = e => { const f = e.target.files[0]; e.target.value = ''; if (f) run('Opening audio…', () => addAudio(f, audTrack.current)) }
  const addTrackFile = tr => { audTrack.current = tr; fa.current.click() }
  const startVoice = () => run('Starting the microphone…', async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone here (it needs https).')
    const st = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(st), ch = [], at = +E.t.toFixed(1)
    mr.ondataavailable = e => e.data.size && ch.push(e.data)
    mr.onstop = () => { st.getTracks().forEach(x => x.stop()); const type = mr.mimeType || 'audio/webm'; run('Saving the voiceover…', () => addAudio(new File([new Blob(ch, { type })], 'Voiceover.' + (type.includes('mp4') ? 'm4a' : 'webm'), { type }), 'voice', at)) }
    vo.current = mr; mr.start(); setRecording(true); play()
  })

  useEffect(() => {
    FONTS.forEach(f => document.fonts?.load(`700 32px "${f}"`).then(() => D.current()))
    if (start?.r?.output) fromDrive(start.r, 'main')
    return () => { stop(false); const s = S.current;[...s.main, ...s.v2, ...s.aud].forEach(c => c.url && URL.revokeObjectURL(c.url)); ac.current?.close() }
  }, [])

  // ---------- editing ----------
  const updM = (id, p) => setMain(a => a.map(c => c.id === id ? { ...c, ...p } : c)), upd2 = (id, p) => setV2(a => a.map(c => c.id === id ? { ...c, ...p } : c))
  const updA = (id, p) => setAud(a => a.map(c => c.id === id ? { ...c, ...p } : c)), updO = (id, p) => setOv(a => a.map(c => c.id === id ? { ...c, ...p } : c))
  const gone = id => { els.current[id]?.pause(); delete els.current[id]; setSel('') }
  const split = () => {
    const s = S.current, { i, local, inside } = locate(s, E.t), c = s.main[i]; if (!inside || !c || c.kind !== 'video' || local < c.start + .2 || local > c.end - .2) return
    const a = { ...c, id: uid(), end: local }, b = { ...c, id: uid(), start: local }; els.current[a.id] = mkEl(c.url, true); els.current[b.id] = mkEl(c.url, true); delete els.current[c.id]
    setMain(m => m.flatMap(x => x.id === c.id ? [a, b] : [x])); setSel(b.id)
  }
  const trimHere = side => { const { i, local, inside } = locate(S.current, E.t), c = S.current.main[i]; if (inside && c?.kind === 'video') updM(c.id, side === 's' ? { start: Math.min(local, c.end - .2) } : { end: Math.max(local, c.start + .2) }) }
  const shift = (id, d) => setMain(cs => { const i = cs.findIndex(c => c.id === id), j = i + d; if (j < 0 || j >= cs.length) return cs; const a = [...cs];[a[i], a[j]] = [a[j], a[i]]; return a })
  const addText = () => { const o = { id: uid(), kind: 'text', text: 'Your text', x: .5, y: .5, size: .07, color: '#ffffff', bg: '', stroke: true, font: 'Fredoka', weight: 700, opacity: 1, fade: 0, from: +E.t.toFixed(1), to: +(tm.total > E.t + .5 ? Math.min(E.t + 3, tm.total) : E.t + 3).toFixed(1) }; setOv(a => [...a, o]); setSel(o.id); setTab('over') }
  const addImage = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    const id = uid(), im = new Image(); im.onload = () => { imgs.current[id] = im; D.current() }; im.src = URL.createObjectURL(f)
    setOv(a => [...a, { id, kind: 'image', name: f.name, x: .88, y: .12, w: .18, rot: 0, round: 0, opacity: 1, fade: 0, from: 0, to: Math.max(tm.total, 5) }]); setSel(id); setTab('over')
  }
  const rect = e => e.currentTarget.getBoundingClientRect()
  const grab = e => {
    const r = rect(e), W = cv.current.width, H = cv.current.height, x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, s = S.current
    const hit = [...s.v2, ...s.ov].reverse().find(o => { const b = bx.current[o.id]; return b && x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3] })
    if (hit) { setSel(hit.id); setTab(hit.kind === 'video' ? 'v2' : 'over'); drag.current = hit.id; e.currentTarget.setPointerCapture(e.pointerId) }
  }
  const move = e => { if (!drag.current) return; const r = rect(e), id = drag.current, p = { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; upd2(id, p); updO(id, p) }
  // timeline bars: drag sideways to change when something starts
  const down = (e, kind, o) => { tdrag.current = { kind, id: o.id, x: e.clientX, a: kind === 'ov' ? o.from : o.at, len: kind === 'ov' ? o.to - o.from : 0, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); setSel(o.id); setTab(kind === 'v2' ? 'v2' : kind === 'ov' ? 'over' : 'audio') }
  const tMove = e => {
    const d = tdrag.current; if (!d) return; if (Math.abs(e.clientX - d.x) > 3) d.moved = true; if (!d.moved) return
    const W = tl.current.getBoundingClientRect().width - 50, na = Math.max(0, +(d.a + (e.clientX - d.x) / W * Math.max(tm.total, 1)).toFixed(2))
    if (d.kind === 'v2') upd2(d.id, { at: na }); else if (d.kind === 'aud') updA(d.id, { at: na }); else updO(d.id, { from: na, to: +(na + d.len).toFixed(2) })
  }
  const tl = useRef()
  const pickSrt = e => { const f = e.target.files[0]; e.target.value = ''; if (f) run('Reading subtitles…', async () => { const q = parseSrt(await f.text()); if (!q.length) throw new Error('No subtitles found. Use an .srt file.'); setSubs(q) }) }

  // ---------- export ----------
  const exportIt = () => run('Exporting… keep this tab open and in front', async () => {
    const s = S.current; if (!s.tm.total) throw new Error('Add something to the timeline first.')
    const mime = pickMime(); if (!mime) throw new Error('This browser cannot record video. Use Chrome or Edge.')
    await ensureGraph(); const c = cv.current, [W, H] = dims(s.look, s.look.res, s.main.find(x => x.vw)); c.width = W; c.height = H; bus.current.mon.gain.value = 0; E.cancel = false; setOut(null); setLink('')
    try {
      await seek(0)
      const stream = c.captureStream(30); bus.current.dst.stream.getAudioTracks().forEach(x => stream.addTrack(x))
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITS[s.look.res] }), chunks = []
      rec.ondataavailable = e => e.data.size && chunks.push(e.data)
      const stopped = new Promise(r => { rec.onstop = r }), ended = new Promise(r => { E.onEnd = r }), timer = setInterval(() => setProg(clamp(E.t / s.tm.total, 0, 1)), 300)
      setProg(0); rec.start(500); play(); await ended; clearInterval(timer); rec.stop(); await stopped
      if (E.cancel) return
      const type = mime.split(';')[0], blob = new Blob(chunks, { type }); setOut({ blob, url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm' })
    } finally { bus.current.mon.gain.value = 1; setProg(null); const [a, b] = dims(S.current.look, 540, S.current.main.find(x => x.vw)); c.width = a; c.height = b; draw() }
  })
  const cancel = () => { E.cancel = true; stop(false); const f = E.onEnd; E.onEnd = null; f?.() }
  const toDrive = () => run('Saving to Drive…', async () => { const p = start?.p || w.singles, dir = await G.ensureFolder('Edited', p.folderId), r = await G.upload(new File([out.blob], `${title || 'edited'}.${out.ext}`, { type: out.blob.type }), dir.id); setLink(r.webViewLink) })
  const asOutput = () => run('Updating the Output link…', async () => { await P.saveVideo(start.p, { ...start.r, output: link }) })
  const snap = () => cv.current.toBlob(b => save(b, `${title || 'frame'}.png`))

  // ---------- screen ----------
  const dur = tm.total, d1 = Math.max(dur, .01), pct = x => `${x / d1 * 100}%`
  const mi = main.find(o => o.id === sel), vi = v2.find(o => o.id === sel), ai = aud.find(o => o.id === sel), so = ov.find(o => o.id === sel), mk = main.findIndex(o => o.id === sel)
  const TABS = [['main', 'Main (V1)'], ['v2', 'Video 2 (V2)'], ['over', 'Text & logo'], ['look', 'Look'], ['audio', 'Audio'], ['subs', 'Subtitles'], ['exp', 'Export']]
  const ed = (k, v) => setLook(l => ({ ...l, [k]: v })), hasAny = main.length || v2.length || ov.length || aud.length
  const bar = (kind, o, left, width, label, cls, top, h) => <div key={o.id} className={'ed-it ' + cls + (o.id === sel ? ' on' : '')} style={{ left: pct(left), width: pct(Math.max(width, .3)), ...(top !== undefined ? { top, height: h, bottom: 'auto' } : {}) }} onPointerDown={e => down(e, kind, o)} onPointerMove={tMove} onPointerUp={() => { tdrag.current = null }} onPointerCancel={() => { tdrag.current = null }}>{label}</div>
  const Pick = ({ target }) => list && list.target === target ? <div className="pick">{!list.items.length && <p className="muted">No video has an Output link yet.</p>}{list.items.map(({ p, r }) => <div className="row tight" key={p.folderId + r.row}><button className="ghost sm" onClick={() => fromDrive(r, target)}>{p.name}: {r.title}</button></div>)}</div> : null
  const Time = ({ o, set, a, b }) => <div className="cols"><label>Starts at (s)<input type="number" step=".1" min="0" value={+o[a].toFixed(1)} onChange={e => set({ [a]: +e.target.value })} /></label>{b && <label>Until (s)<input type="number" step=".1" min="0" value={+o[b].toFixed(1)} onChange={e => set({ [b]: +e.target.value })} /></label>}</div>
  const Place = ({ o, set }) => <><div className="row tight">{PLACE.map(([n, p]) => <button key={n} className="ghost sm" onClick={() => set(p)}>{n}</button>)}</div>
    <div className="cols"><Rng l="Size (width)" v={o.w} min={.05} max={1} set={v => set({ w: v })} /><Rng l="Rotate" v={o.rot} min={-180} max={180} step="1" u="°" set={v => set({ rot: v })} /><Rng l="Left / right" v={o.x} min={0} max={1} set={v => set({ x: v })} /><Rng l="Up / down" v={o.y} min={0} max={1} set={v => set({ y: v })} /><Rng l="Rounded corners" v={o.round} min={0} max={.5} set={v => set({ round: v })} /></div></>
  const trkv = k => trk[k], setTrkv = (k, p) => setTrk(x => ({ ...x, [k]: { ...x[k], ...p } }))

  return <main className="page ed"><h2>Editor</h2>
    <p className="muted">Edit a finished video with tracks: <b>V1</b> main (videos, pictures, text slides), <b>V2</b> a second video on top, text and logos with opacity, and three sound tracks (voice, background, effects). Everything stays in your browser until you save.</p>
    <input ref={fm} type="file" accept="video/*,image/*" multiple hidden onChange={pickMedia('main')} /><input ref={f2} type="file" accept="video/*" multiple hidden onChange={pickMedia('v2')} /><input ref={fi} type="file" accept="image/*" hidden onChange={addImage} /><input ref={fa} type="file" accept="audio/*" hidden onChange={pickAudio} /><input ref={fs} type="file" accept=".srt" hidden onChange={pickSrt} />
    {!hasAny && <div className="panel"><h3>Start</h3><div className="row tight"><button className="cta sm" onClick={() => openList('main')}>Choose a completed video</button><button className="ghost" onClick={() => fm.current.click()}>Video or picture from my device</button><button className="ghost" onClick={addSlide}>Start with a text slide</button></div><Pick target="main" /></div>}
    <canvas ref={cv} width={pw} height={ph} onPointerDown={grab} onPointerMove={move} onPointerUp={() => { drag.current = '' }} onPointerCancel={() => { drag.current = '' }} />
    {hasAny && <>
      <div className="ed-bar"><button className="cta sm" disabled={!dur} onClick={() => playing ? stop(false) : play()}>{playing ? 'Pause' : 'Play'}</button><span className="muted">{fmt(t)} / {fmt(dur)}</span>
        <input type="range" min="0" max={d1} step=".05" value={Math.min(t, d1)} onChange={e => seek(+e.target.value)} aria-label="Position" /><button className="ghost sm" onClick={snap}>Save frame</button></div>

      <div className="ed-tl" ref={tl}>
        <div className="ed-row"><span>V1</span><div className="ed-lane" style={{ height: 34 }}>{main.map((c, k) => <button key={c.id} className={'ed-it v1' + (c.id === sel ? ' on' : '')} style={{ left: pct(tm.off[k]), width: pct(idur(c)) }} onClick={() => { setSel(c.id); setTab('main'); seek(tm.off[k]) }}>{c.name}</button>)}</div></div>
        <div className="ed-row"><span>V2</span><div className="ed-lane" style={{ height: 26 }}>{v2.map(o => bar('v2', o, o.at, idur(o), o.name, 'v2'))}</div></div>
        <div className="ed-row"><span>Text</span><div className="ed-lane" style={{ height: Math.max(1, Math.min(ov.length, 3)) * 18 + 4 }}>{ov.map((o, k) => bar('ov', o, o.from, o.to - o.from, o.kind === 'text' ? o.text : o.name, o.kind === 'image' ? 'img' : 'txt', 2 + (k % 3) * 18, 16))}</div></div>
        {TRACKS.map(([k, l]) => <div className="ed-row" key={k}><span>{l.slice(0, 5)}</span><div className="ed-lane" style={{ height: 24, opacity: trk[k].mute ? .45 : 1 }}>{aud.filter(a => a.track === k).map(a => bar('aud', a, a.at, alen(a, dur), a.name, 'au ' + k))}</div></div>)}
        <div className="ed-ph" style={{ left: `calc(50px + (100% - 50px) * ${Math.min(t, d1) / d1})` }} /></div>
      <p className="hint">Drag the bars sideways to change when they start. Drag a V2 video, text or logo on the picture to move it.</p>
      <div className="seg tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'main' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={() => fm.current.click()}>Add video / picture</button><button className="ghost sm" onClick={() => openList('main')}>Add completed video</button><button className="ghost sm" onClick={addSlide}>Add text slide</button><button className="ghost sm" onClick={split}>Split at playhead</button></div><Pick target="main" />
        {mi ? <><h3>{mi.name}</h3><p className="hint">{mi.kind === 'video' ? 'Video' : mi.kind === 'image' ? 'Picture' : 'Text slide'} · item {mk + 1} of {main.length} · {fmt(idur(mi))} on the timeline</p>
          {mi.kind === 'video' && <><Rng l="Starts at" v={mi.start} min={0} max={mi.dur} step=".1" u=" s" set={v => updM(mi.id, { start: Math.min(v, mi.end - .2) })} /><Rng l="Ends at" v={mi.end} min={0} max={mi.dur} step=".1" u=" s" set={v => updM(mi.id, { end: Math.max(v, mi.start + .2) })} />
            <div className="row tight"><button className="ghost sm" onClick={() => trimHere('s')}>Cut start to playhead</button><button className="ghost sm" onClick={() => trimHere('e')}>Cut end at playhead</button></div>
            <div className="cols"><label>Speed<select value={mi.speed} onChange={e => updM(mi.id, { speed: +e.target.value })}>{SPEEDS.map(x => <option key={x} value={x}>{x}x</option>)}</select></label><Rng l="Sound of this clip" v={mi.vol} min={0} max={2} set={v => updM(mi.id, { vol: v })} /></div></>}
          {mi.kind === 'image' && <Rng l="Shown for" v={mi.len} min={1} max={60} step=".5" u=" s" set={v => updM(mi.id, { len: v })} />}
          {mi.kind === 'text' && <><label>Text<textarea rows={3} value={mi.text} onChange={e => updM(mi.id, { text: e.target.value })} /></label>
            <div className="cols"><label>Font<select value={mi.font} onChange={e => updM(mi.id, { font: e.target.value })}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label><label>Text color<input type="color" value={mi.color} onChange={e => updM(mi.id, { color: e.target.value })} /></label><label>Background<input type="color" value={mi.bg} onChange={e => updM(mi.id, { bg: e.target.value })} /></label><Rng l="Size" v={mi.size} min={.02} max={.25} set={v => updM(mi.id, { size: v })} /></div>
            <Rng l="Shown for" v={mi.len} min={1} max={60} step=".5" u=" s" set={v => updM(mi.id, { len: v })} /></>}
          <div className="row tight"><button className="ghost sm" disabled={!mk} onClick={() => shift(mi.id, -1)}>Move earlier</button><button className="ghost sm" disabled={mk === main.length - 1} onClick={() => shift(mi.id, 1)}>Move later</button><button className="ghost sm danger" onClick={() => { gone(mi.id); setMain(a => a.filter(x => x.id !== mi.id)) }}>Remove</button></div></>
          : <p className="hint">V1 plays its items one after another. Tap an item in the V1 row to edit it. A project can be only pictures and text too.</p>}</div>}

      {tab === 'v2' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={() => f2.current.click()}>Add video on V2</button><button className="ghost sm" onClick={() => openList('v2')}>Add completed video on V2</button></div><Pick target="v2" />
        {vi ? <><h3>{vi.name}</h3><Time o={vi} set={p => upd2(vi.id, p)} a="at" />
          <div className="row tight"><button className="ghost sm" onClick={() => upd2(vi.id, { at: +E.t.toFixed(1) })}>Start at playhead</button></div>
          <Place o={vi} set={p => upd2(vi.id, p)} />
          <div className="cols"><Rng l="Opacity" v={vi.opacity} min={0} max={1} set={v => upd2(vi.id, { opacity: v })} /><Rng l="Fade in / out" v={vi.fade} min={0} max={3} step=".5" u=" s" set={v => upd2(vi.id, { fade: v })} /></div>
          <Rng l="Starts at (in the video)" v={vi.start} min={0} max={vi.dur} step=".1" u=" s" set={v => upd2(vi.id, { start: Math.min(v, vi.end - .2) })} /><Rng l="Ends at (in the video)" v={vi.end} min={0} max={vi.dur} step=".1" u=" s" set={v => upd2(vi.id, { end: Math.max(v, vi.start + .2) })} />
          <div className="cols"><label>Speed<select value={vi.speed} onChange={e => upd2(vi.id, { speed: +e.target.value })}>{SPEEDS.map(x => <option key={x} value={x}>{x}x</option>)}</select></label><Rng l="Sound of this clip" v={vi.vol} min={0} max={2} set={v => upd2(vi.id, { vol: v })} /></div>
          <div className="row tight"><button className="ghost sm danger" onClick={() => { gone(vi.id); setV2(a => a.filter(x => x.id !== vi.id)) }}>Remove</button></div></>
          : <p className="hint">V2 videos sit on top of V1. Use them for picture in picture, split screen, or a second video over the first. Tap a V2 bar to edit it.</p>}</div>}

      {tab === 'over' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={addText}>Add text</button><button className="ghost sm" onClick={() => fi.current.click()}>Add logo / picture</button></div>
        {so?.kind === 'text' && <><label>Text<textarea rows={2} value={so.text} onChange={e => updO(so.id, { text: e.target.value })} /></label>
          <div className="cols"><label>Font<select value={so.font} onChange={e => updO(so.id, { font: e.target.value })}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label><label>Color<input type="color" value={so.color} onChange={e => updO(so.id, { color: e.target.value })} /></label></div>
          <div className="cols"><Rng l="Size" v={so.size} min={.02} max={.25} set={v => updO(so.id, { size: v })} /><Rng l="Opacity" v={so.opacity} min={0} max={1} set={v => updO(so.id, { opacity: v })} /></div>
          <div className="row tight"><label className="chk"><input type="checkbox" checked={!!so.bg} onChange={e => updO(so.id, { bg: e.target.checked ? 'rgba(0,0,0,.6)' : '' })} /> Dark box</label><label className="chk"><input type="checkbox" checked={so.stroke} onChange={e => updO(so.id, { stroke: e.target.checked })} /> Outline</label></div></>}
        {so?.kind === 'image' && <><p><b>{so.name}</b></p><Place o={so} set={p => updO(so.id, p)} /><Rng l="Opacity" v={so.opacity} min={0} max={1} set={v => updO(so.id, { opacity: v })} /></>}
        {so && <><Rng l="Fade in / out" v={so.fade} min={0} max={3} step=".5" u=" s" set={v => updO(so.id, { fade: v })} /><Time o={so} set={p => updO(so.id, p)} a="from" b="to" />
          <div className="row tight"><button className="ghost sm" onClick={() => updO(so.id, { from: +E.t.toFixed(1) })}>Start at playhead</button><button className="ghost sm" onClick={() => updO(so.id, { to: +E.t.toFixed(1) })}>End at playhead</button><button className="ghost sm" onClick={() => updO(so.id, { from: 0, to: dur })}>Whole video</button><button className="ghost sm danger" onClick={() => { setOv(a => a.filter(o => o.id !== so.id)); setSel('') }}>Delete</button></div></>}
        {!so && <p className="hint">Text and logos sit above V1 and V2 and can be faded or made see-through. Tap one in the “Text” row to edit it.</p>}</div>}

      {tab === 'look' && <div className="panel"><p className="hint">Look and shape apply to the main track (V1).</p><div className="row tight">{LOOKS.map(([n, v]) => <button key={n} className="ghost sm" onClick={() => setLook(l => ({ ...l, ...v }))}>{n}</button>)}</div>
        <div className="cols"><Rng l="Brightness" v={look.bright} min={.2} max={2} set={v => ed('bright', v)} /><Rng l="Contrast" v={look.contrast} min={.2} max={2} set={v => ed('contrast', v)} /><Rng l="Color" v={look.sat} min={0} max={3} set={v => ed('sat', v)} /><Rng l="Black & white" v={look.gray} min={0} max={1} set={v => ed('gray', v)} /><Rng l="Sepia" v={look.sepia} min={0} max={1} set={v => ed('sepia', v)} /><Rng l="Hue" v={look.hue} min={0} max={360} step="1" u="°" set={v => ed('hue', v)} /><Rng l="Blur" v={look.blur} min={0} max={10} step=".5" u=" px" set={v => ed('blur', v)} /></div>
        <h3>Shape</h3><div className="cols"><label>Format<select value={look.aspect} onChange={e => ed('aspect', e.target.value)}><option value="orig">Same as first video</option>{Object.keys(ASP).map(a => <option key={a}>{a}</option>)}</select></label>
          <label>Fit<select value={look.fit} onChange={e => ed('fit', e.target.value)}><option value="contain">Whole video, black bars</option><option value="blur">Whole video, blurred sides</option><option value="cover">Fill and crop</option></select></label>
          <Rng l="Zoom" v={look.zoom} min={1} max={3} set={v => ed('zoom', v)} /><Rng l="Move left / right" v={look.px} min={-1} max={1} set={v => ed('px', v)} /><Rng l="Move up / down" v={look.py} min={-1} max={1} set={v => ed('py', v)} /></div>
        <div className="row tight"><button className="ghost sm" onClick={() => ed('rot', (look.rot + 1) % 4)}>Rotate 90°</button><label className="chk"><input type="checkbox" checked={look.flip} onChange={e => ed('flip', e.target.checked)} /> Mirror</label></div>
        <div className="cols"><Rng l="Fade in (all tracks)" v={look.fi} min={0} max={5} step=".5" u=" s" set={v => ed('fi', v)} /><Rng l="Fade out (all tracks)" v={look.fo} min={0} max={5} step=".5" u=" s" set={v => ed('fo', v)} /></div></div>}

      {tab === 'audio' && <div className="panel"><p className="hint">Voice holds the sound of your V1 and V2 videos plus voiceovers. Background and Effects are for music and sound files. Use headphones when recording a voiceover.</p>
        {TRACKS.map(([k, l]) => <div className="trk" key={k}><div className="row tight"><b>{l}</b>
          {k === 'voice' && <button className={'ghost sm' + (recording ? ' danger' : '')} onClick={() => recording ? stop(false) : startVoice()}>{recording ? 'Stop recording' : 'Record voiceover'}</button>}
          <button className="ghost sm" onClick={() => addTrackFile(k)}>{k === 'voice' ? 'Add voice file' : k === 'bg' ? 'Add music' : 'Add sound effect'}</button>
          <label className="chk"><input type="checkbox" checked={trkv(k).mute} onChange={e => setTrkv(k, { mute: e.target.checked })} /> Mute</label></div>
          <Rng l={l + ' volume'} v={trkv(k).vol} min={0} max={2} set={v => setTrkv(k, { vol: v })} />
          <div className="row tight">{aud.filter(a => a.track === k).map(a => <button key={a.id} className={'ghost sm' + (a.id === sel ? ' on' : '')} onClick={() => setSel(a.id)}>{a.name}</button>)}</div></div>)}
        {ai && <div className="trk"><h3>{ai.name}</h3><Time o={ai} set={p => updA(ai.id, p)} a="at" /><div className="row tight"><button className="ghost sm" onClick={() => updA(ai.id, { at: +E.t.toFixed(1) })}>Start at playhead</button></div>
          <Rng l="Volume" v={ai.vol} min={0} max={2} set={v => updA(ai.id, { vol: v })} />
          {ai.track === 'bg' && <label className="chk"><input type="checkbox" checked={ai.loop} onChange={e => updA(ai.id, { loop: e.target.checked })} /> Repeat until the video ends</label>}
          {!ai.loop && <><Rng l="Use from" v={ai.start} min={0} max={ai.dur} step=".1" u=" s" set={v => updA(ai.id, { start: Math.min(v, ai.end - .2) })} /><Rng l="Use until" v={ai.end} min={0} max={ai.dur} step=".1" u=" s" set={v => updA(ai.id, { end: Math.max(v, ai.start + .2) })} /></>}
          <div className="row tight"><button className="ghost sm danger" onClick={() => { gone(ai.id); setAud(a => a.filter(x => x.id !== ai.id)) }}>Remove</button></div></div>}</div>}

      {tab === 'subs' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={() => fs.current.click()}>Upload .srt subtitles</button>{subs.length > 0 && <button className="ghost sm danger" onClick={() => setSubs([])}>Remove</button>}</div>
        <p className="hint">{subs.length ? `${subs.length} lines loaded.` : 'No subtitles yet.'} Times follow the edited timeline, so cut the video first, then add the subtitles. Urdu text uses the Naskh font automatically.</p>
        <Rng l="Size" v={look.subSize} min={.03} max={.12} set={v => ed('subSize', v)} /><div className="row tight"><label>Color<input type="color" value={look.subColor} onChange={e => ed('subColor', e.target.value)} /></label><label className="chk"><input type="checkbox" checked={look.subBg} onChange={e => ed('subBg', e.target.checked)} /> Dark box</label></div></div>}

      {tab === 'exp' && <div className="panel"><label>File name<input value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>Quality<select value={look.res} onChange={e => ed('res', +e.target.value)}><option value={480}>480p (small)</option><option value={720}>720p</option><option value={1080}>1080p</option></select></label>
        <p className="hint">Export plays the whole timeline once in real time, so it takes about {fmt(dur)}. Keep this tab open and in front. Saved as {pickMime()?.includes('mp4') ? 'MP4' : 'WebM'} (the best this browser supports). Two videos at once need a reasonably fast computer.</p>
        <div className="row tight"><button className="cta sm" disabled={prog !== null || !dur} onClick={exportIt}>{prog === null ? 'Export video' : `Exporting ${Math.round(prog * 100)}%`}</button>{prog !== null && <button className="ghost sm danger" onClick={cancel}>Cancel</button>}</div>
        {prog !== null && <progress value={prog} max="1" style={{ width: '100%' }} />}
        {out && <><h3>Done</h3><video src={out.url} controls style={{ maxWidth: '100%', maxHeight: '40vh', borderRadius: 16 }} />
          <div className="row tight"><button className="cta sm" onClick={() => save(out.blob, `${title || 'edited'}.${out.ext}`)}>Download</button><button className="ghost" onClick={toDrive}>Save to Drive</button>{link && <a className="ghost" href={link} target="_blank" rel="noreferrer">Open in Drive</a>}{link && start?.r && <button className="ghost" onClick={asOutput}>Use as this video's Output link</button>}</div>
          <p className="hint">Drive copies go to the “Edited” folder of the project.</p></>}</div>}
    </>}
  </main>
}
