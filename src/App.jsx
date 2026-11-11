import { useState, useEffect, useRef } from 'react'
import * as G from './drive.js'
import * as P from './playlist.js'
import Robot from './Robot.jsx'
import Videos from './Videos.jsx'
import Production from './Production.jsx'
import Social from './Social.jsx'
import Brand from './Brand.jsx'
import Editor from './Editor.jsx'
import { Narrator, ThumbStudio, ProjectSettings, ControlRoom } from './Studio.jsx'
import { Confirm, GlobalAssets, Requirements, Scenes } from './Classic.jsx'
import Home from './Home.jsx'
import Guide from './Guide.jsx'
import Prompts from './Prompts.jsx'
import Summary from './Summary.jsx'
import Voices from './Voices.jsx'
import { pushDraft, clearDraft } from './draft.js'
import { createSession, loadSession, saveSession, SessionConflict } from './session.js'
import { readLocal, useAutosave } from './autosave.js'
import GuidedPanel from './guided/GuidedPanel.jsx'


export default function App() {
  const [w, setW] = useState(null), [view, setView] = useState({ t: 'home' }), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const run = async (msg, fn) => { setBusy(msg); setErr(''); try { return await fn() } catch (e) { setErr(e.message) } finally { setBusy('') } }
  const [linked, setLinked] = useState(G.isLinked()), [preGuide, setPreGuide] = useState(false)
  // open the Drive workspace (needs a login only the very first time; afterwards G.signIn() is a silent no-op)
  const open = async () => { await G.signIn(); setLinked(true); if (w) return w; const ws = await G.init(); ws.g = await P.loadGlobal(ws.appId); setW(ws); return ws }
  const connect = () => run('Connecting to your Google Drive…', open)
  // the one place a login can be asked for: the person pressed Save on their plan
  const saveDraft = d => run('Saving to your Google Drive…', async () => {
    const ws = await open(); const p = await pushDraft(ws, d); clearDraft(); setView({ t: 'playlist', p })
  })
  const signOut = async () => { await G.signOut(); setLinked(false); setW(null); setView({ t: 'home' }) }
  // someone who connected before is let straight in: no button, no popup
  useEffect(() => {
    if (!G.isLinked()) return
    let dead = false
    ;(async () => {
      setBusy('Opening your studio…')
      for (let i = 0; i < 40 && !window.google && !dead; i++) await new Promise(r => setTimeout(r, 150))   // wait for the Google script
      try { if (await G.restore()) { const ws = await G.init(); ws.g = await P.loadGlobal(ws.appId); if (!dead) setW(ws) } }
      catch (e) { if (!dead) setErr(e.message) }
      finally { if (!dead) setBusy('') }
    })()
    return () => { dead = true }
  }, [])
  if (!w && preGuide) return <div className="shell"><main className="page"><button className="ghost" onClick={() => setPreGuide(false)}>← Back</button></main><Guide /><footer className="foot"><LegalLinks /></footer></div>
  if (!w) return <Home onGuide={() => setPreGuide(true)} onConnect={connect} onSave={saveDraft} busy={busy} err={err} linked={linked} LegalLinks={LegalLinks} />
  const here = view.t === 'playlist' ? 'home' : view.t
  return <div className="shell">
    <TopBar here={here} go={k => setView({ t: k })} busy={busy} rootId={w.rootId} onOut={signOut} />
    {busy && <div className="bar"><span />{busy}</div>}
    {err && <div className="err" role="alert" onClick={() => setErr('')}>{err}</div>}
    {view.t === 'home' && <Playlists w={w} run={run} open={p => setView({ t: 'playlist', p })} />}
    {view.t === 'playlist' && <Playlist key={view.p.folderId} w={w} p={view.p} run={run} back={() => setView({ t: 'home' })} onEdit={(p, r) => setView({ t: 'editor', p, r })} onGuided={(p, r, cfg) => setView({ t: 'guided', p, r, cfg })} onVoices={() => setView({ t: 'voices' })} />}
    {view.t === 'singles' && <Playlist key="singles" w={w} p={w.singles} single run={run} onEdit={(p, r) => setView({ t: 'editor', p, r })} onGuided={(p, r, cfg) => setView({ t: 'guided', p, r, cfg })} onVoices={() => setView({ t: 'voices' })} />}
    {view.t === 'editor' && <Editor key={view.r ? view.r.row + view.p.folderId : 'new'} w={w} run={run} start={view.r ? { p: view.p, r: view.r } : null} onSocial={key => setView({ t: 'social', pick: key })} />}
    {view.t === 'guided' && <GuidedEditor w={w} run={run} p={view.p} r={view.r} cfg={view.cfg} onEdit={(p, r) => setView({ t: 'editor', p, r })} onSocial={key => setView({ t: 'social', pick: key })} />}
    {view.t === 'production' && <Production w={w} run={run} />}
    {view.t === 'summary' && <Summary w={w} run={run} />}
    {view.t === 'voices' && <Voices w={w} run={run} />}
    {view.t === 'social' && <Social key={view.pick || 'social'} w={w} run={run} pick={view.pick} />}
    {view.t === 'brand' && <Brand w={w} run={run} />}
    {view.t === 'control' && <ControlRoom g={w.g} run={run} />}
    {view.t === 'reqs' && <Requirements w={w} run={run} />}
    {view.t === 'scenes' && <Scenes w={w} run={run} />}
    {view.t === 'prompts' && <Prompts />}
    {view.t === 'guide' && <Guide />}
    <footer className="foot"><LegalLinks /></footer>
  </div>
}

