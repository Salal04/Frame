import { useEffect, useRef, useState } from 'react'
import * as S from './summary.js'
import Trim from './SummaryTrim.jsx'
import { Fold } from './Blocks.jsx'
import { Confirm } from './Classic.jsx'
import { LANGS, TRANSLATE_LANGS, summaryPart, fmtT, normLangs, isLocked, SUMMARY_STYLES, SUMMARY_MIN, SUMMARY_MAX, buildSummaryJobs } from './config.js'

const cls = s => 'st-' + (s || 'Hold').toLowerCase().replace(/\s+/g, '-')

function Item({ r, run, w, reload, ask }) {
  const [e, setE] = useState(r), locked = isLocked(r.status), up = k => ev => setE({ ...e, [k]: ev.target.value })
  const mins = parseFloat(e.maxMinutes), pt = summaryPart(e), bad = !(mins >= SUMMARY_MIN && mins <= SUMMARY_MAX) || (!!e.endSec && !(pt && pt.end > pt.start))
  const save = (patch = {}, msg = 'Saving…') => run(msg, async () => { await S.saveSummary(w, { ...e, ...patch }); await reload() })
  return <div className={'card video ' + cls(r.status)}>
    <div className="vhead"><span className="num">{r.order || r.row - 1}</span>
      <div><h3>{r.title}</h3><small className="muted">{r.source === 'YouTube' ? <a href={r.link} target="_blank" rel="noreferrer">YouTube link</a> : <a href={r.driveLink} target="_blank" rel="noreferrer">{r.source === 'Upload' ? 'uploaded video' : 'video in Drive'}</a>} · {summaryPart(r) ? `part ${fmtT(summaryPart(r).start)} to ${fmtT(summaryPart(r).end)}` : r.durationSec ? `whole video (${fmtT(r.durationSec)})` : 'whole video'} · summary up to {r.maxMinutes || 3} min</small></div>
      <span className="pill">{r.status}</span></div>
    <div className="vbody">
      {locked
        ? <p className="muted">🔒 <b>{r.status}</b>: the backend has taken this one, so it can no longer be changed here.{r.output && <> <a href={r.output} target="_blank" rel="noreferrer">Open the summary video</a></>}</p>
        : <fieldset className="cols">
          <Trim e={e} setE={setE} />
          <label>Longest summary (minutes)<input type="number" min={SUMMARY_MIN} max={SUMMARY_MAX} step="0.5" value={e.maxMinutes} onChange={up('maxMinutes')} /><small className="hint">The summary will not be longer than this ({SUMMARY_MIN} to {SUMMARY_MAX} min).</small></label>
          <label>Style<select value={e.style || 'highlights'} onChange={up('style')}>{SUMMARY_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Summary language<select value={e.language || 'en'} onChange={up('language')}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <fieldset className="langs wide"><legend>Also translate into</legend><div className="chips">{TRANSLATE_LANGS.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={normLangs(e.translateTo).includes(k)} onChange={ev => { const on = normLangs(e.translateTo); setE({ ...e, translateTo: (ev.target.checked ? [...on, k] : on.filter(x => x !== k)).join(',') }) }} />{l}</label>)}</div></fieldset>
          <label className="wide">Notes (optional)<input value={e.notes || ''} onChange={up('notes')} placeholder="e.g. focus on the part about prices" /></label>
        </fieldset>}
      <div className="row tight">
        {!locked && r.status === 'Hold' && <button className="cta sm" disabled={bad} onClick={() => save({ status: 'Waiting' }, 'Starting the summary task…')}>▶ Start summary ({bad ? '?' : mins} min max)</button>}
        {!locked && r.status === 'Waiting' && <><span className="ok">Started. The backend will pick it up.</span><button className="ghost sm" onClick={() => save({ status: 'Hold' }, 'Putting on Hold…')}>Stop / back to Hold</button></>}
        {!locked && <button className="ghost sm" disabled={bad} onClick={() => save({}, 'Saving…')}>Save settings</button>}
        <button className="ghost sm danger" disabled={locked} onClick={() => ask(r)}>Remove</button></div>
      {bad && !locked && <p className="bad">Check the summary length ({SUMMARY_MIN} to {SUMMARY_MAX} minutes) and that the end time is after the start time.</p>}
    </div></div>
}

