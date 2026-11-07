import { useEffect, useRef, useState } from 'react'
import * as G from './drive.js'
import * as S from './summary.js'
import { fmtT, parseT, summaryPart } from './config.js'

// Lets the user WATCH the source video and choose which part gets summarised (start and end).
// YouTube: official embedded player, "use current time" buttons. Drive video: Drive's preview player + sliders (Drive's player cannot report its time).
// Whole video = empty start/end.  Saved columns: Start (s), End (s), Duration (s).
let ytP
const loadYT = () => ytP ||= new Promise(res => {
  if (window.YT?.Player) return res(window.YT)
  const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT) }
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s)
})

export default function Trim({ e, setE }) {
  const yt = e.source === 'YouTube', vid = yt ? G.ytId(e.link || '') : '', box = useRef(), pl = useRef(), stopAt = useRef(null)
  const [now, setNow] = useState(0), [fail, setFail] = useState(false), [ready, setReady] = useState(false)
  const dur = parseFloat(e.durationSec) || 0, part = summaryPart(e), on = !!part, st = part?.start ?? 0, en = part?.end ?? dur
  const patch = o => setE(c => ({ ...c, ...o }))
  useEffect(() => {   // YouTube player
    if (!yt || !vid) return
    let dead = false; setFail(false); setReady(false)
    loadYT().then(YT => {
      if (dead || !box.current) return
      box.current.innerHTML = ''; const d = document.createElement('div'); box.current.appendChild(d)
      pl.current = new YT.Player(d, { videoId: vid, width: '100%', height: '100%', playerVars: { rel: 0, playsinline: 1 }, events: {
        onReady: ev => { setReady(true); const t = Math.round(ev.target.getDuration()); if (t > 0) patch({ durationSec: t }) },
        onStateChange: ev => { const t = Math.round(ev.target.getDuration()); if (t > 0 && !(parseFloat(e.durationSec) > 0)) patch({ durationSec: t }) },
        onError: () => setFail(true) } })
    })
    const tick = setInterval(() => { const p = pl.current; if (!p?.getCurrentTime) return; const t = p.getCurrentTime(); setNow(t); if (stopAt.current != null && t >= stopAt.current) { p.pauseVideo(); stopAt.current = null } }, 400)
    return () => { dead = true; clearInterval(tick); try { pl.current?.destroy() } catch { /* ignore */ } pl.current = null }
  }, [vid])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!yt && e.fileId && !dur) S.driveDuration(e.fileId).then(t => t && patch({ durationSec: t })) }, [e.fileId])   // eslint-disable-line react-hooks/exhaustive-deps
  const setPart = (s, t) => { s = Math.max(0, Math.min(s, dur ? dur - 1 : s)); t = Math.max(s + 1, dur ? Math.min(t, dur) : t); patch({ startSec: Math.round(s), endSec: Math.round(t) }) }
  const play = () => { const p = pl.current; if (!p) return; stopAt.current = en; p.seekTo(st, true); p.playVideo() }
  const len = en - st, bad = on && !(en > st)
  return <div className="trim wide">
    <h4>Which part to summarise?</h4>
    {yt && vid && !fail && <div className="player" ref={box} />}
    {yt && fail && <p className="note">The owner of this video does not allow playing it here. <a href={e.link} target="_blank" rel="noreferrer">Watch it on YouTube</a> and type the start and end time below.</p>}
    {!yt && e.fileId && <div className="player"><iframe title="Video preview" src={`https://drive.google.com/file/d/${e.fileId}/preview`} allow="autoplay" allowFullScreen /></div>}
    {!yt && <small className="hint">Drive's player cannot tell Frame the current time, so choose the part with the sliders or type the times.</small>}
    <label className="chk"><input type="checkbox" checked={!on} onChange={ev => ev.target.checked ? patch({ startSec: '', endSec: '' }) : setPart(0, dur || 60)} />Summarise the whole video{dur ? ` (${fmtT(dur)})` : ''}</label>
    {on && <fieldset className="trimbox">
      {dur > 0 && <div className="dual"><label>Start <b>{fmtT(st)}</b><input type="range" min="0" max={dur} step="1" value={st} onChange={ev => setPart(+ev.target.value, en)} /></label>
        <label>End <b>{fmtT(en)}</b><input type="range" min="0" max={dur} step="1" value={Math.min(en, dur)} onChange={ev => setPart(st, +ev.target.value)} /></label></div>}
      <div className="cols"><label>Start time (m:ss)<input key={'s' + st} defaultValue={fmtT(st)} onBlur={ev => { const v = parseT(ev.target.value); v === '' ? (ev.target.value = fmtT(st)) : setPart(v, en) }} /></label>
        <label>End time (m:ss)<input key={'e' + en} defaultValue={fmtT(en)} onBlur={ev => { const v = parseT(ev.target.value); v === '' ? (ev.target.value = fmtT(en)) : setPart(st, v) }} /></label></div>
      {yt && ready && <div className="row tight"><small className="muted">Player at {fmtT(now)}:</small>
        <button type="button" className="ghost sm" onClick={() => setPart(now, Math.max(en, now + 1))}>Use as start</button>
        <button type="button" className="ghost sm" onClick={() => setPart(Math.min(st, now - 1), now)}>Use as end</button>
        <button type="button" className="ghost sm" onClick={play}>▶ Play my selection</button></div>}
      <small className={bad ? 'bad' : 'ok'}>{bad ? 'End must be after start.' : `Selected part: ${fmtT(st)} to ${fmtT(en)} (${fmtT(len)} long)`}</small>
      {!bad && (parseFloat(e.maxMinutes) || 0) * 60 > len && <small className="hint">The summary limit ({e.maxMinutes} min) is longer than the selected part, so the summary will be about as long as the part itself.</small>}
    </fieldset>}
    {!dur && <small className="hint">Video length not known yet{yt ? ': press play once so the player can read it' : ': Drive is still processing the file'}.</small>}
  </div>
}