// Main pages stay inline on desktop; everything else lives in the "More" dropdown.
// On phones the inline links hide and one dropdown button (showing the current page) holds every page.
const PRIMARY = [['home', 'Playlists'], ['singles', 'Singles'], ['production', 'Production'], ['summary', 'Summary'], ['editor', 'Editor'], ['social', 'Social']]
const MORE = [['voices', 'My voices'], ['brand', 'Brand'], ['control', 'Control room'], ['reqs', 'Requirements'], ['scenes', 'Scenes'], ['prompts', 'Prompts'], ['guide', 'Guide']]

function TopBar({ here, go, busy, rootId, onOut }) {
  const [open, setOpen] = useState(false), box = useRef(null)
  useEffect(() => {
    if (!open) return
    const out = e => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  const pick = k => { setOpen(false); go(k) }
  const current = [...PRIMARY, ...MORE].find(([k]) => k === here)
  const item = ([k, l], cls = '') => <button key={k} role="menuitem" className={(cls + (here === k ? ' on' : '')).trim()} onClick={() => pick(k)}>{l}</button>
  return <header className="top">
    <b className="logo" role="link" tabIndex={0} onClick={() => pick('home')} onKeyDown={e => e.key === 'Enter' && pick('home')}><Robot mood={busy ? 'think' : 'idle'} size={40} />Frame AI</b>
    <nav ref={box} aria-label="Main">
      {PRIMARY.map(([k, l]) => <button key={k} className={'navbtn' + (here === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}
      <div className="menu">
        <button className={'menubtn' + (MORE.some(([k]) => k === here) ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="lbl-more">More</span><span className="lbl-menu">{current ? current[1] : 'Menu'}</span><i className="caret" aria-hidden="true" />
        </button>
        {open && <div className="drop" role="menu">
          {PRIMARY.map(p => item(p, 'p'))}
          {MORE.map(m => item(m))}
          <a role="menuitem" href={`https://drive.google.com/drive/folders/${rootId}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Open in Drive</a>
          <button role="menuitem" onClick={() => { setOpen(false); onOut() }}>Sign out</button>
        </div>}
      </div>
    </nav></header>
}

function LegalLinks() {
  return <nav className="legal" aria-label="Legal">
    <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
    <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>
    <a href="/data-deletion" target="_blank" rel="noreferrer">Delete my data</a>
  </nav>
}

const TINTS = ['#8aa0ff', '#ffb59a', '#7fe6c8', '#ffd466']
function Playlists({ w, run, open }) {
  const [list, setList] = useState(null), [name, setName] = useState(''), [del, setDel] = useState(null)
  const load = () => run('Loading playlists…', async () => setList(await G.listProjects(w)))
  useEffect(() => { load() }, [])
  const add = () => { const n = name.trim(); if (!n) return; run('Building the playlist folder and sheet…', async () => { await P.createPlaylist(w, n); setName(''); setList(await G.listProjects(w)) }) }
  const remove = () => run('Deleting playlist…', async () => { await G.deleteProject(w, del); setDel(null); setList(await G.listProjects(w)) })
  return <main className="page"><h2>Your playlists</h2>
    <p className="muted">The playlist name is also the project name. Each one keeps its narrator, thumbnail style and video sheet together.</p>
    <div className="row"><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Playlist name, e.g. AI for Beginners" /><button className="cta sm" onClick={add}>Create playlist</button></div>
    <div className="cards">{list && !list.length && <p className="muted">No playlists yet. Name your first one above.</p>}
      {list?.map(p => <div className="card cassette" key={p.folderId} style={{ '--tint': TINTS[(p.name.length + p.name.charCodeAt(0)) % 4] }}>
        <div onClick={() => open(p)}><span className="reel" /><h3>{p.name}</h3><small className="muted">{p.created}</small></div>
        <button className="ghost danger" onClick={() => setDel(p)}>Delete</button></div>)}</div>
    {del && <Confirm title={`Delete “${del.name}”?`} text="This permanently deletes the playlist folder in Google Drive with its sheet, thumbnails and assets. This cannot be undone." yes="Delete forever" onYes={remove} onNo={() => setDel(null)} />}
  </main>
}

function GuidedEditor({ w, run, p, r, cfg, onEdit, onSocial }) {
  const [loaded, setLoaded] = useState(null), [session, setSession] = useState(null), [restore, setRestore] = useState(null), [rowState, setRowState] = useState(r), [conflict, setConflict] = useState(false)
  useEffect(() => { run('Opening guided builder…', async () => { const got = await loadSession(p, r, cfg); if (!got.exists) { const made = await createSession(p, { ...r, ...got.folders.ids }, cfg); setLoaded(made.folders); setSession(made.session); return } setLoaded(got.folders); const local = await readLocal(`${p.folderId}:${r.row}`); if (local && (local.rev > got.session.rev || local.savedAt > got.session.savedAt)) setRestore(local); setSession(got.session) }) }, [])
  useEffect(() => { if (!['Waiting', 'In Process'].includes(rowState?.status)) return; let active = true; const reload = () => P.loadVideos(p).then(rows => { if (active) setRowState(rows.find(x => x.row === rowState.row) || rowState) }).catch(() => {}); const timer = setInterval(reload, 30000); addEventListener('focus', reload); return () => { active = false; clearInterval(timer); removeEventListener('focus', reload) } }, [p, rowState?.row, rowState?.status])
  const auto = useAutosave(session || { rev: 0 }, async s => { try { const next = await saveSession(loaded, s); setSession(next); return next } catch (e) { if (e instanceof SessionConflict) setConflict(true); throw e } }, `${p.folderId}:${rowState?.row || r.row}`)
  const reloadConflict = async () => { const got = await loadSession(p, rowState, cfg); setLoaded(got.folders); setSession(got.session); setConflict(false) }
  const overwriteConflict = async () => { const next = await saveSession(loaded, session, { force: true }); setSession(next); setConflict(false) }
  const cloneSession = () => run('Making a new version…', async () => {
    const rows = await P.loadVideos(p), title = `${session.title || r.title} (new version)`, order = rows.reduce((n, x) => Math.max(n, +x.order || 0, x.row - 1), 0) + 1
    await P.saveVideo(p, { order, title, topic: session.title, inputType: ['Script', 'Source'].includes(session.inputType) ? session.inputType : 'Prompt', script: session.sourceText || '', sourceMode: session.inputType === 'Source' ? r.sourceMode : '', minutes: session.settings.minutes, audience: session.settings.audience, language: session.settings.language, screen_language: session.settings.screen_language, aspect: session.settings.aspect, status: 'Hold', buildMode: 'guided' })
    const madeRow = (await P.loadVideos(p)).filter(x => x.title === title).at(-1)
    if (!madeRow) throw new Error('The new video row was created, but could not be reopened.')
    const made = await createSession(p, madeRow, cfg), copy = { ...session, rev: 0, savedAt: new Date().toISOString(), videoRow: madeRow.row, title, stage: session.scenes.length ? 'scenes' : 'blueprint', activeStep: null, submittedMaps: session.submittedMaps || [], backend: null }
    const saved = await saveSession(made.folders, copy, { force: true }); setLoaded(made.folders); setSession(saved); setRowState(madeRow); setRestore(null)
  })
  if (!session || !loaded) return <main className="page"><p>Opening guided builder…</p></main>
  const guided = { session, setSession, autosave: auto, global: w.g.cfg, folders: loaded, row: rowState, playlist: p, project: cfg, onRow: setRowState, onEdit, onSocial, onClone: cloneSession }
  const view = ['Waiting', 'In Process', 'Completed'].includes(rowState.status)
    ? <main className="page"><GuidedPanel {...guided} status={auto.state} /></main>
    : <Editor w={w} run={run} start={{ p, r: rowState }} guided={guided} onSocial={onSocial} />
  return <>{view}{restore && <div className="err">Unsaved work from this browser is newer. <button onClick={() => { setSession(restore); setRestore(null) }}>Restore unsaved work</button><button onClick={() => setRestore(null)}>Use Drive version</button></div>}{conflict && <div className="err"><b>This session changed in another tab.</b> Reload that version or deliberately overwrite it. <button className="ghost sm" onClick={reloadConflict}>Reload remote</button><button className="ghost sm" onClick={overwriteConflict}>Overwrite remote</button></div>}</>
}

function Playlist({ w, p, run, back, single, onEdit, onGuided, onVoices }) {
  const [tab, setTab] = useState('videos'), [cfg, setCfg] = useState(null), [rows, setRows] = useState(null), [focus, setFocus] = useState('')
  useEffect(() => { run('Opening playlist…', async () => { const c = await P.loadProject(p); setRows(await P.loadVideos(p)); setCfg(c) }) }, [])
  const save = async next => { await P.saveProject(p, next); setCfg(next) }
  const tabs = [['videos', 'Videos'], ['narrator', 'Narrator'], ['thumb', 'Thumbnails'], ['settings', 'Settings'], ['assets', 'Assets']]
  return <main className="page">{!single && <button className="ghost" onClick={back}>← All playlists</button>}<h2>{p.name}</h2>{single && <p className="muted">Stand-alone videos. No playlist, so no shared description: each video stands on its own.</p>}
    {cfg && rows && <>
      <div className="seg tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'videos' && <Videos single={single} p={p} g={w.g.cfg} cfg={cfg} name={p.name} rows={rows} setRows={setRows} run={run} gotoThumb={r => { setFocus(r); setTab('thumb') }} gotoEdit={r => onEdit(p, r)} gotoGuided={r => onGuided(p, r, cfg)} />}
      {tab === 'narrator' && <Narrator cfg={cfg} save={save} g={w.g.cfg} run={run} onVoices={onVoices} />}
      {tab === 'thumb' && <ThumbStudio focus={focus} p={p} cfg={cfg} save={save} rows={rows} setRows={setRows} run={run} />}
      {tab === 'settings' && <ProjectSettings single={single} cfg={cfg} save={save} run={run} />}
      {tab === 'assets' && <GlobalAssets p={p} run={run} />}
      <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${p.folderId}`}>Open folder</a></div></>}
  </main>
}
