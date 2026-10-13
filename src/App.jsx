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


export default function App() {
  const [w, setW] = useState(null), [view, setView] = useState({ t: 'home' }), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const run = async (msg, fn) => { setBusy(msg); setErr(''); try { return await fn() } catch (e) { setErr(e.message) } finally { setBusy('') } }
  const connect = () => run('Connecting to your Google Drive…', async () => { await G.signIn(); const ws = await G.init(); ws.g = await P.loadGlobal(ws.appId); setW(ws) })
  if (!w) return <Landing onConnect={connect} busy={busy} err={err} />
  const here = view.t === 'playlist' ? 'home' : view.t
  return <div className="shell">
    <TopBar here={here} go={k => setView({ t: k })} busy={busy} rootId={w.rootId} />
    {busy && <div className="bar"><span />{busy}</div>}
    {err && <div className="err" role="alert" onClick={() => setErr('')}>{err}</div>}
    {view.t === 'home' && <Playlists w={w} run={run} open={p => setView({ t: 'playlist', p })} />}
    {view.t === 'playlist' && <Playlist key={view.p.folderId} w={w} p={view.p} run={run} back={() => setView({ t: 'home' })} onEdit={(p, r) => setView({ t: 'editor', p, r })} />}
    {view.t === 'singles' && <Playlist key="singles" w={w} p={w.singles} single run={run} onEdit={(p, r) => setView({ t: 'editor', p, r })} />}
    {view.t === 'editor' && <Editor key={view.r ? view.r.row + view.p.folderId : 'new'} w={w} run={run} start={view.r ? { p: view.p, r: view.r } : null} onSocial={key => setView({ t: 'social', pick: key })} />}
    {view.t === 'production' && <Production w={w} run={run} />}
    {view.t === 'social' && <Social key={view.pick || 'social'} w={w} run={run} pick={view.pick} />}
    {view.t === 'brand' && <Brand w={w} run={run} />}
    {view.t === 'control' && <ControlRoom g={w.g} run={run} />}
    {view.t === 'reqs' && <Requirements w={w} run={run} />}
    {view.t === 'scenes' && <Scenes w={w} run={run} />}
  </div>
}

// Main pages stay inline on desktop; everything else lives in the "More" dropdown.
// On phones the inline links hide and one dropdown button (showing the current page) holds every page.
const PRIMARY = [['home', 'Playlists'], ['singles', 'Singles'], ['production', 'Production'], ['editor', 'Editor'], ['social', 'Social']]
const MORE = [['brand', 'Brand'], ['control', 'Control room'], ['reqs', 'Requirements'], ['scenes', 'Scenes']]

function TopBar({ here, go, busy, rootId }) {
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
        </div>}
      </div>
    </nav></header>
}

function Landing({ onConnect, busy, err }) {
  return <main className="hero">
    <Robot mood={busy ? 'think' : 'idle'} size={220} />
    <h1>Plan a playlist. Frame builds the videos.</h1>
    <p>Connect Google Drive once. Every playlist gets its own folder, narrator, thumbnail style and a sheet of videos to produce.</p>
    <button className="cta" onClick={onConnect} disabled={!!busy}>{busy || 'Connect Google Drive'}</button>
    {err && <div className="err" role="alert">{err}</div>}
    <small>Frame AI only touches files it creates. Nothing else in your Drive is read.</small></main>
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

function Playlist({ w, p, run, back, single, onEdit }) {
  const [tab, setTab] = useState('videos'), [cfg, setCfg] = useState(null), [rows, setRows] = useState(null), [focus, setFocus] = useState('')
  useEffect(() => { run('Opening playlist…', async () => { const c = await P.loadProject(p); setRows(await P.loadVideos(p)); setCfg(c) }) }, [])
  const save = async next => { await P.saveProject(p, next); setCfg(next) }
  const tabs = [['videos', 'Videos'], ['narrator', 'Narrator'], ['thumb', 'Thumbnails'], ['settings', 'Settings'], ['assets', 'Assets']]
  return <main className="page">{!single && <button className="ghost" onClick={back}>← All playlists</button>}<h2>{p.name}</h2>{single && <p className="muted">Stand-alone videos. No playlist, so no shared description: each video stands on its own.</p>}
    {cfg && rows && <>
      <div className="seg tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'videos' && <Videos single={single} p={p} g={w.g.cfg} cfg={cfg} name={p.name} rows={rows} setRows={setRows} run={run} gotoThumb={r => { setFocus(r); setTab('thumb') }} gotoEdit={r => onEdit(p, r)} />}
      {tab === 'narrator' && <Narrator cfg={cfg} save={save} g={w.g.cfg} run={run} />}
      {tab === 'thumb' && <ThumbStudio focus={focus} p={p} cfg={cfg} save={save} rows={rows} setRows={setRows} run={run} />}
      {tab === 'settings' && <ProjectSettings single={single} cfg={cfg} save={save} run={run} />}
      {tab === 'assets' && <GlobalAssets p={p} run={run} />}
      <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${p.folderId}`}>Open folder</a></div></>}
  </main>
}
