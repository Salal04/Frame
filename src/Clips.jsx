import { useRef } from 'react'
import * as P from './playlist.js'
import { CLIP_POSITIONS, CLIP_ACCEPT, MAX_CLIPS, parseClips, stringifyClips, cleanClip } from './config.js'

// Custom clips of ONE video: the user's own images / video clips to overlay. Video level only (nothing here touches project or app config).
// Upload saves the file + the list straight away; editing a field is saved with "Save video". Locked videos (backend has them) are read-only.
export default function Clips({ e, setE, p, run, reload, locked }) {
  const f = useRef(), clips = parseClips(e.clips)
  const set = list => setE(c => ({ ...c, clips: stringifyClips(list) }))
  const patch = (i, k, v) => set(clips.map((c, j) => (j === i ? cleanClip({ ...c, [k]: v }) : c)))
  const move = (i, d) => { const l = [...clips], j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(l) }
  const add = ev => {
    const files = [...ev.target.files]; ev.target.value = ''
    if (!files.length) return
    run(`Uploading ${files.length} clip${files.length > 1 ? 's' : ''}…`, async () => {
      if (clips.length + files.length > MAX_CLIPS) throw new Error(`A video can have at most ${MAX_CLIPS} custom clips.`)
      let cur = { ...e }, list = [...clips]
      for (const file of files) {
        const { ids, clip } = await P.uploadVideoClip(p, cur, file)
        cur = { ...cur, ...ids }; list = [...list, cleanClip(clip)]
      }
      const saved = { ...cur, clips: stringifyClips(list) }
      await P.saveVideo(p, saved); setE(saved); await reload()   // saved at once: the file is already in Drive
    })
  }
  return <div className="clips">
    <h4>Custom clips for this video</h4>
    <small className="hint">Your own images or video clips that the backend overlays on <b>this video only</b>. They are not shared with the project or other videos.</small>
    {!clips.length && <p className="muted">No custom clips yet.</p>}
    {clips.map((c, i) => <div className="clip" key={c.id}>
      <div className="clip-h"><b>{i + 1}. {c.name || 'clip'}</b> <span className="pill">{c.kind}</span>
        {c.url && <a href={c.url} target="_blank" rel="noreferrer">open</a>}
        {!locked && <span className="clip-btns"><button className="ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button><button className="ghost sm" onClick={() => move(i, 1)} disabled={i === clips.length - 1}>↓</button><button className="ghost sm danger" onClick={() => set(clips.filter((_, j) => j !== i))}>Remove</button></span>}</div>
      <fieldset disabled={locked} className="cols">
        <label>Start (seconds)<input type="number" min="0" step="0.5" value={c.start} onChange={ev => patch(i, 'start', ev.target.value)} /></label>
        <label>Show for (seconds)<input type="number" min="0.5" step="0.5" value={c.duration} onChange={ev => patch(i, 'duration', ev.target.value)} /></label>
        <label>Position<select value={c.position} onChange={ev => patch(i, 'position', ev.target.value)}>{CLIP_POSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Size (% of frame width)<input type="number" min="5" max="100" value={c.width} disabled={c.position === 'full'} onChange={ev => patch(i, 'width', ev.target.value)} /></label>
        <label>Opacity (%)<input type="number" min="5" max="100" value={c.opacity} onChange={ev => patch(i, 'opacity', ev.target.value)} /></label>
        {c.kind === 'video' && <><label className="chk"><input type="checkbox" checked={c.loop} onChange={ev => patch(i, 'loop', ev.target.checked)} /> Loop if shorter than “Show for”</label>
          <label className="chk"><input type="checkbox" checked={c.mute} onChange={ev => patch(i, 'mute', ev.target.checked)} /> Mute the clip's sound</label></>}
        <label>Note for the backend (optional)<input value={c.note} placeholder="e.g. show while the narrator explains X" onChange={ev => patch(i, 'note', ev.target.value)} /></label>
      </fieldset>
    </div>)}
    {locked
      ? <p className="muted">🔒 The backend has taken this video, so its clips can no longer be changed here.</p>
      : <div className="row tight"><input ref={f} type="file" multiple accept={CLIP_ACCEPT} hidden onChange={add} /><button className="ghost" onClick={() => f.current.click()}>Add clip (image or video)</button>
        <small className="muted">Files go to this video's Drive folder (Input/clips). Change a field, then press “Save video”.</small></div>}
  </div>
}
