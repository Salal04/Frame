import { useState, useEffect, useMemo, useRef } from 'react'
import * as G from './drive.js'
import * as P from './playlist.js'
import { STATUSES, syncPlan, buildQueue, waitingOf, countStatus, makeRecord, buildJobsAll } from './config.js'

// Application level: one plan for ALL projects. Saved in Application Config / frame_config.json (production),
// and the record of what is made / what is next is written to Application Config / production_record.json.
export default function Production({ w, run }) {
  const [data, setData] = useState(null), [plan, setPlan] = useState(null), [dirty, setDirty] = useState(false), [sel, setSel] = useState([]), [pz, setPz] = useState({ min: 5, every: 1 }), f = useRef()
  const load = () => run('Reading every project…', async () => {
    const ps = await G.listProjects(w), out = []
    for (const p of ps) { const cfg = await P.loadProject(p); out.push({ p, cfg, rows: await P.loadVideos(p) }) }
    const pl = syncPlan(w.g.cfg.production, ps)
    setData(out); setPlan(pl); setDirty(JSON.stringify(pl) !== JSON.stringify(w.g.cfg.production))
    await P.syncRecord(w.g, pl, out)
  })
  useEffect(() => { load() }, [])
  const queue = useMemo(() => plan && data ? buildQueue(plan, waitingOf(data)) : [], [plan, data])
  const rec = useMemo(() => plan && data ? makeRecord(plan, data, queue) : null, [plan, data, queue])
  if (!plan || !data) return <main className="page"><h2>Production</h2><p className="muted">Reading your projects…</p></main>

  const edit = (ids, patch) => { setPlan({ ...plan, projects: plan.projects.map(x => ids.includes(x.id) ? { ...x, ...patch } : x) }); setDirty(true) }
  const move = (i, d) => { const a = [...plan.projects], j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; setPlan({ ...plan, projects: a }); setDirty(true) }
  const toggle = id => setSel(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  const save = async () => { await P.saveGlobal(w.g, { ...w.g.cfg, production: plan }); setDirty(false); await P.syncRecord(w.g, plan, data) }
  const cnt = id => countStatus(data.find(d => d.p.folderId === id)?.rows || [])
  const download = o => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' })); a.download = 'frame_jobs_all.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
  const exportAll = () => run('Building the jobs file…', async () => {
    if (!queue.length) throw new Error('Nothing is waiting in an active project.')
    if (dirty) await save()
    download(buildJobsAll(w.g.cfg, plan, data, queue))
  })
  const importRes = e => { const x = e.target.files[0]; e.target.value = ''; if (!x) return; run('Reading results…', async () => {
    const res = JSON.parse(await x.text()); let n = 0
    for (const d of data) n += await P.importResults(d.p, d.rows, res.filter(r => !r.playlist || r.playlist === d.p.name))
    if (!n) throw new Error('No row in that file matches your projects.')
  }).then(load) }
  const pauseText = x => +x.pauseMin > 0 ? `waits ${x.pauseMin} min after ${+x.pauseEvery > 1 ? `every ${x.pauseEvery} videos` : 'each video'}` : 'no pause'
  const total = k => data.reduce((a, d) => a + d.rows.filter(r => r.status === k).length, 0)

  return <main className="page"><h2>Production</h2>
    <p className="muted">One plan for all projects: who goes first, who is paused, who waits between videos. It is saved in <b>Application Config</b> (frame_config.json) and the backend follows it. What was made and what is next is kept in <b>production_record.json</b> in the same folder.</p>
    <div className="stats">{STATUSES.map(s => <span key={s}><b>{total(s)}</b>{s.toLowerCase()}</span>)}</div>

    <h3>Order</h3>
    <div className="seg tabs">{[['rotate', 'Take turns'], ['sequential', 'One project at a time']].map(([k, l]) => <button key={k} className={plan.order === k ? 'on' : ''} onClick={() => { setPlan({ ...plan, order: k }); setDirty(true) }}>{l}</button>)}</div>
    <p className="hint">{plan.order === 'rotate' ? 'A1, B1, C1, A2, B2 … Each project gives “videos per turn” videos in every round.' : 'All videos of the first project, then all of the second … in the order below.'}</p>

    <h3>Projects</h3>
    <div className="panel bulk"><b>{sel.length} selected</b>
      <button className="ghost sm" onClick={() => setSel(sel.length === plan.projects.length ? [] : plan.projects.map(x => x.id))}>{sel.length === plan.projects.length ? 'Clear' : 'Select all'}</button>
      <button className="ghost sm" disabled={!sel.length} onClick={() => edit(sel, { state: 'paused' })}>Pause</button>
      <button className="ghost sm" disabled={!sel.length} onClick={() => edit(sel, { state: 'active' })}>Resume</button>
      <span className="muted">Wait</span><input className="mini" type="number" min="1" value={pz.min} onChange={e => setPz({ ...pz, min: e.target.value })} /><span className="muted">min after every</span><input className="mini" type="number" min="1" value={pz.every} onChange={e => setPz({ ...pz, every: e.target.value })} /><span className="muted">video(s)</span>
      <button className="ghost sm" disabled={!sel.length} onClick={() => edit(sel, { pauseMin: +pz.min || 0, pauseEvery: Math.max(1, +pz.every || 1) })}>Apply to selected</button>
      <button className="ghost sm" disabled={!sel.length} onClick={() => edit(sel, { pauseMin: 0, pauseEvery: 1 })}>Remove pause</button></div>
    <div className="cards one">{!plan.projects.length && <p className="muted">No projects yet. Create one in Playlists.</p>}
      {plan.projects.map((x, i) => { const c = cnt(x.id); return <div className={'card pj' + (x.state === 'paused' ? ' off' : '')} key={x.id}>
        <div className="pjhead"><label className="chk"><input type="checkbox" checked={sel.includes(x.id)} onChange={() => toggle(x.id)} /><b>{x.name}</b></label>
          <span className="pill">{x.state === 'paused' ? 'Paused' : 'Active'}</span>
          <span className="arrows"><button className="ghost sm" aria-label="Move up" disabled={!i} onClick={() => move(i, -1)}>↑</button><button className="ghost sm" aria-label="Move down" disabled={i === plan.projects.length - 1} onClick={() => move(i, 1)}>↓</button></span></div>
        <small className="muted">{c.Waiting} waiting · {c['In Process']} in process · {c.Completed} completed · {c.Uploaded} uploaded{c.Failed ? ` · ${c.Failed} failed` : ''} · {x.state === 'paused' ? 'skipped while paused' : pauseText(x)}</small>
        {plan.order === 'rotate' && <label className="inl">Videos per turn<input className="mini" type="number" min="1" value={x.perTurn} onChange={e => edit([x.id], { perTurn: Math.max(1, +e.target.value || 1) })} /></label>}</div> })}</div>
    <div className="row"><button className="cta sm" disabled={!dirty} onClick={() => run('Saving the plan…', save)}>{dirty ? 'Save plan' : 'Plan saved'}</button>
      <button className="ghost" onClick={load}>Refresh</button><button className="ghost" onClick={exportAll}>Download jobs for backend (all projects)</button>
      <input ref={f} type="file" accept=".json,application/json" hidden onChange={importRes} /><button className="ghost" onClick={() => f.current.click()}>Import results</button>
      <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${w.appId}`}>Open Application Config</a></div>

    <h3>Next up</h3>
    {queue[0] ? <p className="next"><b>{queue[0].playlist}</b> · #{queue[0].row.order || queue[0].row.row - 1} {queue[0].row.title}</p> : <p className="muted">Nothing is waiting in an active project.</p>}
    {queue.length > 1 && <ol className="queue">{queue.slice(1, 26).map((q, i) => <li key={q.projectId + q.row.row}><span className="muted">{q.playlist}</span> {q.row.title}{q.pauseAfterMin > 0 && <span className="chip-s">pause {q.pauseAfterMin} min after</span>}</li>)}{queue.length > 26 && <li className="muted">… and {queue.length - 26} more</li>}</ol>}
    {rec.paused_projects.length > 0 && <p className="hint">Paused, not in the queue: {rec.paused_projects.join(', ')}</p>}

    <h3>Record</h3>
    <div className="cols"><div><h4>In process ({rec.in_process.length})</h4>{rec.in_process.map(r => <small key={r.playlist + r.row} className="line">{r.playlist}: {r.title}</small>)}{!rec.in_process.length && <small className="muted">none</small>}</div>
      <div><h4>Made so far ({rec.completed.length})</h4>{rec.completed.slice(-30).reverse().map(r => <small key={r.playlist + r.row} className="line">{r.status === 'Uploaded' ? '⬆ ' : '✓ '}{r.playlist}: {r.title}{r.output && <> · <a href={r.output} target="_blank" rel="noreferrer">open</a></>}</small>)}{!rec.completed.length && <small className="muted">nothing yet</small>}</div></div>
  </main>
}