export default function Summary({ w, run }) {
  const [rows, setRows] = useState(null), [url, setUrl] = useState(''), [del, setDel] = useState(null), [note, setNote] = useState(''), f = useRef()
  const reload = async () => setRows(await S.listSummary(w))
  useEffect(() => { run('Opening Summary-a-Video…', async () => { const r = await S.syncFolder(w); await reload(); if (r.added) setNote(`${r.added} new video${r.added > 1 ? 's' : ''} found in the folder. Set the length and press Start.`) }) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const n = s => (rows || []).filter(r => r.status === s).length
  const addLink = () => { const u = url.trim(); if (!u) return; run('Checking the YouTube link…', async () => { await S.addYouTube(w, u); setUrl(''); await reload() }) }
  const upload = ev => { const files = [...ev.target.files]; ev.target.value = ''; if (files.length) run(`Uploading ${files.length} video${files.length > 1 ? 's' : ''} to Drive…`, async () => { for (const x of files) await S.addUpload(w, x); await reload() }) }
  const sync = () => run('Syncing the Summary-a-Video folder…', async () => { const r = await S.syncFolder(w); await reload(); setNote(r.added ? `${r.added} new video${r.added > 1 ? 's' : ''} added from the folder. Set the length and press Start.` : `Folder checked: ${r.found} video${r.found === 1 ? '' : 's'}, nothing new.`) })
  const pick = () => run('Opening your Drive…', async () => { const c = await S.pickFromDrive(w); await reload(); setNote(c ? `${c} video${c > 1 ? 's' : ''} copied into Summary-a-Video.` : '') })
  const jobs = () => run('Building jobs file…', async () => {
    if (!n('Waiting')) throw new Error('Nothing is started yet. Press Start on a video first.')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(buildSummaryJobs(w.g.cfg, rows), null, 2)], { type: 'application/json' })); a.download = 'frame_summary_jobs.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })
  return <main className="page"><h2>Summary-a-Video</h2>
    <p className="muted">Give Frame a long video (a YouTube link or a file) and say how long the summary may be. Frame makes a short summary video no longer than that.</p>
    {note && <p className="note" onClick={() => setNote('')}>{note}</p>}
    <Fold title="Add a video" note="YouTube link or file" open>
      <div className="row add"><input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="Paste a YouTube link" /><button className="cta sm" onClick={addLink}>Add link</button></div>
      <div className="row tight"><input ref={f} type="file" accept="video/*,.mp4,.mov,.mkv,.webm" multiple hidden onChange={upload} /><button className="ghost" onClick={() => f.current.click()}>Upload video to Drive</button>
        {S.pickerReady() && <button className="ghost" onClick={pick}>Pick from my Drive</button>}
        <button className="ghost" onClick={sync}>Sync folder</button><a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${w.summary.folderId}`}>Open Summary-a-Video in Drive</a></div>
      <p className="hint">Uploaded files are saved in the <b>Summary-a-Video</b> folder of your Drive. “Sync folder” lists that folder and adds every new video to the list below.{!S.pickerReady() && <> Frame can only see files it saved itself. To use a video that is already in your Drive, add <code>VITE_GOOGLE_API_KEY</code> to enable “Pick from my Drive”.</>} New videos start on <b>Hold</b>.</p>
    </Fold>
    <div className="stats"><b>{(rows || []).length}</b> videos {['Hold', 'Waiting', 'In Process', 'Completed', 'Failed'].map(s => n(s) ? `· ${n(s)} ${s.toLowerCase()}` : '').join(' ')}</div>
    <div className="row"><button className="ghost" onClick={jobs}>Download jobs for backend</button>{rows && <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${w.summarySheet || ''}`} onClick={e => { if (!w.summarySheet) e.preventDefault() }}>Open sheet</a>}</div>
    <div className="cards one">{rows && !rows.length && <p className="muted">Nothing here yet. Paste a YouTube link or upload a video above.</p>}
      {rows?.map(r => <Item key={[r.row, r.title, r.status].join('|')} r={r} w={w} run={run} reload={reload} ask={setDel} />)}</div>
    {del && <Confirm title={`Remove “${del.title}”?`} text="The row is removed from the list. A video file in the Summary-a-Video folder stays in your Drive." yes="Remove" onYes={() => run('Removing…', async () => { await S.removeSummary(w, del); setDel(null); await reload() })} onNo={() => setDel(null)} />}
  </main>
}
