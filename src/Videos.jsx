import { useState, useRef } from 'react'
import * as P from './playlist.js'
import { STATUSES, VOICES, LANGS, buildJobs } from './config.js'
import { Confirm } from './Classic.jsx'

const inherit = (l = 'Playlist default') => [['', l]]
function Row({ r, cfg, p, run, reload, gotoThumb, ask }) {
  const [e, setE] = useState(r), [open, setOpen] = useState(false), up = k => ev => setE({ ...e, [k]: ev.target.value })
  const save = () => run('Saving video…', async () => { await P.saveVideo(p, e); await reload(); setOpen(false) })
  return <div className={'card video st-' + (r.status || 'Draft').toLowerCase()}>
    <div className="vhead" onClick={() => setOpen(!open)}><span className="num">{r.order || r.row - 1}</span><div><h3>{r.title}</h3><small className="muted">{r.minutes || cfg.minutes} min{r.thumbLink && <> · thumbnail saved</>}</small></div><span className="pill">{r.status || 'Draft'}</span></div>
    {open && <div className="vbody">
      <label>Title<input value={e.title} onChange={up('title')} /></label>
      <label>Topic / prompt<textarea rows={3} value={e.topic} onChange={up('topic')} /><small className="hint">This is exactly what the pipeline receives as the topic.</small></label>
      <div className="cols"><label>Minutes<input type="number" min="0.5" step="0.5" value={e.minutes} onChange={up('minutes')} /></label>
        <label>Status<select value={e.status || 'Draft'} onChange={up('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Audience<input value={e.audience} placeholder={cfg.audience} onChange={up('audience')} /></label>
        <label>Narration language<select value={e.language} onChange={up('language')}>{[...inherit(), ...LANGS].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Screen language<select value={e.screen_language} onChange={up('screen_language')}>{[...inherit(), ...LANGS].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Voice<select value={e.voice} onChange={up('voice')}>{[...inherit('Playlist narrator'), ...VOICES.map(v => [v[0], `${v[0]} · ${v[1]}`])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
      <label>Extra config (JSON)<textarea rows={2} spellCheck="false" value={e.extra} placeholder='{"scene_sec": 10, "quality": "high"}' onChange={up('extra')} /><small className="hint">Any VideoConfig field. Beats every other level.</small></label>
      <label>Notes<textarea rows={2} value={e.notes} onChange={up('notes')} /></label>
      <div className="row"><button className="cta sm" onClick={save}>Save video</button><button className="ghost" onClick={() => gotoThumb(r.row)}>Thumbnail</button>
        {r.output && <a className="ghost" href={r.output} target="_blank" rel="noreferrer">Output</a>}<button className="ghost danger" onClick={() => ask(r)}>Remove</button></div></div>}
  </div>
}

export default function Videos({ p, g, cfg, name, rows, setRows, run, gotoThumb }) {
  const [nt, setNt] = useState({ title: '', topic: '', minutes: '' }), [del, setDel] = useState(null), f = useRef()
  const reload = async () => setRows(await P.loadVideos(p))
  const total = rows.reduce((a, r) => a + (+r.minutes || +cfg.minutes || 0), 0)
  const add = () => {
    const t = nt.title.trim(), tp = nt.topic.trim(); if (!t && !tp) return
    run('Adding to the playlist…', async () => { await P.saveVideo(p, { order: rows.length + 1, title: t || tp.slice(0, 60), topic: tp || t, minutes: nt.minutes || cfg.minutes, status: 'Draft' }); setNt({ title: '', topic: '', minutes: '' }); await reload() })
  }
  const download = (data, file) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
  const exportJobs = () => run('Building jobs file…', async () => {
    const out = buildJobs(g, cfg, name, rows); if (!out.jobs.length) throw new Error('No video is marked Ready. Set Status to Ready first.')
    download(out, 'frame_jobs.json')
  })
  const importRes = e => { const x = e.target.files[0]; e.target.value = ''; if (x) run('Reading results…', async () => { const n = await P.importResults(p, rows, JSON.parse(await x.text())); await reload(); if (!n) throw new Error('No row in that file matches this playlist.') }) }
  const readyAll = () => run('Marking drafts Ready…', async () => { for (const r of rows.filter(r => !r.status || r.status === 'Draft')) await P.saveVideo(p, { ...r, status: 'Ready' }); await reload() })
  return <section>
    <div className="stats"><b>{rows.length}</b> videos <b>{Math.round(total * 10) / 10}</b> minutes in total</div>
    <div className="row add"><input value={nt.title} onChange={e => setNt({ ...nt, title: e.target.value })} placeholder="Video title" />
      <input value={nt.topic} onChange={e => setNt({ ...nt, topic: e.target.value })} placeholder="Topic or prompt for the pipeline" />
      <input className="mini" type="number" min="0.5" step="0.5" value={nt.minutes} onChange={e => setNt({ ...nt, minutes: e.target.value })} placeholder={`${cfg.minutes} min`} />
      <button className="cta sm" onClick={add}>Add video</button></div>
    <div className="row"><button className="ghost" onClick={readyAll}>Mark drafts Ready</button><button className="ghost" onClick={exportJobs}>Download jobs for backend</button>
      <input ref={f} type="file" accept=".json,application/json" hidden onChange={importRes} /><button className="ghost" onClick={() => f.current.click()}>Import results</button>
      <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${p.sheetId}`}>Open sheet</a></div>
    <div className="cards one">{!rows.length && <p className="muted">No videos yet. Add the first topic above. You can also type rows straight into the Playlist sheet.</p>}
      {rows.map(r => <Row key={r.row + r.title} r={r} cfg={cfg} p={p} run={run} reload={reload} gotoThumb={gotoThumb} ask={setDel} />)}</div>
    {del && <Confirm title={`Remove “${del.title}”?`} text="The row is deleted from the Playlist sheet. Files in Drive stay." yes="Remove" onYes={() => run('Removing…', async () => { await P.deleteVideo(p, del); setDel(null); await reload() })} onNo={() => setDel(null)} />}
  </section>
}
