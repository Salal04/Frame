import { useRef } from 'react'
import * as P from './playlist.js'
import { MAX_BROLL_FILES, parseBroll, stringifyBroll, isCustomVoice } from './config.js'

// B-roll of ONE video: the user's own face video, lip-synced by the backend to the narration.
// 1) tick "Include b-roll"  2) say how much of the video should show you (the bar)  3) upload your face video(s).
// Uploads save by themselves; the bar and the switch are saved with "Save video".
export default function Broll({ e, setE, p, run, reload, locked, voice }) {
  const f = useRef(), b = parseBroll(e.broll), set = patch => setE(c => ({ ...c, broll: stringifyBroll({ ...parseBroll(c.broll), ...patch }) }))
  const mins = +e.minutes || 0, secs = mins ? Math.round(mins * 60 * b.percent / 100) : 0
  const add = ev => {
    const files = [...ev.target.files]; ev.target.value = ''
    if (!files.length) return
    run(`Uploading ${files.length} face video${files.length > 1 ? 's' : ''}…`, async () => {
      if (b.files.length + files.length > MAX_BROLL_FILES) throw new Error(`At most ${MAX_BROLL_FILES} face videos per video.`)
      let cur = { ...e }, list = [...b.files]
      for (const file of files) { const { ids, file: x } = await P.uploadVideoBroll(p, cur, file); cur = { ...cur, ...ids }; list = [...list, x] }
      const saved = { ...cur, broll: stringifyBroll({ ...b, enabled: true, files: list }) }
      await P.saveVideo(p, saved); setE(saved); await reload()
    })
  }
  return <div className="broll">
    <label className="chk"><input type="checkbox" checked={b.enabled} disabled={locked} onChange={ev => set({ enabled: ev.target.checked })} /><b>Include b-roll</b> (cut-ins of my own face, lip-synced to the narration)</label>
    {!b.enabled && <small className="hint">Off: the video is made without your face.</small>}
    {b.enabled && <fieldset disabled={locked} className="brbox">
      <label>How much of the video should show my face? <b className="pct">{b.percent}%</b>
        <input type="range" min="0" max="100" step="5" value={b.percent} onChange={ev => set({ percent: +ev.target.value })} aria-label="B-roll share of the video in percent" />
        <div className="scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
        <small className="hint">{b.percent === 0 ? 'At 0% no b-roll is used.' : `About ${b.percent}% of the final video${secs ? ` (roughly ${secs} s of ${mins} min)` : ''} will be you, cut in between the animated scenes.`}</small></label>
      <label>Number of separate b-roll cuts (0 = let Frame decide)<input type="number" min="0" max="200" value={b.segments} onChange={ev => set({ segments: ev.target.value })} /></label>
      <label className="chk"><input type="checkbox" checked={b.lipSync} onChange={ev => set({ lipSync: ev.target.checked })} />Lip-sync my mouth to the narration (recommended)</label>
      {b.lipSync && !isCustomVoice(voice) && <small className="hint">Tip: for the most natural result narrate with <b>your own voice</b> (Narrator → My own voice). With another voice, only your mouth movement is matched.</small>}
      <h4>My face videos ({b.files.length}/{MAX_BROLL_FILES})</h4>
      {!b.files.length && <p className="muted">Upload at least one short video of you facing the camera. Without it no b-roll is made.</p>}
      {b.files.map((x, i) => <div className="clip" key={x.fileId || i}><div className="clip-h"><b>{i + 1}. {x.name}</b>{x.url && <a href={x.url} target="_blank" rel="noreferrer">open</a>}
        <span className="clip-btns"><button className="ghost sm danger" onClick={() => set({ files: b.files.filter((_, j) => j !== i) })}>Remove</button></span></div></div>)}
      <div className="row tight"><input ref={f} type="file" multiple accept="video/*" hidden onChange={add} />
        <button className="ghost" disabled={b.files.length >= MAX_BROLL_FILES} onClick={() => f.current.click()}>Upload my face video</button>
        <small className="muted">Goes to this video's Drive folder (Input/broll). Change the bar, then press “Save video”.</small></div>
    </fieldset>}
    {locked && <p className="muted">🔒 The backend has taken this video, so b-roll can no longer be changed here.</p>}
  </div>
}
