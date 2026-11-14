import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { fetchAsset } from '../session.js'
import { buildTimeline } from '../engine/voice.js'
import { FPS, hasVoice, sizeOf } from './model.js'

// The playhead lives outside React state: ~30 updates a second must only redraw the tiny playhead/time widgets, never the whole studio.
export const makeHead = () => ({ frame: 0, playing: false, subs: new Set() })
const emit = head => head.subs.forEach(f => f())
export function useHead(head) {
  const [v, set] = useState({ frame: head.frame, playing: head.playing })
  useEffect(() => { const f = () => set(o => (o.frame === head.frame && o.playing === head.playing ? o : { frame: head.frame, playing: head.playing })); head.subs.add(f); f(); return () => head.subs.delete(f) }, [head])
  return v
}

// The live preview. It always shows the WHOLE video (scenes without a visual or voice appear as a title card with captions), so what you see
// is exactly what the timeline shows. Picture, sound and clock all live inside one player, so they cannot drift apart.
const Stage = forwardRef(function Stage({ session, lay, head, onFrame, onErrors }, ref) {
  const frame = useRef(null), range = useRef(null), blockTimer = useRef(0)
  const [up, setUp] = useState(false), [loading, setLoading] = useState(true), [blocked, setBlocked] = useState(false), [fatal, setFatal] = useState('')
  const [w, h] = sizeOf(session.settings.aspect), n = session.scenes.length
  const send = (m, t) => frame.current?.contentWindow?.postMessage(m, '*', t)
  const sig = [session.settings.aspect, ...session.scenes.map((s, i) => [s.id, s.heading, s.visual?.codeFileId, s.voice?.fileId, lay.items[i]?.frames, s.voice?.timeline?.length, hasVoice(s) ? '' : s.narration?.length].join(':'))].join('|')

  useImperativeHandle(ref, () => ({
    play: (r = null) => { range.current = r; setBlocked(false); send({ type: 'frame-play' }); clearTimeout(blockTimer.current); blockTimer.current = setTimeout(() => { if (!head.playing) setBlocked(true) }, 1000) },
    pause: () => send({ type: 'frame-pause' }),
    seek: f => { head.frame = Math.max(0, f); emit(head); send({ type: 'frame-seek', frame: head.frame }) },
    setRange: r => { range.current = r },
  }))

  useEffect(() => {
    const on = e => {
      if (e.source !== frame.current?.contentWindow) return
      const d = e.data || {}
      if (d.type === 'frame-sandbox-up') setUp(true)
      if (d.type === 'frame-time') {
        head.frame = d.frame; emit(head); onFrame?.(d.frame)
        const r = range.current; if (r && head.playing && d.frame >= r.end - 1) { range.current = null; send({ type: 'frame-pause' }); send({ type: 'frame-seek', frame: r.from }) }
      }
      if (d.type === 'frame-state') { head.playing = d.playing; emit(head); if (d.playing) setBlocked(false) }
      if (d.type === 'frame-loaded') { setLoading(false); setFatal(''); onErrors?.(d.errors || [], true) }
      if (d.type === 'frame-scene-error') onErrors?.([{ id: d.id, error: d.error }], false)
      if (d.type === 'frame-sandbox-error') setFatal(d.error)
    }
    addEventListener('message', on); return () => removeEventListener('message', on)
  }, [])

  useEffect(() => {
    if (!up || !n) return
    let dead = false; setLoading(true)
    const timer = setTimeout(async () => {
      const startFrame = head.frame
      const items = await Promise.all(session.scenes.map(async (s, i) => {
        const L = lay.items[i]; let tsx = null, audioBytes = null
        try { if (s.visual?.codeFileId) tsx = await (await fetchAsset(s.visual.codeFileId)).text() } catch { /* shows a title card instead */ }
        try { if (hasVoice(s)) audioBytes = await (await fetchAsset(s.voice.fileId)).arrayBuffer() } catch { /* plays silent */ }
        return { id: s.id, rev: `${s.visual?.codeFileId || ''}${s.voice?.fileId || ''}`, heading: s.heading || `Scene ${i + 1}`, tsx, audioBytes, frames: L.frames, timeline: s.voice?.timeline?.length ? s.voice.timeline : buildTimeline(s.narration || '', L.voiceSec) }
      }))
      if (!dead) send({ type: 'frame-load', scenes: items, width: w, height: h, fps: FPS, startFrame }, items.map(x => x.audioBytes).filter(Boolean))
    }, 350)
    return () => { dead = true; clearTimeout(timer) }
  }, [up, sig])

  return <div className="gs-screen" style={{ '--rw': w, '--rh': h, aspectRatio: `${w} / ${h}` }}>
    {n ? <iframe ref={frame} title="Video preview" src="/sandbox.html" sandbox="allow-scripts" allow="autoplay" /> : <div className="gs-empty"><b>Preview</b><span>Your video appears here as soon as the script has scenes.</span></div>}
    {n > 0 && loading && <div className="gs-over">Preparing preview…</div>}
    {blocked && <div className="gs-over gs-click" onClick={() => setBlocked(false)}>The browser blocked sound. Click the picture once, then press play.</div>}
    {fatal && <div className="gs-over gs-bad" onClick={() => setFatal('')}>{fatal}</div>}
  </div>
})
export default Stage
