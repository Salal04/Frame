import { useState, useRef, useEffect } from 'react'
import * as G from './drive.js'
import * as P from './playlist.js'
import { Confirm } from './Classic.jsx'

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

const LABEL = { voice: 'Voice', bg: 'Music', fx: 'FX' }
const pack = (items, a, b) => { const ends = [], at = {}; items.forEach(o => { let r = ends.findIndex(e => e <= a(o) + 1e-6); if (r < 0) r = ends.length; ends[r] = b(o); at[o.id] = r }); return { at, n: Math.max(1, ends.length) } }
const tlab = x => x >= 60 ? `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}` : `${+x.toFixed(1)}s`
// audio waveform: 400 loudness peaks (0..1) so audio bars on the timeline show the sound
const peaksOf = async file => {
  try {
    const A = window.AudioContext || window.webkitAudioContext, c = new A(), b = await c.decodeAudioData(await file.arrayBuffer()), d = b.getChannelData(0), N = 400, k = Math.max(1, Math.floor(d.length / N)), p = []
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * k; j < Math.min(d.length, (i + 1) * k); j += Math.max(1, k >> 6)) m = Math.max(m, Math.abs(d[j])); p.push(m) }
    c.close(); const mx = Math.max(...p, .01); return p.map(v => +(v / mx).toFixed(2))
  } catch { return null }
}
// selection box of a picture / video / text on the canvas: centre, size, rotation and the 4 corner handles (+ a rotate handle)
const geo = (o, b, k) => {
  const w = b[2], h = b[3], cx = b[0] + w / 2, cy = b[1] + h / 2, a = (o.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), pt = (x, y) => [cx + x * cs - y * sn, cy + x * sn + y * cs]
  const hs = [['nw', -w / 2, -h / 2], ['ne', w / 2, -h / 2], ['se', w / 2, h / 2], ['sw', -w / 2, h / 2]]; if (o.kind !== 'text') hs.push(['rot', 0, -h / 2 - 30 * k])
  return { cx, cy, w, h, a, hs: hs.map(([n, x, y]) => ({ n, p: pt(x, y) })) }
}
const inBox = (o, b, x, y, pad) => { const g = geo(o, b, 0), dx = x - g.cx, dy = y - g.cy, c = Math.cos(-g.a), s = Math.sin(-g.a); return Math.abs(dx * c - dy * s) <= g.w / 2 + pad && Math.abs(dx * s + dy * c) <= g.h / 2 + pad }

const EXCSS = `
.ex-top{display:grid;grid-template-columns:minmax(300px,400px) minmax(0,1fr);gap:14px;align-items:start;margin:10px 0}
.ex-left{border:1px solid rgba(127,127,127,.3);border-radius:16px;padding:10px;max-height:calc(62vh + 64px);min-height:260px;overflow:auto;background:rgba(127,127,127,.06)}
.ex-left .panel{border:0;box-shadow:none;background:transparent;padding:6px 2px;margin:0}
.ex-left .cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ex-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px}
.ex-tabs button{padding:7px 2px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;font-size:12px;cursor:pointer;line-height:1.2}
.ex-tabs button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.ex-stage{min-width:0}
.ex-cvw{position:relative;margin:0 auto;background:#000;border-radius:12px;overflow:hidden}
.ex .ex-cvw canvas{position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border-radius:0;box-shadow:none;background:#000;touch-action:none}
.ex .ex-cvw canvas.ex-gz{background:transparent}
.ex-empty,.ex-drop{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;color:#fff;font-size:14px;pointer-events:none}
.ex-empty{margin:10px;border:2px dashed rgba(255,255,255,.35);border-radius:12px}
.ex-drop{background:rgba(37,99,235,.6);border:3px dashed #fff;font-weight:700;font-size:18px}
.ex-bar{display:flex;gap:8px;align-items:center;margin-top:8px}
.ex-bar input[type=range]{flex:1;min-width:60px}
.ex .ghost.on{outline:2px solid #2563eb}
.tl{margin-top:12px;border:1px solid rgba(127,127,127,.3);border-radius:16px;padding:8px;background:rgba(127,127,127,.06)}
.tl-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.tl-tools .sep{width:1px;height:20px;background:rgba(127,127,127,.4);margin:0 2px}
.tl-tools input[type=range]{width:110px}
.tl-body{display:flex}
.tl-labs{flex:none;width:62px}
.tl-lab{box-sizing:border-box;border-bottom:1px solid rgba(127,127,127,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;gap:2px}
.tl-mute{border:0;background:none;cursor:pointer;font-size:13px;padding:0}
.tl-scroll{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;position:relative}
.tl-in{position:relative}
.tl-ruler{height:26px;position:relative;border-bottom:1px solid rgba(127,127,127,.25);cursor:col-resize;box-sizing:border-box;user-select:none;touch-action:none}
.tl-tick{position:absolute;top:0;bottom:0;border-left:1px solid rgba(127,127,127,.6);padding-left:3px;font-size:10px;pointer-events:none;opacity:.85;white-space:nowrap}
.tl-minor{position:absolute;left:0;right:0;bottom:0;height:5px;pointer-events:none}
.tl-lane{position:relative;box-sizing:border-box;border-bottom:1px solid rgba(127,127,127,.25);touch-action:none}
.tl-lane.drop{background:rgba(37,99,235,.18);outline:2px dashed #2563eb;outline-offset:-2px}
.tl-it{position:absolute;box-sizing:border-box;border-radius:7px;color:#fff;font-size:11px;display:flex;align-items:center;overflow:hidden;cursor:grab;touch-action:none;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,.35)}
.tl-it span{padding:0 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;position:relative;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.tl-it.on{outline:2px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.9);z-index:2}
.tl-it.drag{opacity:.85;z-index:6;cursor:grabbing}
.tl-h{position:absolute;top:0;bottom:0;width:9px;cursor:ew-resize;background:rgba(255,255,255,.18);z-index:3}
.tl-h.l{left:0}.tl-h.r{right:0}
.tl-it:hover .tl-h,.tl-it.on .tl-h{background:rgba(255,255,255,.5)}
.tl-wave{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;pointer-events:none}
.tl-ph{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #ef4444;pointer-events:none;z-index:8}
.tl-ph i{position:absolute;top:0;left:-7px;width:12px;height:12px;background:#ef4444;clip-path:polygon(0 0,100% 0,50% 100%)}
.tl-guide{position:absolute;top:0;bottom:0;width:0;border-left:1px dashed #f43f5e;pointer-events:none;z-index:7}
.tl-ins{position:absolute;top:2px;bottom:2px;width:4px;margin-left:-2px;background:#facc15;border-radius:2px;z-index:7;pointer-events:none}
.tl-it.video{background:#2563eb}.tl-it.image{background:#0891b2}.tl-it.text{background:#6366f1}
.tl-it.v2{background:#9333ea}.tl-it.txt{background:#d97706}.tl-it.img{background:#0d9488}
.tl-it.voice{background:#dc2626}.tl-it.bg{background:#16a34a}.tl-it.fx{background:#db2777}
.tl-hint{font-size:12px;opacity:.7;margin:6px 2px 0}
.ex-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;border:1px solid rgba(127,127,127,.3);margin:6px 0;cursor:pointer;margin-top:6px}
.ex-opt.on{border-color:#2563eb;background:rgba(37,99,235,.1)}.ex-opt.off{opacity:.5;cursor:not-allowed}
.ex-opt input{margin-top:4px}.ex-opt span{display:flex;flex-direction:column;gap:2px}.ex-opt small{opacity:.75}
.ex-sec{border-top:1px solid rgba(127,127,127,.3);margin-top:14px;padding-top:4px}
@media (max-width:900px){.ex-top{grid-template-columns:1fr}.ex-left{max-height:none}}
`

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

