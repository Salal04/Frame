import { useState, useRef } from 'react'
import * as P from './playlist.js'
import * as G from './drive.js'
import { STATUSES, isLocked, VOICES, LANGS, ASPECTS, MAX_SCRIPT, buildJobs, normAspect, aspectHint } from './config.js'
import { Confirm } from './Classic.jsx'
import { EnginePicker, enginePhrase } from './Engine.jsx'
import Clips from './Clips.jsx'
import { engineLabel, estimateRender, normEngine } from './config.js'

const inherit = (l = 'Playlist default') => [['', l]]
const cls = s => 'st-' + (s || 'Hold').toLowerCase().replace(/\s+/g, '-')

const tooLong = t => { if ((t || '').length > MAX_SCRIPT) throw new Error(`The script is ${t.length.toLocaleString()} characters. One sheet cell holds about 50,000, so split it into two videos.`) }

function Row({ r, cfg, p, run, reload, gotoThumb, gotoEdit, ask, single }) {
  const [e, setE] = useState(r), [open, setOpen] = useState(false), tf = useRef(), sf = useRef(), up = k => ev => setE({ ...e, [k]: ev.target.value })
  const save = () => run('Saving video…', async () => {
    if (e.inputType === 'Script') { if (!(e.script || '').trim()) throw new Error('This video is set to Script, but the script is empty.'); tooLong(e.script) }
    await P.saveVideo(p, e); await reload(); setOpen(false) })
  const pickScript = ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) run('Reading the script…', async () => { const t = await G.readTextFile(x); tooLong(t); setE(c => ({ ...c, script: t })) }) }
  const own = ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) run('Uploading thumbnail…', async () => { const link = await P.uploadVideoThumb(p, x, e); await P.saveVideo(p, { ...e, thumbLink: link }); await reload() }) }
  const back = (patch, msg) => run(msg, async () => { await P.saveVideo(p, { ...e, ...patch }); await reload() })
  return <div className={'card video ' + cls(r.status)}>
    <div className="vhead" onClick={() => setOpen(!open)}><span className="num">{r.order || r.row - 1}</span>
      <div><h3>{r.title}</h3><small className="muted">{r.inputType === 'Script' ? 'own script' : 'prompt'} · {r.minutes || (r.inputType === 'Script' ? 'length from script' : cfg.minutes + ' min')}{r.minutes ? ' min' : ''} · {normAspect(r.aspect) ? r.aspect + ' (own)' : (normAspect(cfg.aspect) || '16:9') + ' (project)'} · {enginePhrase(r.engine, r.engineFixed, cfg.engine, cfg.engine_fixed)} · {r.thumbLink ? 'own thumbnail' : 'default thumbnail'} · {single ? (r.description ? 'own description' : 'no description') : (r.description ? 'own description + project description' : 'project description')}</small></div>
      <span className="pill">{r.status}</span></div>
    {open && <div className="vbody">
      <div className="statusbox">
        {isLocked(r.status)
          ? <p className="muted">🔒 <b>{r.status}</b>: the backend has taken this video, so its status can no longer be changed here.</p>
          : <><div className="seg tabs">{[['Hold', 'Hold (backend must not start it)'], ['Waiting', 'Waiting (backend may start it)']].map(([k, l]) => <button key={k} className={r.status === k ? 'on' : ''} disabled={r.status === k} onClick={() => back({ status: k }, k === 'Waiting' ? 'Releasing to the backend…' : 'Putting on Hold…')}>{l}</button>)}</div>
            <small className="hint">You can switch between Hold and Waiting until the backend starts the video. After that the status belongs to the backend.</small></>}
        {r.folderLink ? <small className="muted">Video folder: <a href={r.folderLink} target="_blank" rel="noreferrer">open</a> (Input · Output)</small> : <small className="muted">The video folder (Input / Output) is created when you save it.</small>}
      </div>
      <label>Title<input value={e.title} onChange={up('title')} /></label>
      <label>This video is made from<select value={e.inputType} onChange={up('inputType')}><option value="Prompt">A prompt (Frame writes the script)</option><option value="Script">My own script (Frame uses it as written)</option></select></label>
      {e.inputType === 'Script'
        ? <><label>Script<textarea rows={9} value={e.script} onChange={up('script')} placeholder="Paste the full script here, or upload a file below." /><small className="hint">{(e.script || '').length.toLocaleString()} characters. Used word for word as the narration.</small></label>
          <div className="row tight"><input ref={sf} type="file" accept=".txt,.md,.srt,.pdf,.docx,.doc,.rtf,.odt" hidden onChange={pickScript} /><button className="ghost sm" onClick={() => sf.current.click()}>Upload script file</button><small className="muted">.txt, .md, .pdf, .docx, .doc, .rtf, .odt. It replaces the text above.</small></div></>
        : <label>Topic / prompt<textarea rows={3} value={e.topic} onChange={up('topic')} /><small className="hint">This is exactly what the pipeline receives as the topic.</small></label>}
      <label>Description<textarea rows={3} value={e.description} onChange={up('description')} placeholder={single ? 'Optional. Singles have no shared description, so only this one is used.' : "Optional. Written first; the project's default description is added after it."} /></label>
      <div className="cols"><label>Minutes<input type="number" min="0.5" step="0.5" value={e.minutes} placeholder={e.inputType === 'Script' ? 'from script' : cfg.minutes} onChange={up('minutes')} /></label>
        <label>Audience<input value={e.audience} placeholder={cfg.audience} onChange={up('audience')} /></label>
        <label>Narration language<select value={e.language} onChange={up('language')}>{[...inherit(), ...LANGS].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Screen language<select value={e.screen_language} onChange={up('screen_language')}>{[...inherit(), ...LANGS].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Aspect<select value={e.aspect} onChange={up('aspect')}>{[...inherit(`Project default (${normAspect(cfg.aspect) || '16:9'})`), ...ASPECTS].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><small className="hint">{aspectHint(e.aspect || cfg.aspect || '16:9')}</small></label>
        <label>Voice<select value={e.voice} onChange={up('voice')}>{[...inherit('Playlist narrator'), ...VOICES.map(v => [v[0], `${v[0]} · ${v[1]}`])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
      <EnginePicker engine={e.engine} fixed={e.engineFixed} inherit={engineLabel(cfg.engine || 'auto')}
        est={{ minutes: +e.minutes || cfg.minutes, scene_sec: cfg.scene_sec, quality: cfg.quality, max_scenes: cfg.max_scenes, engine: cfg.engine || 'auto' }}
        onEngine={k => setE(c => ({ ...c, engine: k }))} onFixed={k => setE(c => ({ ...c, engineFixed: k }))} />
      <label>Extra config (JSON)<textarea rows={2} spellCheck="false" value={e.extra} placeholder='{"scene_sec": 10, "quality": "high"}' onChange={up('extra')} /><small className="hint">Any VideoConfig field. Beats every other level.</small></label>
      <Clips e={e} setE={setE} p={p} run={run} reload={reload} locked={isLocked(r.status)} />
      <label>Notes<textarea rows={2} value={e.notes} onChange={up('notes')} /></label>
      <p className="muted">Thumbnail: {r.thumbLink ? <><a href={r.thumbLink} target="_blank" rel="noreferrer">own thumbnail</a> (used for this video)</> : 'none of its own, the default template of this project is used'}</p>
      <div className="row"><button className="cta sm" onClick={save}>Save video</button>
        <input ref={tf} type="file" accept="image/*" hidden onChange={own} /><button className="ghost" onClick={() => tf.current.click()}>{r.thumbLink ? 'Replace own thumbnail' : 'Upload own thumbnail'}</button>
        {r.thumbLink && <button className="ghost" onClick={() => back({ thumbLink: '' }, 'Back to the default thumbnail…')}>Use default thumbnail</button>}
        <button className="ghost" onClick={() => gotoThumb(r.row)}>Thumbnail studio</button>
        {r.output && <a className="ghost" href={r.output} target="_blank" rel="noreferrer">Output</a>}{r.output && <button className="ghost" onClick={() => gotoEdit(r)}>Edit video</button>}<button className="ghost danger" onClick={() => ask(r)}>Remove</button></div></div>}
  </div>
}

// Upload a sheet: check the columns, then append to this project's sheet or replace it.
function SheetImport({ p, rows, run, reload }) {
  const [t, setT] = useState(null), [name, setName] = useState(''), [ask, setAsk] = useState(false), f = useRef()
  const pick = e => { const x = e.target.files[0]; e.target.value = ''; if (x) run('Reading your sheet…', async () => { const tb = await G.readTable(x); if (tb.length < 2) throw new Error('The sheet has no video rows.'); setT(tb); setName(x.name) }) }
  const a = t && P.checkTable(p, t)
  const go = mode => run(mode === 'replace' ? 'Replacing the sheet…' : 'Appending to the sheet…', async () => { await P.importTable(p, rows, t, mode); setT(null); setAsk(false); await reload() })
  return <div className="panel"><input ref={f} type="file" accept=".xlsx,.xls,.csv,.tsv,.ods" hidden onChange={pick} />
    {!t && <div className="row tight"><button className="ghost" onClick={() => f.current.click()}>Upload a sheet</button><small className="muted">Excel, CSV or ODS. One row per video, with its own settings in the columns.</small></div>}
    {t && <>
      <h3>{name}: {a.count} videos found</h3>
      {!a.hasKey && <p className="bad">No “Video Title” or “Topic / Prompt” column. Rename one column and upload again.</p>}
      <p className="muted"><b>Matched columns:</b> {a.matched.join(', ') || 'none'}</p>
      {a.added.length > 0 && <p className="muted"><b>New columns, added to your sheet:</b> {a.added.join(', ')}</p>}
      {a.absent.length > 0 && <p className="muted"><b>Not in your file, left empty (defaults are used):</b> {a.absent.join(', ')}</p>}
      <p className="muted">Every imported video starts on Hold (only Hold or Waiting is accepted from a file). Numbering continues automatically.</p>
      <div className="row tight"><button className="cta sm" disabled={!a.hasKey || !a.count} onClick={() => go('append')}>Append to current sheet</button>
        <button className="ghost danger" disabled={!a.hasKey || !a.count} onClick={() => setAsk(true)}>Replace current sheet</button><button className="ghost" onClick={() => setT(null)}>Cancel</button></div></>}
    {ask && <Confirm title="Replace the whole sheet?" text={`All ${rows.length} current videos in this project's Playlist sheet are removed and the ${a.count} from the file take their place. Statuses of the old videos are lost.`} yes="Replace" onYes={() => go('replace')} onNo={() => setAsk(false)} />}
  </div>
}

const BLANK = { mode: 'Prompt', title: '', topic: '', script: '', minutes: '' }

export default function Videos({ p, g, cfg, name, rows, setRows, run, gotoThumb, gotoEdit, single }) {
  const [nt, setNt] = useState(BLANK), [del, setDel] = useState(null), f = useRef(), sf = useRef()
  const reload = async () => setRows(await P.loadVideos(p))
  const total = rows.reduce((a, r) => a + (+r.minutes || +cfg.minutes || 0), 0), noOwn = rows.filter(r => !r.thumbLink).length, t = cfg.thumb || {}
  const n = s => rows.filter(r => r.status === s).length
  const waitMin = rows.filter(r => r.status === 'Waiting').reduce((a, r) => { const e = estimateRender({ minutes: +r.minutes || +cfg.minutes || 3, scene_sec: cfg.scene_sec, quality: cfg.quality, max_scenes: cfg.max_scenes, engine: normEngine(r.engine) || normEngine(cfg.engine) || 'auto' }); return [a[0] + e.sec[0] / 60, a[1] + e.sec[1] / 60] }, [0, 0])
  const fmtT = m => m >= 90 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m)} min`
  const add = () => {
    const ti = nt.title.trim(), tp = nt.topic.trim(), sc = nt.script.trim(), isScript = nt.mode === 'Script'
    if (isScript ? !sc : (!ti && !tp)) return
    run(single ? 'Adding the video…' : 'Adding to the playlist…', async () => {
      if (isScript) tooLong(sc)
      await P.saveVideo(p, isScript
        ? { order: rows.length + 1, title: ti || sc.slice(0, 60), topic: '', inputType: 'Script', script: sc, minutes: nt.minutes, status: 'Hold' }
        : { order: rows.length + 1, title: ti || tp.slice(0, 60), topic: tp || ti, inputType: 'Prompt', script: '', minutes: nt.minutes || cfg.minutes, status: 'Hold' })
      setNt({ ...BLANK, mode: nt.mode }); await reload() })
  }
  const pickScript = ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) run('Reading the script…', async () => { const t = await G.readTextFile(x); tooLong(t); setNt(c => ({ ...c, mode: 'Script', script: t, title: c.title || x.name.replace(/\.[^.]+$/, '') })) }) }
  const download = (data, file) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
  const exportJobs = () => run('Building jobs file…', async () => {
    if (!rows.some(r => r.status === 'Waiting')) throw new Error('No video is Waiting. Videos on Hold are not sent to the backend; release them first.')
    let cur = rows; if (await P.prepareFolders(p, rows)) { cur = await P.loadVideos(p); setRows(cur) }   // every Waiting video needs its Input/Output folder
    download(buildJobs(g, cfg, name, cur), 'frame_jobs.json')
  })
  const importRes = e => { const x = e.target.files[0]; e.target.value = ''; if (x) run('Reading results…', async () => { const k = await P.importResults(p, rows, JSON.parse(await x.text())); await reload(); if (!k) throw new Error('No row in that file matches this playlist.') }) }
  return <section>
    <div className="stats"><b>{rows.length}</b> videos <b>{Math.round(total * 10) / 10}</b> minutes · {waitMin[1] > 0 && <>waiting videos need about {waitMin[0] === waitMin[1] ? fmtT(waitMin[0]) : `${fmtT(waitMin[0])} to ${fmtT(waitMin[1])}`} to build · </>}{STATUSES.map(s => n(s) ? `${n(s)} ${s.toLowerCase()}` : '').filter(Boolean).join(' · ')}</div>
    {noOwn > 0 && <p className="note">{noOwn} video{noOwn > 1 ? 's have' : ' has'} no thumbnail of its own, so the default template {t.templateName ? <b>{t.templateName}</b> : <b>(none uploaded yet, a plain background is used)</b>} is used and the backend writes the title on it. <button className="link" onClick={() => gotoThumb('')}>Set the default template</button></p>}
    <div className="seg tabs">{[['Prompt', 'From a prompt'], ['Script', 'I have a script']].map(([k, l]) => <button key={k} className={nt.mode === k ? 'on' : ''} onClick={() => setNt({ ...nt, mode: k })}>{l}</button>)}</div>
    <p className="hint">New videos start on <b>Hold</b>: the backend will not touch them until you set them to Waiting.</p>
    <p className="hint">{nt.mode === 'Prompt' ? 'Give a topic and Frame writes the script, then makes the video.' : 'Paste or upload your finished script. Frame uses it as written and only makes the video.'}</p>
    <div className="row add"><input value={nt.title} onChange={e => setNt({ ...nt, title: e.target.value })} placeholder="Video title" />
      {nt.mode === 'Prompt' && <input value={nt.topic} onChange={e => setNt({ ...nt, topic: e.target.value })} placeholder="Topic or prompt for the pipeline" />}
      <input className="mini" type="number" min="0.5" step="0.5" value={nt.minutes} onChange={e => setNt({ ...nt, minutes: e.target.value })} placeholder={nt.mode === 'Script' ? 'auto' : `${cfg.minutes} min`} />
      {nt.mode === 'Prompt' && <button className="cta sm" onClick={add}>Add video</button>}</div>
    {nt.mode === 'Script' && <><textarea rows={7} value={nt.script} onChange={e => setNt({ ...nt, script: e.target.value })} placeholder="Paste the full script here, or upload a file." />
      <div className="row"><input ref={sf} type="file" accept=".txt,.md,.srt,.pdf,.docx,.doc,.rtf,.odt" hidden onChange={pickScript} /><button className="ghost" onClick={() => sf.current.click()}>Upload script file</button>
        <small className="muted">{nt.script.length.toLocaleString()} characters · .txt, .md, .pdf, .docx, .doc, .rtf, .odt</small><button className="cta sm" disabled={!nt.script.trim()} onClick={add}>Add video</button></div></>}
    <SheetImport p={p} rows={rows} run={run} reload={reload} />
    <div className="row">{n('Hold') > 0 && <button className="cta sm" onClick={() => run('Releasing all Hold videos…', async () => { await P.releaseAll(p, rows); await reload() })}>Release all {n('Hold')} on Hold → Waiting</button>}<button className="ghost" onClick={exportJobs}>Download jobs for backend</button>
      <input ref={f} type="file" accept=".json,application/json" hidden onChange={importRes} /><button className="ghost" onClick={() => f.current.click()}>Import results</button>
      <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${p.sheetId}`}>Open sheet</a></div>
    <div className="cards one">{!rows.length && <p className="muted">No videos yet. Add the first prompt or script above, upload a sheet, or type rows straight into the Playlist sheet.</p>}
      {rows.map(r => <Row key={[r.row, r.title, r.status, r.thumbLink].join('|')} single={single} r={r} cfg={cfg} p={p} run={run} reload={reload} gotoThumb={gotoThumb} gotoEdit={gotoEdit} ask={setDel} />)}</div>
    {del && <Confirm title={`Remove “${del.title}”?`} text="The row is deleted from the Playlist sheet. The video's Drive folder (Input / Output) stays." yes="Remove" onYes={() => run('Removing…', async () => { await P.deleteVideo(p, del); setDel(null); await reload() })} onNo={() => setDel(null)} />}
  </section>
}
