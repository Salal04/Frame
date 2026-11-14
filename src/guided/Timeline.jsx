import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fetchAsset } from '../session.js'
import { decode, mono, peaksOf } from './audio.js'
import { FPS, fmtTime, hasVoice } from './model.js'
import { useHead } from './Stage.jsx'

const peakCache = new Map()
function usePeaks(scenes) {
  const [, bump] = useState(0), key = scenes.map(s => s.voice?.fileId || '').join()
  useEffect(() => { (async () => { for (const s of scenes) { const id = s.voice?.fileId; if (!id || peakCache.has(id)) continue; peakCache.set(id, null); try { const buf = await decode(await fetchAsset(id)); peakCache.set(id, peaksOf(mono(buf), Math.min(1500, Math.ceil(buf.duration * 25)))); bump(n => n + 1) } catch { peakCache.delete(id) } } })() }, [key])
  return peakCache
}
const stateOf = (st, err) => (err ? 'error' : st || 'none')
const STEPS = [.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]

function Wave({ peaks }) {
  if (!peaks) return null
  const n = peaks.length, top = [...peaks].map((v, i) => `${i},${(.5 - v * .46).toFixed(3)}`), bot = [...peaks].reverse().map((v, i) => `${n - 1 - i},${(.5 + v * .46).toFixed(3)}`)
  return <svg className="gs-wave" viewBox={`0 0 ${Math.max(1, n - 1)} 1`} preserveAspectRatio="none"><polygon points={[...top, ...bot].join(' ')} /></svg>
}
function Playhead({ head, pps, scroller }) {
  const { frame, playing } = useHead(head), x = frame / FPS * pps
  useEffect(() => { const el = scroller.current; if (!el || !playing) return; if (x > el.scrollLeft + el.clientWidth - 50 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 90) }, [x, playing])
  return <div className="gs-playhead" style={{ transform: `translateX(${x}px)` }}><i /></div>
}

export default function Timeline({ session, lay, head, current, onSelect, onSeek, jobs, errors, bad, actions, children }) {
  const wrap = useRef(null), scroller = useRef(null), [width, setWidth] = useState(800), [zoom, setZoom] = useState(1), drag = useRef(false)
  const peaks = usePeaks(session.scenes)
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth); return () => ro.disconnect() }, [])
  const fit = Math.max(3, (width - 28) / Math.max(lay.sec, 6)), pps = Math.min(240, Math.max(3, fit * zoom)), inner = Math.max(width, lay.sec * pps + 60)
  const step = STEPS.find(x => x * pps >= 72) || 600, ticks = useMemo(() => { const t = []; for (let x = 0; x <= inner / pps; x += step) t.push(+x.toFixed(2)); return t }, [inner, pps, step])
  const seekAt = e => { const r = scroller.current.getBoundingClientRect(), x = e.clientX - r.left + scroller.current.scrollLeft; onSeek(Math.round(Math.max(0, Math.min(lay.sec, x / pps)) * FPS)) }
  const down = e => { drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); seekAt(e) }
  const cur = session.scenes.find(s => s.id === current), key = k => `${current}:${k}`
  return <section className="gs-tl" ref={wrap}>
    <div className="gs-tl-bar">
      {children}
      <span className="gs-sp" />
      <button className="ghost sm" title="Zoom out" onClick={() => setZoom(z => Math.max(.2, z / 1.4))}>−</button>
      <button className="ghost sm" title="Fit the whole video" onClick={() => setZoom(1)}>Fit</button>
      <button className="ghost sm" title="Zoom in" onClick={() => setZoom(z => Math.min(12, z * 1.4))}>+</button>
    </div>
    <div className="gs-tl-body">
      <div className="gs-tl-labels"><i style={{ height: 26 }} /><b>Video</b><b>Voice</b><b>Captions</b></div>
      <div className="gs-tl-scroll" ref={scroller}>
        <div className="gs-tl-inner" style={{ width: inner }}>
          <div className="gs-ruler" onPointerDown={down} onPointerMove={e => drag.current && seekAt(e)} onPointerUp={() => { drag.current = false }} onPointerCancel={() => { drag.current = false }}>
            {ticks.map(t => <span key={t} style={{ left: t * pps }}>{fmtTime(t).replace(/\.0$/, '')}</span>)}
          </div>
          <div className="gs-row gs-vid">{session.scenes.map((s, i) => { const L = lay.items[i], st = stateOf(s.visual?.status, errors[`${s.id}:visual`] || bad.has(s.id)), job = jobs[`${s.id}:visual`], tail = L.frames / FPS - L.voiceSec
            return <button key={s.id} className={`gs-blk st-${st}${s.id === current ? ' on' : ''}`} style={{ left: L.start * pps, width: Math.max(8, L.sec * pps - 2) }} onClick={() => onSelect(s.id)} title={`${s.heading || `Scene ${i + 1}`}\nvisual: ${st}`}>
              <span className="gs-n">{i + 1}</span><span className="gs-t">{s.heading || `Scene ${i + 1}`}</span>{job && <em className="gs-job">{job}</em>}{!s.visual?.codeFileId && !job && <em className="gs-job">no visual yet</em>}
              {tail > .05 && <u className="gs-tail" style={{ width: tail * pps }} />}</button> })}</div>
          <div className="gs-row gs-aud">{session.scenes.map((s, i) => { const L = lay.items[i], st = stateOf(hasVoice(s) ? s.voice?.status : 'none', errors[`${s.id}:voice`]), job = jobs[`${s.id}:voice`]
            return <button key={s.id} className={`gs-blk gs-a st-${st}${s.id === current ? ' on' : ''}${L.real ? '' : ' est'}`} style={{ left: L.start * pps, width: Math.max(8, L.voiceSec * pps - 2) }} onClick={() => onSelect(s.id)} title={`voice: ${st}${s.voice?.source === 'mine' ? ' (your recording)' : ''}`}>
              {L.real && <Wave peaks={peaks.get(s.voice.fileId)} />}<span className="gs-t">{job ? job : L.real ? (s.voice?.source === 'mine' ? 'my voice' : s.voice?.voice || 'voice') : 'no voice yet'}</span></button> })}</div>
          <div className="gs-row gs-cap">{session.scenes.flatMap((s, i) => { const L = lay.items[i]; return (s.voice?.timeline || []).map(c => <span key={`${s.id}-${c.i}`} className="gs-chip" title={c.text} style={{ left: (L.start + c.start) * pps, width: Math.max(4, (c.end - c.start) * pps - 2) }}>{c.text}</span>) })}</div>
          <Playhead head={head} pps={pps} scroller={scroller} />
        </div>
      </div>
    </div>
    {cur && <div className="gs-tl-foot">Scene {session.scenes.findIndex(s => s.id === current) + 1} · voice <b className={`s-${cur.voice?.status || 'none'}`}>{cur.voice?.status || 'none'}</b> · visual <b className={`s-${cur.visual?.status || 'none'}`}>{cur.visual?.status || 'none'}</b>{errors[key('voice')] && <span className="bad"> · {errors[key('voice')]}</span>}{errors[key('visual')] && <span className="bad"> · {errors[key('visual')]}</span>}</div>}
  </section>
}