export default function Editor({ w, run, start, onSocial }) {
  const [main, setMain] = useState([]), [v2, setV2] = useState([]), [ov, setOv] = useState([]), [aud, setAud] = useState([]), [subs, setSubs] = useState([]), [look, setLook] = useState(LOOK0), [trk, setTrk] = useState(TRK0)
  const [sel, setSel] = useState(''), [tab, setTab] = useState('main'), [t, setT] = useState(0), [playing, setPlaying] = useState(false), [recording, setRecording] = useState(false)
  const [prog, setProg] = useState(null), [out, setOut] = useState(null), [list, setList] = useState(null), [link, setLink] = useState(''), [title, setTitle] = useState(start?.r?.title || '')
  const [saved, setSaved] = useState(null), [saveMode, setSaveMode] = useState('copy'), [ask, setAsk] = useState(null)   // saved = what happened in Drive: { mode: 'copy' | 'replace', link, id, row }
  const [pps, setPps] = useState(40), [snapOn, setSnapOn] = useState(true), [dropLane, setDropLane] = useState(''), [fileOver, setFileOver] = useState(false), [vd, setVd] = useState(null), [guideX, setGuideX] = useState(null)
  const tm = timing(main, v2, aud, ov), S = useRef(), E = useRef({ t: 0, t0: 0, w0: 0, playing: false, raf: 0 }).current, D = useRef(() => { })
  const cv = useRef(), els = useRef({}), imgs = useRef({}), nodes = useRef({}), bx = useRef({}), drag = useRef(null), td = useRef(null), vdr = useRef(null), sc = useRef(false), routed = useRef({}), ovc = useRef(), tl = useRef(), KB = useRef({}), ac = useRef(), bus = useRef(), tg = useRef({}), vo = useRef(null), audTrack = useRef('bg')
  const fm = useRef(), f2 = useRef(), fi = useRef(), fa = useRef(), fs = useRef()
  S.current = { main, v2, ov, aud, subs, look, trk, tm, sel, pps, snap: snapOn }

  // ---------- undo / redo: every change is remembered (a whole drag counts as one step) ----------
  const HI = useRef({ past: [], future: [], stable: null, timer: 0 }).current
  const snapNow = () => { const s = S.current; return { main: s.main, v2: s.v2, ov: s.ov, aud: s.aud, subs: s.subs, look: s.look, trk: s.trk } }
  const flush = () => { clearTimeout(HI.timer); const cur = snapNow(); if (!HI.stable) { HI.stable = cur; return } if (Object.keys(cur).some(k => cur[k] !== HI.stable[k])) { HI.past.push(HI.stable); if (HI.past.length > 80) HI.past.shift(); HI.future = []; HI.stable = cur } }
  useEffect(() => { if (!HI.stable) HI.stable = snapNow(); clearTimeout(HI.timer); HI.timer = setTimeout(flush, 400) }, [main, v2, ov, aud, subs, look, trk])
  const restore = s => { setMain(s.main); setV2(s.v2); setOv(s.ov); setAud(s.aud); setSubs(s.subs); setLook(s.look); setTrk(s.trk) }
  const undo = () => { flush(); const p = HI.past.pop(); if (!p) return; HI.future.push(HI.stable); HI.stable = p; restore(p); setSel('') }
  const redo = () => { flush(); const n = HI.future.pop(); if (!n) return; HI.past.push(HI.stable); HI.stable = n; restore(n) }
  const firstSized = main.find(c => c.vw), [pw, ph] = dims(look, 540, firstSized)

  // ---------- picture ----------
  const gizmo = () => {
    const g = ovc.current, c = cv.current; if (!g || !c || E.exporting) return
    if (g.width !== c.width || g.height !== c.height) { g.width = c.width; g.height = c.height }
    const x = g.getContext('2d'), W = g.width, Hh = g.height, k = W / (g.clientWidth || W), o = findO(S.current.sel), b = o && bx.current[o.id]
    x.clearRect(0, 0, W, Hh)
    if (b) {
      const q = geo(o, b, k); x.save(); x.strokeStyle = '#38bdf8'; x.lineWidth = 2 * k; x.translate(q.cx, q.cy); x.rotate(q.a); x.strokeRect(-q.w / 2, -q.h / 2, q.w, q.h)
      if (o.kind !== 'text') { x.beginPath(); x.moveTo(0, -q.h / 2); x.lineTo(0, -q.h / 2 - 30 * k); x.stroke() }
      x.restore(); x.strokeStyle = '#38bdf8'; x.fillStyle = '#fff'; x.lineWidth = 2 * k
      q.hs.forEach(h => { x.beginPath(); if (h.n === 'rot') x.arc(h.p[0], h.p[1], 7 * k, 0, 7); else x.rect(h.p[0] - 6 * k, h.p[1] - 6 * k, 12 * k, 12 * k); x.fill(); x.stroke() })
    }
    if (E.guides) { x.save(); x.strokeStyle = '#f43f5e'; x.lineWidth = k; x.setLineDash([6 * k, 4 * k]); if (E.guides.x) { x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, Hh); x.stroke() } if (E.guides.y) { x.beginPath(); x.moveTo(0, Hh / 2); x.lineTo(W, Hh / 2); x.stroke() } x.restore() }
  }
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
    bx.current = boxes; gizmo()
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
      const g = ac.current.createGain(); ac.current.createMediaElementSource(el).connect(g); g.connect(tg.current[it.track || 'voice']); nodes.current[id] = g; routed.current[id] = it.track || 'voice'
    })
    await ac.current.resume()
  }
  useEffect(() => {
    if (!bus.current) return
    Object.entries(nodes.current).forEach(([id, g]) => { const it = itemOf(id); if (!it) return; g.gain.value = it.vol ?? 1; const tk = it.track || 'voice'; if (routed.current[id] !== tk) { g.disconnect(); g.connect(tg.current[tk]); routed.current[id] = tk } })
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
  const thumbOf = v => new Promise(res => {
    const done = () => { let r = ''; try { const c = document.createElement('canvas'); c.height = 60; c.width = Math.max(1, Math.round(60 * v.videoWidth / (v.videoHeight || 1))); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); r = c.toDataURL('image/jpeg', .6) } catch { } v.onseeked = () => D.current(); v.currentTime = 0; res(r) }
    v.onseeked = done; setTimeout(() => { if (v.onseeked === done) done() }, 2500); v.currentTime = Math.min(.5, (v.duration || 1) / 2)
  })
  const addMedia = async (file, nm, target, at) => {
    const url = URL.createObjectURL(file), id = uid(), name = nm || file.name
    if (/^image\//.test(file.type)) {
      if (target !== 'main') throw new Error('V2 takes videos. Use “Text & logo” to place a picture over the video.')
      const im = new Image(); await new Promise((r, j) => { im.onload = r; im.onerror = () => j(new Error('This image cannot be opened.')); im.src = url }); imgs.current[id] = im
      setMain(a => [...a, { id, kind: 'image', name, url, thumb: url, vw: im.naturalWidth, vh: im.naturalHeight, len: 5 }])
    } else {
      const v = mkEl(url, true); await meta(v); els.current[id] = v; const thumb = await thumbOf(v)
      const base = { id, kind: 'video', name, url, thumb, vw: v.videoWidth, vh: v.videoHeight, dur: v.duration, start: 0, end: v.duration, speed: 1, vol: 1 }
      if (target === 'v2') setV2(a => [...a, { ...base, at: +(at ?? E.t).toFixed(1), x: .75, y: .75, w: .38, opacity: 1, rot: 0, round: 0, fade: 0 }]); else setMain(a => [...a, base])
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
    const url = URL.createObjectURL(file), el = mkEl(url, false); await meta(el); const id = uid(), bg = track === 'bg'; els.current[id] = el; const peaks = await peaksOf(file)
    setAud(a => [...a, { id, track, name: file.name, url, peaks, dur: el.duration, at: +(at ?? (bg ? 0 : E.t)).toFixed(2), start: 0, end: el.duration, vol: bg ? .5 : 1, loop: bg }]); setSel(id); setTab('audio')
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
  const gone = id => { els.current[id]?.pause(); setSel('') }
  const split = () => {
    const s = S.current, { i, local, inside } = locate(s, E.t), c = s.main[i]; if (!inside || !c || c.kind !== 'video' || local < c.start + .2 || local > c.end - .2) return
    const a = { ...c, id: uid(), end: local }, b = { ...c, id: uid(), start: local }; els.current[a.id] = mkEl(c.url, true); els.current[b.id] = mkEl(c.url, true)
    setMain(m => m.flatMap(x => x.id === c.id ? [a, b] : [x])); setSel(b.id)
  }
  const trimHere = side => { const { i, local, inside } = locate(S.current, E.t), c = S.current.main[i]; if (inside && c?.kind === 'video') updM(c.id, side === 's' ? { start: Math.min(local, c.end - .2) } : { end: Math.max(local, c.start + .2) }) }
  const shift = (id, d) => setMain(cs => { const i = cs.findIndex(c => c.id === id), j = i + d; if (j < 0 || j >= cs.length) return cs; const a = [...cs];[a[i], a[j]] = [a[j], a[i]]; return a })
  const addText = () => { const o = { id: uid(), kind: 'text', text: 'Your text', x: .5, y: .5, size: .07, color: '#ffffff', bg: '', stroke: true, font: 'Fredoka', weight: 700, opacity: 1, fade: 0, from: +E.t.toFixed(1), to: +(tm.total > E.t + .5 ? Math.min(E.t + 3, tm.total) : E.t + 3).toFixed(1) }; setOv(a => [...a, o]); setSel(o.id); setTab('over') }
  // ---------- mouse editing: picture (drag to move, corner handles to resize, top handle to rotate, wheel to resize) ----------
  const addImageFile = (f, at) => {
    const id = uid(), im = new Image(); im.onload = () => { imgs.current[id] = im; D.current() }; im.src = URL.createObjectURL(f)
    const from = +(at ?? E.t).toFixed(1)
    setOv(a => [...a, { id, kind: 'image', name: f.name, x: .88, y: .12, w: .18, rot: 0, round: 0, opacity: 1, fade: 0, from, to: +Math.max(tm.total, from + 5).toFixed(1) }]); setSel(id); setTab('over')
  }
  const addImage = e => { const f = e.target.files[0]; e.target.value = ''; if (f) addImageFile(f, 0) }
  const cpt = e => { const r = ovc.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.current.width, (e.clientY - r.top) / r.height * cv.current.height] }
  const kOf = () => cv.current.width / (ovc.current.clientWidth || cv.current.width)
  const findO = id => S.current.v2.find(o => o.id === id) || S.current.ov.find(o => o.id === id)
  const upO = (o, p) => o.kind === 'video' ? upd2(o.id, p) : updO(o.id, p)
  const hitO = (x, y, k) => [...S.current.v2, ...S.current.ov].reverse().find(o => { const b = bx.current[o.id]; return b && inBox(o, b, x, y, 6 * k) })
  const grab = e => {
    if (e.button) return
    const [x, y] = cpt(e), s = S.current, k = kOf(), W = cv.current.width, H = cv.current.height, cur = findO(s.sel), b = cur && bx.current[cur.id]
    if (cur && b) { const g = geo(cur, b, k), h = g.hs.find(q => Math.hypot(q.p[0] - x, q.p[1] - y) <= 12 * k); if (h) { drag.current = { mode: h.n === 'rot' ? 'rot' : 'scale', o: cur, g, d0: Math.hypot(x - g.cx, y - g.cy) || 1 }; e.currentTarget.setPointerCapture(e.pointerId); return } }
    const hit = hitO(x, y, k)
    if (hit) { setSel(hit.id); setTab(hit.kind === 'video' ? 'v2' : 'over'); drag.current = { mode: 'move', o: hit, dx: hit.x - x / W, dy: hit.y - y / H }; e.currentTarget.setPointerCapture(e.pointerId); return }
    const { i, inside } = locate(s, E.t); if (inside) { setSel(s.main[i].id); setTab('main') } else setSel('')
    if (s.look.zoom > 1) { drag.current = { mode: 'pan', x, y, px: s.look.px, py: s.look.py }; e.currentTarget.setPointerCapture(e.pointerId) }
  }
  const move = e => {
    const d = drag.current, [x, y] = cpt(e), W = cv.current.width, H = cv.current.height, k = kOf()
    if (!d) {
      const cur = findO(S.current.sel), b = cur && bx.current[cur.id]; let cs = 'default'
      if (cur && b) { const h = geo(cur, b, k).hs.find(q => Math.hypot(q.p[0] - x, q.p[1] - y) <= 12 * k); if (h) cs = h.n === 'rot' ? 'grab' : h.n === 'nw' || h.n === 'se' ? 'nwse-resize' : 'nesw-resize' }
      if (cs === 'default' && hitO(x, y, k)) cs = 'move'
      if (ovc.current.style.cursor !== cs) ovc.current.style.cursor = cs
      return
    }
    const o = d.o
    if (d.mode === 'move') {
      let nx = clamp(x / W + d.dx, 0, 1), ny = clamp(y / H + d.dy, 0, 1), g = null
      if (S.current.snap && !e.altKey) { const th = 8 * k; if (Math.abs(nx * W - W / 2) < th) { nx = .5; g = { ...g, x: 1 } } if (Math.abs(ny * H - H / 2) < th) { ny = .5; g = { ...g, y: 1 } } }
      E.guides = g; upO(o, { x: +nx.toFixed(4), y: +ny.toFixed(4) })
    } else if (d.mode === 'scale') { const f = Math.hypot(x - d.g.cx, y - d.g.cy) / d.d0; upO(o, o.kind === 'text' ? { size: clamp(o.size * f, .02, .4) } : { w: clamp(o.w * f, .05, 3) }) }
    else if (d.mode === 'rot') { let a = Math.atan2(y - d.g.cy, x - d.g.cx) * 180 / Math.PI + 90; a = ((a + 540) % 360) - 180; const q = Math.round(a / 15) * 15; if (S.current.snap && !e.altKey && Math.abs(a - q) < 4) a = q; upO(o, { rot: Math.round(a) }) }
    else if (d.mode === 'pan') setLook(l => ({ ...l, px: clamp(d.px + (x - d.x) / (W / 2), -1, 1), py: clamp(d.py + (y - d.y) / (H / 2), -1, 1) }))
  }
  const up = () => { drag.current = null; E.guides = null; D.current() }
  const dbl = () => { const o = findO(S.current.sel); if (o) { setTab(o.kind === 'video' ? 'v2' : 'over'); setTimeout(() => document.getElementById('ex-txt')?.focus(), 60) } }
  useEffect(() => {
    const g = ovc.current; if (!g) return
    const h = e => { const o = findO(S.current.sel); if (!o) return; e.preventDefault(); const f = e.deltaY < 0 ? 1.06 : 1 / 1.06; upO(o, o.kind === 'text' ? { size: clamp(o.size * f, .02, .4) } : { w: clamp(o.w * f, .05, 3) }) }
    g.addEventListener('wheel', h, { passive: false }); return () => g.removeEventListener('wheel', h)
  }, [])

  // ---------- mouse editing: timeline (move, trim edges, reorder V1, switch audio track, scrub, zoom) ----------
  const tAt = e => { const r = tl.current.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left + tl.current.scrollLeft) / S.current.pps) }
  const snapPts = skip => { const s = S.current, p = [0, E.t, s.tm.main]; s.main.forEach((c, k) => p.push(s.tm.off[k])); s.v2.forEach(o => o.id !== skip && p.push(o.at, o.at + idur(o))); s.ov.forEach(o => o.id !== skip && p.push(o.from, o.to)); s.aud.forEach(a => a.id !== skip && p.push(a.at, a.at + alen(a, s.tm.total))); return p }
  const snapMove = (a, len, skip) => {
    if (!S.current.snap) return { a, line: null }
    const th = 8 / S.current.pps; let b = null
    snapPts(skip).forEach(p => [[a, 0], [a + len, -len]].forEach(([v, off]) => { const dd = Math.abs(v - p); if (dd < th && (!b || dd < b.d)) b = { d: dd, a: p + off, line: p } }))
    return b ? { a: b.a, line: b.line } : { a, line: null }
  }
  const trim = (d, dt) => {
    const s = S.current, o = d.o, Lf = d.edge === 'l', sp = o.speed || 1, r2 = v => +v.toFixed(2)
    const e0 = d.kind === 'v1' ? 0 : d.kind === 'ov' ? (Lf ? o.from : o.to) : Lf ? o.at : o.at + (d.kind === 'aud' ? alen(o, s.tm.total) : idur(o))
    let g = null; if (d.kind !== 'v1') { const q = snapMove(e0 + dt, 0, o.id); dt = q.a - e0; g = q.line } setGuideX(g)
    if (d.kind === 'v1') { if (o.kind === 'video') updM(o.id, Lf ? { start: r2(clamp(o.start + dt * sp, 0, o.end - .2)) } : { end: r2(clamp(o.end + dt * sp, o.start + .2, o.dur)) }); else updM(o.id, { len: r2(clamp(o.len + (Lf ? -dt : dt), .5, 600)) }) }
    else if (d.kind === 'v2') { if (Lf) { const q = clamp(dt, -o.at, (o.end - .2 - o.start) / sp); upd2(o.id, { start: r2(o.start + q * sp), at: r2(o.at + q) }) } else upd2(o.id, { end: r2(clamp(o.end + dt * sp, o.start + .2, o.dur)) }) }
    else if (d.kind === 'ov') updO(o.id, Lf ? { from: r2(clamp(o.from + dt, 0, o.to - .2)) } : { to: r2(Math.max(o.from + .2, o.to + dt)) })
    else if (Lf) { const q = clamp(dt, Math.max(-o.at, -o.start), o.end - .2 - o.start); updA(o.id, { start: r2(o.start + q), at: r2(o.at + q) }) }
    else updA(o.id, { end: r2(clamp(o.end + dt, o.start + .2, o.dur)) })
  }
  const moveBar = (d, e, dt) => {
    const s = S.current, o = d.o
    if (d.kind === 'v1') {
      const others = s.main.filter(c => c.id !== o.id), mid = s.tm.off[d.k0] + idur(o) / 2 + dt; let acc = 0, idx = 0
      others.forEach(c => { if (acc + idur(c) / 2 < mid) idx++; acc += idur(c) }); vdr.current = { id: o.id, dx: e.clientX - d.x, idx }; setVd(vdr.current); return
    }
    const a0 = d.kind === 'ov' ? o.from : o.at, len = d.kind === 'ov' ? o.to - o.from : d.kind === 'v2' ? idur(o) : alen(o, s.tm.total), q = snapMove(Math.max(0, a0 + dt), len, o.id), a = +q.a.toFixed(2); setGuideX(q.line)
    if (d.kind === 'v2') upd2(o.id, { at: a })
    else if (d.kind === 'ov') updO(o.id, { from: a, to: +(a + len).toFixed(2) })
    else { const ln = document.elementsFromPoint(e.clientX, e.clientY).map(n => n.dataset?.lane).find(l => TRACKS.some(([k]) => k === l)); d.lane = ln; updA(o.id, { at: a }); setDropLane(ln || ''); vdr.current = { id: o.id, dx: 0, dy: e.clientY - d.y }; setVd(vdr.current) }
  }
  const bdown = (e, kind, o) => {
    if (e.button) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
    td.current = { kind, o, edge: e.target.dataset?.edge || '', x: e.clientX, y: e.clientY, moved: false, k0: S.current.main.findIndex(c => c.id === o.id) }
    setSel(o.id); setTab(kind === 'v1' ? 'main' : kind === 'v2' ? 'v2' : kind === 'ov' ? 'over' : 'audio')
  }
  const bmove = e => { const d = td.current; if (!d) return; if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return; d.moved = true; const dt = (e.clientX - d.x) / S.current.pps; if (d.edge) trim(d, dt); else moveBar(d, e, dt) }
  const bup = e => {
    const d = td.current, v = vdr.current; td.current = null; vdr.current = null; setVd(null); setGuideX(null); setDropLane(''); if (!d) return
    if (d.kind === 'v1' && d.moved && !d.edge && v && v.idx !== d.k0) setMain(a => { const c = a.find(x => x.id === v.id), r = a.filter(x => x.id !== v.id); r.splice(v.idx, 0, c); return r })
    else if (d.kind === 'v1' && !d.moved) seek(tAt(e))
    else if (d.kind === 'aud' && d.moved && !d.edge && d.lane && d.lane !== d.o.track) updA(d.o.id, { track: d.lane })
  }
  const scrub = x => { if (E.seeking) { E.pend = x; return } E.seeking = true; seek(x).finally(() => { E.seeking = false; if (E.pend != null) { const p = E.pend; E.pend = null; scrub(p) } }) }
  const sdown = e => { if (e.button || e.target !== e.currentTarget) return; e.currentTarget.setPointerCapture(e.pointerId); sc.current = true; if (e.currentTarget.dataset.lane) setSel(''); scrub(tAt(e)) }
  const smove = e => { if (sc.current) scrub(tAt(e)) }
  const sup = () => { sc.current = false }
  const zoomTo = (np, cx) => {
    const el = tl.current, old = S.current.pps; np = clamp(np, 4, 400); const r = el.getBoundingClientRect(), ax = cx ?? r.left + r.width / 2, ta = (ax - r.left + el.scrollLeft) / old
    setPps(np); requestAnimationFrame(() => { el.scrollLeft = ta * np - (ax - r.left) })
  }
  const fit = () => { const el = tl.current; if (!el) return; setPps(clamp((el.clientWidth - 24) / Math.max(S.current.tm.total * 1.25 + 1, 5), 4, 400)); el.scrollLeft = 0 }
  useEffect(() => { if (!E.fitted && tm.total > 0) { E.fitted = true; fit() } }, [tm.total])
  useEffect(() => { if (!playing || !tl.current) return; const el = tl.current, x = t * pps; if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - el.clientWidth * .3 }, [t])
  useEffect(() => {
    const el = tl.current; if (!el) return
    const h = e => { if (!(e.ctrlKey || e.metaKey || e.altKey)) return; e.preventDefault(); zoomTo(S.current.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX) }
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h)
  }, [])

  // ---------- tools: split / delete the selected item, drop files, keyboard ----------
  const splitSel = () => {
    const s = S.current, id = s.sel, tt = +E.t.toFixed(2), c2 = s.v2.find(x => x.id === id), o = s.ov.find(x => x.id === id), au = s.aud.find(x => x.id === id)
    if (c2) { if (tt <= c2.at + .2 || tt >= c2.at + idur(c2) - .2) return; const local = c2.start + (tt - c2.at) * c2.speed, a = { ...c2, id: uid(), end: local }, b = { ...c2, id: uid(), start: local, at: tt }; els.current[a.id] = mkEl(c2.url, true); els.current[b.id] = mkEl(c2.url, true); setV2(m => m.flatMap(x => x.id === id ? [a, b] : [x])); setSel(b.id) }
    else if (o) { if (tt <= o.from + .2 || tt >= o.to - .2) return; const a = { ...o, id: uid(), to: tt }, b = { ...o, id: uid(), from: tt }; if (o.kind === 'image') imgs.current[a.id] = imgs.current[b.id] = imgs.current[id]; setOv(m => m.flatMap(x => x.id === id ? [a, b] : [x])); setSel(b.id) }
    else if (au) { const len = alen(au, s.tm.total); if (au.loop || tt <= au.at + .2 || tt >= au.at + len - .2) return; const local = au.start + (tt - au.at), a = { ...au, id: uid(), end: local }, b = { ...au, id: uid(), start: local, at: tt }; els.current[a.id] = mkEl(au.url, false); els.current[b.id] = mkEl(au.url, false); setAud(m => m.flatMap(x => x.id === id ? [a, b] : [x])); setSel(b.id) }
    else split()
  }
  const delSel = () => {
    const s = S.current, id = s.sel; if (!id) return
    if (s.main.some(x => x.id === id)) setMain(a => a.filter(x => x.id !== id)); else if (s.v2.some(x => x.id === id)) setV2(a => a.filter(x => x.id !== id)); else if (s.ov.some(x => x.id === id)) setOv(a => a.filter(x => x.id !== id)); else if (s.aud.some(x => x.id === id)) setAud(a => a.filter(x => x.id !== id))
    gone(id)
  }
  const dropFiles = (files, lane, at) => run('Opening…', async () => {
    for (const f of files) {
      if (/^audio\//.test(f.type)) await addAudio(f, TRACKS.some(([k]) => k === lane) ? lane : 'bg', at)
      else if (/^image\//.test(f.type)) { if (lane === 'text' || lane === 'v2') addImageFile(f, at ?? E.t); else await addMedia(f, '', 'main') }
      else if (/^video\//.test(f.type)) await addMedia(f, '', lane === 'v2' ? 'v2' : 'main', at)
      else if (/\.srt$/i.test(f.name)) { const q = parseSrt(await f.text()); if (q.length) setSubs(q) }
    }
  })
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
  const dOver = e => { if (!hasFiles(e)) return; e.preventDefault(); const ln = e.target.closest?.('[data-lane]')?.dataset.lane || ''; setDropLane(ln); setFileOver(true) }
  const dLeave = e => { if (!e.currentTarget.contains(e.relatedTarget)) { setFileOver(false); setDropLane('') } }
  const dDrop = e => { if (!hasFiles(e)) return; e.preventDefault(); const ln = e.target.closest?.('[data-lane]')?.dataset.lane || '', at = ln ? +tAt(e).toFixed(2) : undefined; setFileOver(false); setDropLane(''); dropFiles([...e.dataTransfer.files], ln === 'v1' ? '' : ln, at) }
  KB.current = { play, stop, seek, splitSel, delSel, undo, redo }
  useEffect(() => {
    const h = e => {
      const t = e.target, k = KB.current
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase()
      if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? k.redo() : k.undo() }
      else if (mod && key === 'y') { e.preventDefault(); k.redo() }
      else if (mod || e.altKey) return
      else if (key === ' ') { e.preventDefault(); if (t.tagName === 'BUTTON') t.blur(); E.playing ? k.stop(false) : k.play() }
      else if (key === 's') k.splitSel()
      else if (key === 'delete' || key === 'backspace') { e.preventDefault(); k.delSel() }
      else if (key === 'arrowleft' || key === 'arrowright') { e.preventDefault(); k.seek(E.t + (key === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 1 : .1)) }
      else if (key === 'home') k.seek(0)
      else if (key === 'end') k.seek(S.current.tm.total)
      else if (key === 'escape') setSel('')
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  const pickSrt = e => { const f = e.target.files[0]; e.target.value = ''; if (f) run('Reading subtitles…', async () => { const q = parseSrt(await f.text()); if (!q.length) throw new Error('No subtitles found. Use an .srt file.'); setSubs(q) }) }

  // ---------- export ----------
  const exportIt = () => run('Exporting… keep this tab open and in front', async () => {
    const s = S.current; if (!s.tm.total) throw new Error('Add something to the timeline first.')
    const mime = pickMime(); if (!mime) throw new Error('This browser cannot record video. Use Chrome or Edge.')
    await ensureGraph(); const c = cv.current, [W, H] = dims(s.look, s.look.res, s.main.find(x => x.vw)); E.exporting = true; c.width = W; c.height = H; bus.current.mon.gain.value = 0; E.cancel = false; setOut(null); setLink(''); setSaved(null)
    try {
      await seek(0)
      const stream = c.captureStream(30); bus.current.dst.stream.getAudioTracks().forEach(x => stream.addTrack(x))
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITS[s.look.res] }), chunks = []
      rec.ondataavailable = e => e.data.size && chunks.push(e.data)
      const stopped = new Promise(r => { rec.onstop = r }), ended = new Promise(r => { E.onEnd = r }), timer = setInterval(() => setProg(clamp(E.t / s.tm.total, 0, 1)), 300)
      setProg(0); rec.start(500); play(); await ended; clearInterval(timer); rec.stop(); await stopped
      if (E.cancel) return
      const type = mime.split(';')[0], blob = new Blob(chunks, { type }); setOut({ blob, url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm' })
    } finally { E.exporting = false; bus.current.mon.gain.value = 1; setProg(null); const [a, b] = dims(S.current.look, 540, S.current.main.find(x => x.vw)); c.width = a; c.height = b; draw() }
  })
  const cancel = () => { E.cancel = true; stop(false); const f = E.onEnd; E.onEnd = null; f?.() }
  // ---------- saving: a new copy, or overwrite the video this edit started from, then optionally hand it to Social ----------
  const srcId = idOf(start?.r?.output)                       // the Drive file this edit came from (only when opened with “Edit video”)
  const fileName = () => `${title || 'edited'}.${out.ext}`
  const doCopy = async () => {
    const p = start?.p || w.singles, dir = await G.ensureFolder('Edited', p.folderId), r = await G.upload(new File([out.blob], fileName(), { type: out.blob.type }), dir.id)
    const s = { mode: 'copy', link: r.webViewLink, id: r.id }; setLink(s.link); setSaved(s); return s
  }
  const doReplace = async () => {
    if (!srcId) throw new Error('There is no original Drive video to replace. Save a new copy instead.')
    const auth = { Authorization: `Bearer ${G.getToken()}` }, old = await G.api(`${G.D}/files/${srcId}?fields=name`).catch(() => null)
    const name = old?.name && !old.name.toLowerCase().endsWith('.' + out.ext) ? old.name.replace(/\.[^.]+$/, '') + '.' + out.ext : undefined   // keep the extension honest (mp4 / webm)
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${srcId}?uploadType=resumable&fields=id,webViewLink`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json', 'X-Upload-Content-Type': out.blob.type || 'video/mp4' }, body: JSON.stringify(name ? { name } : {}) })
    if (!r.ok) throw new Error('Drive did not let this app replace that file (it can only change files it created). Save a new copy instead.')
    const u = await fetch(r.headers.get('Location'), { method: 'PUT', body: out.blob })
    if (!u.ok) throw new Error('The upload stopped before it finished, so the original was not changed. Try again.')
    const j = await u.json().catch(() => ({})), s = { mode: 'replace', link: j.webViewLink || start.r.output, id: srcId }; setLink(s.link); setSaved(s); return s
  }
  const toDrive = () => run('Saving a copy to Drive…', doCopy)
  const replaceOriginal = () => run('Replacing the original video in Drive… keep this tab open', doReplace)
  const asOutput = () => run('Updating the Output link…', async () => { await P.saveVideo(start.p, { ...start.r, output: link }) })
  // the video must be a Completed row in a playlist (or Singles) to be listed in Social: a copy becomes a new row, a replaced original already is one
  const toSocial = confirmed => {
    if (!saved && saveMode === 'replace' && !confirmed) return setAsk('social')
    return run('Getting the video ready for Social…', async () => {
      const s = saved || (saveMode === 'replace' ? await doReplace() : await doCopy()), p = start?.p || w.singles, r = start?.r
      if (s.mode === 'replace') { if (r && !['Completed', 'Uploaded'].includes(r.status)) await P.saveVideo(p, { ...r, status: 'Completed' }, { system: true }) }
      else if (!s.row) {
        const a = look.aspect !== 'orig' ? look.aspect : Object.entries(ASP).sort((x, y) => Math.abs(x[1] - pw / ph) - Math.abs(y[1] - pw / ph))[0][0]
        await P.loadVideos(p)
        await P.saveVideo(p, { title: title || 'Edited video', topic: title || '', inputType: 'Prompt', status: 'Completed', output: s.link, minutes: +(dur / 60).toFixed(1), aspect: a, description: r?.description || '', thumbLink: r?.thumbLink || '', thumbText: r?.thumbText || '' }, { system: true })
        setSaved({ ...s, row: true })
      }
      onSocial?.(idOf(s.link))
    })
  }
  const snap = () => cv.current.toBlob(b => save(b, `${title || 'frame'}.png`))

  // ---------- screen ----------
  const dur = tm.total, d1 = Math.max(dur, .01), pct = x => `${x / d1 * 100}%`
  const mi = main.find(o => o.id === sel), vi = v2.find(o => o.id === sel), ai = aud.find(o => o.id === sel), so = ov.find(o => o.id === sel), mk = main.findIndex(o => o.id === sel)
  const TABS = [['main', '🎞 V1'], ['v2', '🎬 V2'], ['over', '🅣 Text'], ['look', '🎨 Look'], ['audio', '🎧 Audio'], ['subs', '💬 Subs'], ['exp', '⬇ Export']]
  const ed = (k, v) => setLook(l => ({ ...l, [k]: v })), hasAny = main.length || v2.length || ov.length || aud.length
  const Pick = ({ target }) => list && list.target === target ? <div className="pick">{!list.items.length && <p className="muted">No video has an Output link yet.</p>}{list.items.map(({ p, r }) => <div className="row tight" key={p.folderId + r.row}><button className="ghost sm" onClick={() => fromDrive(r, target)}>{p.name}: {r.title}</button></div>)}</div> : null
  const Time = ({ o, set, a, b }) => <div className="cols"><label>Starts at (s)<input type="number" step=".1" min="0" value={+o[a].toFixed(1)} onChange={e => set({ [a]: +e.target.value })} /></label>{b && <label>Until (s)<input type="number" step=".1" min="0" value={+o[b].toFixed(1)} onChange={e => set({ [b]: +e.target.value })} /></label>}</div>
  const Place = ({ o, set }) => <><div className="row tight">{PLACE.map(([n, p]) => <button key={n} className="ghost sm" onClick={() => set(p)}>{n}</button>)}</div>
    <div className="cols"><Rng l="Size (width)" v={o.w} min={.05} max={1} set={v => set({ w: v })} /><Rng l="Rotate" v={o.rot} min={-180} max={180} step="1" u="°" set={v => set({ rot: v })} /><Rng l="Left / right" v={o.x} min={0} max={1} set={v => set({ x: v })} /><Rng l="Up / down" v={o.y} min={0} max={1} set={v => set({ y: v })} /><Rng l="Rounded corners" v={o.round} min={0} max={.5} set={v => set({ round: v })} /></div></>
  const trkv = k => trk[k], setTrkv = (k, p) => setTrk(x => ({ ...x, [k]: { ...x[k], ...p } }))

  const span = Math.max(dur + Math.max(8, dur * .25), 12), BH = 26, rh = n => n * (BH + 4) + 4
  const step = [.1, .2, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(x => x * pps >= 80) || 600, ticks = []; for (let x = 0; x <= span; x += step) ticks.push(+x.toFixed(2))
  const P2 = pack(v2, o => o.at, o => o.at + idur(o)), PO = pack(ov, o => o.from, o => o.to), PA = Object.fromEntries(TRACKS.map(([k]) => [k, pack(aud.filter(a => a.track === k), a => a.at, a => a.at + alen(a, dur))]))
  const insX = vd && vd.idx != null ? main.filter(c => c.id !== vd.id).slice(0, vd.idx).reduce((a, c) => a + idur(c), 0) : null
  const thumbBg = o => o.thumb ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.15)),url("${o.thumb}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' } : {}
  const wave = (a, len) => {
    if (!a.peaks) return null
    const N = a.peaks.length, i0 = a.loop ? 0 : Math.floor(a.start / a.dur * N), i1 = a.loop ? N : Math.max(i0 + 1, Math.ceil(a.end / a.dur * N)), seg = a.peaks.slice(i0, i1), w = (a.loop ? a.dur : a.end - a.start) * pps, n = a.loop ? Math.min(60, Math.ceil(len / a.dur)) : 1
    const pts = seg.map((v, i) => `${i},${.5 - v * .45}`).concat([...seg].reverse().map((v, i) => `${seg.length - 1 - i},${.5 + v * .45}`)).join(' ')
    return <div className="tl-wave">{Array.from({ length: n }, (_, k) => <svg key={k} viewBox={`0 0 ${Math.max(1, seg.length - 1)} 1`} preserveAspectRatio="none" style={{ width: w, height: '100%', flex: 'none' }}><polygon points={pts} fill="rgba(255,255,255,.55)" /></svg>)}</div>
  }
  const bar = (kind, o, left, len, label, cls, top, h, extra = {}) => {
    const dr = vd && vd.id === o.id, noH = kind === 'aud' && o.loop
    return <div key={o.id} className={'tl-it ' + cls + (o.id === sel ? ' on' : '') + (dr ? ' drag' : '')} title={label}
      style={{ left: left * pps, width: Math.max(len * pps, 6), top, height: h, ...extra.style, ...(dr ? { transform: `translate(${vd.dx || 0}px, ${vd.dy || 0}px)` } : {}) }}
      onPointerDown={e => bdown(e, kind, o)} onPointerMove={bmove} onPointerUp={bup} onPointerCancel={bup}>
      {extra.bg}{!noH && <i className="tl-h l" data-edge="l" />}<span>{label}</span>{!noH && <i className="tl-h r" data-edge="r" />}</div>
  }
  const lane = (id, h, kids) => <div key={id} className={'tl-lane' + (dropLane === id ? ' drop' : '')} data-lane={id} style={{ height: h }} onPointerDown={sdown} onPointerMove={smove} onPointerUp={sup} onPointerCancel={sup}>{kids}</div>

  return <main className="page ed ex" style={{ maxWidth: 1600 }} onDragOver={dOver} onDragLeave={dLeave} onDrop={dDrop}>
    <style>{EXCSS}</style>
    <h2>Editor</h2>
    <p className="muted">Edit a finished video with tracks: <b>V1</b> main (videos, pictures, text slides), <b>V2</b> a second video on top, text and logos, and three sound tracks. Drag files straight onto the preview or onto a track. Everything stays in your browser until you save.</p>
    <input ref={fm} type="file" accept="video/*,image/*" multiple hidden onChange={pickMedia('main')} /><input ref={f2} type="file" accept="video/*" multiple hidden onChange={pickMedia('v2')} /><input ref={fi} type="file" accept="image/*" hidden onChange={addImage} /><input ref={fa} type="file" accept="audio/*" hidden onChange={pickAudio} /><input ref={fs} type="file" accept=".srt" hidden onChange={pickSrt} />
    <div className="ex-top">
      <aside className="ex-left">
        {!hasAny && <div className="panel"><h3>Start</h3><div className="row tight"><button className="cta sm" onClick={() => openList('main')}>Choose a completed video</button><button className="ghost" onClick={() => fm.current.click()}>Video or picture from my device</button><button className="ghost" onClick={addSlide}>Start with a text slide</button></div>{Pick({ target: 'main' })}</div>}
        {hasAny && <>
          <div className="ex-tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'main' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={() => fm.current.click()}>Add video / picture</button><button className="ghost sm" onClick={() => openList('main')}>Add completed video</button><button className="ghost sm" onClick={addSlide}>Add text slide</button><button className="ghost sm" onClick={split}>Split at playhead</button></div>{Pick({ target: 'main' })}
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

      {tab === 'v2' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={() => f2.current.click()}>Add video on V2</button><button className="ghost sm" onClick={() => openList('v2')}>Add completed video on V2</button></div>{Pick({ target: 'v2' })}
        {vi ? <><h3>{vi.name}</h3>{Time({ o: vi, set: p => upd2(vi.id, p), a: 'at' })}
          <div className="row tight"><button className="ghost sm" onClick={() => upd2(vi.id, { at: +E.t.toFixed(1) })}>Start at playhead</button></div>
          {Place({ o: vi, set: p => upd2(vi.id, p) })}
          <div className="cols"><Rng l="Opacity" v={vi.opacity} min={0} max={1} set={v => upd2(vi.id, { opacity: v })} /><Rng l="Fade in / out" v={vi.fade} min={0} max={3} step=".5" u=" s" set={v => upd2(vi.id, { fade: v })} /></div>
          <Rng l="Starts at (in the video)" v={vi.start} min={0} max={vi.dur} step=".1" u=" s" set={v => upd2(vi.id, { start: Math.min(v, vi.end - .2) })} /><Rng l="Ends at (in the video)" v={vi.end} min={0} max={vi.dur} step=".1" u=" s" set={v => upd2(vi.id, { end: Math.max(v, vi.start + .2) })} />
          <div className="cols"><label>Speed<select value={vi.speed} onChange={e => upd2(vi.id, { speed: +e.target.value })}>{SPEEDS.map(x => <option key={x} value={x}>{x}x</option>)}</select></label><Rng l="Sound of this clip" v={vi.vol} min={0} max={2} set={v => upd2(vi.id, { vol: v })} /></div>
          <div className="row tight"><button className="ghost sm danger" onClick={() => { gone(vi.id); setV2(a => a.filter(x => x.id !== vi.id)) }}>Remove</button></div></>
          : <p className="hint">V2 videos sit on top of V1. Use them for picture in picture, split screen, or a second video over the first. Tap a V2 bar to edit it.</p>}</div>}

      {tab === 'over' && <div className="panel"><div className="row tight"><button className="ghost sm" onClick={addText}>Add text</button><button className="ghost sm" onClick={() => fi.current.click()}>Add logo / picture</button></div>
        {so?.kind === 'text' && <><label>Text<textarea id="ex-txt" rows={2} value={so.text} onChange={e => updO(so.id, { text: e.target.value })} /></label>
          <div className="cols"><label>Font<select value={so.font} onChange={e => updO(so.id, { font: e.target.value })}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label><label>Color<input type="color" value={so.color} onChange={e => updO(so.id, { color: e.target.value })} /></label></div>
          <div className="cols"><Rng l="Size" v={so.size} min={.02} max={.25} set={v => updO(so.id, { size: v })} /><Rng l="Opacity" v={so.opacity} min={0} max={1} set={v => updO(so.id, { opacity: v })} /></div>
          <div className="row tight"><label className="chk"><input type="checkbox" checked={!!so.bg} onChange={e => updO(so.id, { bg: e.target.checked ? 'rgba(0,0,0,.6)' : '' })} /> Dark box</label><label className="chk"><input type="checkbox" checked={so.stroke} onChange={e => updO(so.id, { stroke: e.target.checked })} /> Outline</label></div></>}
        {so?.kind === 'image' && <><p><b>{so.name}</b></p>{Place({ o: so, set: p => updO(so.id, p) })}<Rng l="Opacity" v={so.opacity} min={0} max={1} set={v => updO(so.id, { opacity: v })} /></>}
        {so && <><Rng l="Fade in / out" v={so.fade} min={0} max={3} step=".5" u=" s" set={v => updO(so.id, { fade: v })} />{Time({ o: so, set: p => updO(so.id, p), a: 'from', b: 'to' })}
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
        {ai && <div className="trk"><h3>{ai.name}</h3>{Time({ o: ai, set: p => updA(ai.id, p), a: 'at' })}<div className="row tight"><button className="ghost sm" onClick={() => updA(ai.id, { at: +E.t.toFixed(1) })}>Start at playhead</button></div>
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
          <div className="row tight"><button className="cta sm" onClick={() => save(out.blob, fileName())}>Download</button></div>

          <div className="ex-sec"><h3>Save to Google Drive</h3>
            <label className={'ex-opt' + (saveMode === 'copy' ? ' on' : '')}><input type="radio" name="ex-save" checked={saveMode === 'copy'} onChange={() => setSaveMode('copy')} /><span><b>Save as a new copy</b><small>Goes to the “Edited” folder of {start?.p?.name || 'Singles'}. The original video stays untouched.</small></span></label>
            <label className={'ex-opt' + (saveMode === 'replace' ? ' on' : '') + (srcId ? '' : ' off')}><input type="radio" name="ex-save" disabled={!srcId} checked={saveMode === 'replace'} onChange={() => setSaveMode('replace')} /><span><b>Replace the original video</b><small>{srcId ? `Overwrites “${start.r.title}” in Drive. Same file and link, new picture and sound.` : 'Only possible when you opened this video with “Edit video” from a playlist.'}</small></span></label>
            <div className="row tight"><button className="ghost" disabled={saved?.mode === saveMode} onClick={() => saveMode === 'replace' ? setAsk('save') : toDrive()}>{saved?.mode === saveMode ? 'Saved ✓' : saveMode === 'replace' ? 'Replace original in Drive' : 'Save copy to Drive'}</button>
              {saved && <a className="ghost" href={saved.link} target="_blank" rel="noreferrer">Open in Drive</a>}
              {saved?.mode === 'copy' && start?.r && <button className="ghost" onClick={asOutput}>Use as this video's Output link</button>}</div>
            <p className="hint">{saved?.mode === 'replace' ? 'The original was replaced. Anything already planned in Social for this video will upload the new version.' : 'Copies go to the “Edited” folder of the project.'}</p></div>

          <div className="ex-sec"><h3>Upload it</h3>
            <div className="row tight"><button className="cta sm" onClick={() => toSocial()}>Schedule in Social →</button></div>
            <p className="hint">{saved ? 'It is saved in Drive already. ' : `It is saved first (${saveMode === 'replace' ? 'replacing the original' : 'as a new copy'}). `}{saved?.mode === 'replace' || saveMode === 'replace' ? 'Then' : 'A new Completed video is added to the playlist so Social can list it. Then'} Social opens with it ticked: pick the days, then review the title, description, tags and thumbnail before anything goes out.</p></div></>}</div>}
        {ask && <Confirm title="Replace the original video?" text={`This overwrites “${start?.r?.title}” in Google Drive with your edited video. The link stays the same, so anything already planned in Social for it will upload the new version. Drive usually keeps the previous version under “Manage versions” for about 30 days. If you are not sure, save a new copy instead.`} yes="Replace original" onYes={() => { const k = ask; setAsk(null); k === 'social' ? toSocial(true) : replaceOriginal() }} onNo={() => setAsk(null)} />}
        </>}
      </aside>
      <section className="ex-stage">
        <div className="ex-cvw" style={{ width: `min(100%, ${(62 * pw / ph).toFixed(1)}vh)`, aspectRatio: `${pw} / ${ph}` }}>
          <canvas ref={cv} width={pw} height={ph} />
          <canvas ref={ovc} className="ex-gz" style={{ display: prog !== null ? 'none' : 'block' }} onPointerDown={grab} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={dbl} />
          {!hasAny && <div className="ex-empty">Drag and drop a video, picture or audio file here</div>}
          {fileOver && <div className="ex-drop">Drop to add</div>}
        </div>
        <div className="ex-bar"><button className="ghost sm" onClick={() => seek(0)} title="Go to start (Home)">⏮</button><button className="cta sm" disabled={!dur} onClick={() => playing ? stop(false) : play()}>{playing ? 'Pause' : 'Play'}</button><span className="muted">{fmt(t)} / {fmt(dur)}</span>
          <input type="range" min="0" max={d1} step=".05" value={Math.min(t, d1)} onChange={e => seek(+e.target.value)} aria-label="Position" /><button className="ghost sm" onClick={snap}>Save frame</button></div>
      </section>
    </div>

    <section className="tl">
      <div className="tl-tools">
        <button className="ghost sm" onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button><button className="ghost sm" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button><span className="sep" />
        <button className="ghost sm" onClick={splitSel} title="Split at the playhead (S)">✂ Split</button><button className="ghost sm danger" disabled={!sel} onClick={delSel} title="Delete (Del)">🗑 Delete</button><span className="sep" />
        <button className={'ghost sm' + (snapOn ? ' on' : '')} onClick={() => setSnapOn(x => !x)} title="Snap to edges, playhead and the centre">🧲 Snap {snapOn ? 'on' : 'off'}</button><span className="sep" />
        <button className="ghost sm" onClick={() => zoomTo(pps / 1.4)} title="Zoom out">−</button>
        <input type="range" min="0" max="100" value={Math.log(pps / 4) / Math.log(100) * 100} onChange={e => zoomTo(4 * Math.pow(100, +e.target.value / 100))} aria-label="Timeline zoom" />
        <button className="ghost sm" onClick={() => zoomTo(pps * 1.4)} title="Zoom in">+</button><button className="ghost sm" onClick={fit}>Fit</button>
      </div>
      <div className="tl-body">
        <div className="tl-labs">
          <div className="tl-lab" style={{ height: 26 }} />
          <div className="tl-lab" style={{ height: 44 }}><b>V1</b></div>
          <div className="tl-lab" style={{ height: rh(P2.n) }}><b>V2</b></div>
          <div className="tl-lab" style={{ height: rh(PO.n) }}><b>Text</b></div>
          {TRACKS.map(([k]) => <div className="tl-lab" key={k} style={{ height: rh(PA[k].n), opacity: trk[k].mute ? .5 : 1 }}><b>{LABEL[k]}</b><button className="tl-mute" title="Mute / unmute" onClick={() => setTrkv(k, { mute: !trk[k].mute })}>{trk[k].mute ? '🔇' : '🔊'}</button></div>)}
        </div>
        <div className="tl-scroll" ref={tl}>
          <div className="tl-in" style={{ width: span * pps, minWidth: '100%' }}>
            <div className="tl-ruler" onPointerDown={sdown} onPointerMove={smove} onPointerUp={sup} onPointerCancel={sup}>
              {ticks.map(x => <div className="tl-tick" key={x} style={{ left: x * pps }}>{tlab(x)}</div>)}
              <div className="tl-minor" style={{ backgroundImage: `repeating-linear-gradient(to right,rgba(127,127,127,.55) 0,rgba(127,127,127,.55) 1px,transparent 1px,transparent ${step * pps / 5}px)` }} />
            </div>
            {lane('v1', 44, <>{main.map((c, k) => bar('v1', c, tm.off[k], idur(c), c.name, c.kind, 4, 36, { style: thumbBg(c) }))}{insX != null && <div className="tl-ins" style={{ left: insX * pps }} />}</>)}
            {lane('v2', rh(P2.n), v2.map(o => bar('v2', o, o.at, idur(o), o.name, 'v2', 3 + P2.at[o.id] * (BH + 4), BH, { style: thumbBg(o) })))}
            {lane('text', rh(PO.n), ov.map(o => bar('ov', o, o.from, o.to - o.from, o.kind === 'text' ? o.text : o.name, o.kind === 'image' ? 'img' : 'txt', 3 + PO.at[o.id] * (BH + 4), BH)))}
            {TRACKS.map(([k]) => lane(k, rh(PA[k].n), aud.filter(a => a.track === k).map(a => bar('aud', a, a.at, alen(a, dur), a.name, k, 3 + PA[k].at[a.id] * (BH + 4), BH, { bg: wave(a, alen(a, dur)) }))))}
            <div className="tl-ph" style={{ left: Math.min(t, d1) * pps }}><i /></div>
            {guideX != null && <div className="tl-guide" style={{ left: guideX * pps }} />}
          </div>
        </div>
      </div>
    </section>
    <p className="tl-hint">Drag a bar to move it · drag its edges to trim · drag V1 clips to reorder · drag audio up/down to switch track · click the ruler to scrub · Ctrl + wheel to zoom · Space play · S split · Del delete · Ctrl+Z undo · drop files onto a track. On the picture: drag to move, corners to resize, top circle to rotate, wheel to resize.</p>
  </main>
}
