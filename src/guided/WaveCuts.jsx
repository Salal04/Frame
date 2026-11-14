import { useEffect, useRef, useState } from 'react'
import { fmtTime } from './model.js'

// A waveform with draggable cut points. points = [in, cut1, ..., out]. Pieces between two points are the scenes (or, with 2 points, one trimmed take).
export default function WaveCuts({ peaks, duration, points, setPoints, labels = [], playAt, height = 96 }) {
  const box = useRef(null), [drag, setDrag] = useState(-1), [hover, setHover] = useState(-1)
  const tOf = e => { const r = box.current.getBoundingClientRect(); return Math.max(0, Math.min(duration, (e.clientX - r.left) / r.width * duration)) }
  useEffect(() => {
    if (drag < 0) return
    const move = e => setPoints(p => { const t = tOf(e), lo = drag ? p[drag - 1] + .15 : 0, hi = drag < p.length - 1 ? p[drag + 1] - .15 : duration; const next = [...p]; next[drag] = +Math.max(lo, Math.min(hi, t)).toFixed(2); return next })
    const up = () => setDrag(-1)
    addEventListener('pointermove', move); addEventListener('pointerup', up); return () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up) }
  }, [drag, duration])
  const n = peaks?.length || 0, pct = t => `${t / Math.max(duration, .01) * 100}%`
  const top = n ? [...peaks].map((v, i) => `${i},${(.5 - v * .47).toFixed(3)}`) : [], bot = n ? [...peaks].reverse().map((v, i) => `${n - 1 - i},${(.5 + v * .47).toFixed(3)}`) : []
  return <div className="gs-wc" ref={box} style={{ height }} onDoubleClick={e => playAt?.(tOf(e))}>
    {n > 0 && <svg viewBox={`0 0 ${Math.max(1, n - 1)} 1`} preserveAspectRatio="none"><polygon points={[...top, ...bot].join(' ')} /></svg>}
    <div className="gs-wc-dim" style={{ left: 0, width: pct(points[0]) }} /><div className="gs-wc-dim" style={{ right: 0, width: pct(duration - points[points.length - 1]) }} />
    {points.slice(0, -1).map((p, i) => <div key={i} className="gs-wc-seg" style={{ left: pct(p), width: pct(points[i + 1] - p) }}>{labels[i] && <span>{labels[i]}</span>}</div>)}
    {points.map((p, i) => <div key={i} className={`gs-wc-pt${drag === i ? ' on' : ''}${i === 0 || i === points.length - 1 ? ' edge' : ''}`} style={{ left: pct(p) }} onPointerDown={e => { e.preventDefault(); setDrag(i) }} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(-1)}><i />{(drag === i || hover === i) && <b>{fmtTime(p)}</b>}</div>)}
  </div>
}
