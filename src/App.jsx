import {useState,useEffect,useRef} from 'react'
import * as G from './drive.js'

const MODES=[['reel','Reel'],['complete','Complete video'],['both','Reel + complete video']]
const ACCEPT='video/*,audio/*,.pdf,.md,application/pdf,text/markdown'

export default function App(){
  const [w,setW]=useState(null),[view,setView]=useState({t:'home'}),[busy,setBusy]=useState(''),[err,setErr]=useState('')
  const run=async(msg,fn)=>{setBusy(msg);setErr('');try{return await fn()}catch(e){setErr(e.message)}finally{setBusy('')}}
  const connect=()=>run('Connecting to your Google Drive…',async()=>{await G.signIn();setW(await G.init())})
  if(!w)return <Landing onConnect={connect} busy={busy} err={err}/>
  return <div className="shell">
    <header className="top"><b className="logo" onClick={()=>setView({t:'home'})}><i/>Frame AI</b>
      <nav><button className={view.t==='home'||view.t==='project'?'on':''} onClick={()=>setView({t:'home'})}>Projects</button>
      <button className={view.t==='scenes'?'on':''} onClick={()=>setView({t:'scenes'})}>Scenes</button>
      <a href={`https://drive.google.com/drive/folders/${w.rootId}`} target="_blank" rel="noreferrer">Open in Drive</a></nav></header>
    {busy&&<div className="bar"><span/>{busy}</div>}
    {err&&<div className="err" onClick={()=>setErr('')}>{err}</div>}
    {view.t==='home'&&<Projects w={w} run={run} open={p=>setView({t:'project',p})}/>}
    {view.t==='project'&&<Project w={w} p={view.p} run={run} back={()=>setView({t:'home'})}/>}
    {view.t==='scenes'&&<Scenes w={w} run={run}/>}
  </div>
}

function Landing({onConnect,busy,err}){return <main className="hero">
  <div className="grid"/><div className="orb o1"/><div className="orb o2"/>
  <div className="frames"><span/><span/><span/><span/></div>
  <h1>Turn raw footage into finished reels.</h1>
  <p>Connect your Google Drive once. Frame AI builds your workspace, keeps every project organised, and logs every step in Google Sheets.</p>
  <button className="cta" onClick={onConnect} disabled={!!busy}>{busy||'Connect Google Drive'}</button>
  {err&&<div className="err">{err}</div>}
  <small>Only files created by Frame AI are accessible. Nothing else in your Drive is read.</small></main>}

function Projects({w,run,open}){
  const [list,setList]=useState(null),[name,setName]=useState(''),[del,setDel]=useState(null)
  const load=()=>run('Loading projects…',async()=>setList(await G.listProjects(w)))
  useEffect(()=>{load()},[])
  const add=()=>{const n=name.trim();if(!n)return;run('Creating project…',async()=>{await G.createProject(w,n);setName('');setList(await G.listProjects(w))})}
  const remove=()=>run('Deleting project…',async()=>{await G.deleteProject(w,del);setDel(null);setList(await G.listProjects(w))})
  return <main className="page"><h2>Your projects</h2>
    <div className="row"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New project name"/><button className="cta sm" onClick={add}>Create project</button></div>
    <div className="cards">{list&&!list.length&&<p className="muted">No projects yet. Name one above to create its Drive folder and record sheet.</p>}
      {list?.map(p=><div className="card" key={p.folderId}><div onClick={()=>open(p)}><h3>{p.name}</h3>
        <p className="muted">{MODES.find(m=>m[0]===p.mode)?.[1]||'Output not set'}{p.length?` · ${p.length}s`:''}</p><small>{p.created}</small></div>
        <button className="ghost danger" onClick={()=>setDel(p)}>Delete</button></div>)}</div>
    {del&&<div className="modal"><div className="box"><h3>Delete “{del.name}”?</h3>
      <p>This permanently deletes the project folder in Google Drive with every file inside it, and removes its row from the Projects sheet. This cannot be undone.</p>
      <div className="row"><button className="ghost" onClick={()=>setDel(null)}>Keep project</button><button className="cta sm red" onClick={remove}>Delete forever</button></div></div></div>}
  </main>}

function Project({w,p,run,back}){
  const [s,setS]=useState({mode:'complete',length:60,start:'00:00',end:'',whole:true}),[desc,setDesc]=useState(''),[msg,setMsg]=useState(''),[yt,setYt]=useState(''),f=useRef()
  useEffect(()=>{run('Loading settings…',async()=>{const o=await G.getSettings(p);if(o['Output type'])setS({mode:o['Output type'],length:+o['Video length (s)']||60,start:o['Process part: start']||'00:00',end:o['Process part: end']||'',whole:o['Process whole video']!=='no'})})},[])
  const up=async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadToProject(p,x));setMsg(`${fs.length} file(s) uploaded and logged`)}
  const addYt=()=>{const u=yt.trim();if(!u)return;run('Saving YouTube link…',async()=>{const t=await G.addYoutubeLink(p,u);setYt('');setMsg(`Link saved: ${t}`)})}
  const set=k=>e=>setS({...s,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value})
  return <main className="page"><button className="ghost" onClick={back}>← All projects</button><h2>{p.name}</h2>
    <div className="cols"><section><h3>Files</h3><p className="muted">Video, audio, PDF or Markdown, or a YouTube link. Each item is recorded in this project’s sheet.</p>
      <input ref={f} type="file" multiple accept={ACCEPT} hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload files</button>
      <h3>Or add a YouTube link</h3><div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addYt()} placeholder="https://youtube.com/watch?v=…"/><button className="ghost" onClick={addYt}>Add link</button></div>
      <h3>YouTube link</h3><p className="muted">No need to download anything. Paste a link and it is saved to the project sheet.</p>
      <div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} placeholder="https://youtube.com/watch?v=…"/><button className="cta sm" onClick={()=>run('Adding link…',async()=>{await G.addLinkToProject(p,yt);setYt('');setMsg('YouTube link added and logged')})}>Add link</button></div>
      <h3>Instructions</h3><textarea rows={6} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Tell the AI what this project should look like…"/>
      <button className="ghost" onClick={()=>run('Saving…',async()=>{await G.saveDescription(p,desc);setMsg('description.txt saved')})}>Save as description.txt</button></section>
    <section><h3>Output</h3><div className="seg">{MODES.map(([k,l])=><button key={k} className={s.mode===k?'on':''} onClick={()=>setS({...s,mode:k})}>{l}</button>)}</div>
      <label>Video length (seconds)<input type="number" min="5" value={s.length} onChange={set('length')}/></label>
      <label className="chk"><input type="checkbox" checked={s.whole} onChange={set('whole')}/>Process the whole video</label>
      {!s.whole&&<div className="row"><label>From<input value={s.start} onChange={set('start')} placeholder="00:00"/></label><label>To<input value={s.end} onChange={set('end')} placeholder="02:30"/></label></div>}
      <button className="cta sm" onClick={()=>run('Saving settings…',async()=>{await G.saveSettings(w,p,s);setMsg('Settings written to the project sheet')})}>Save settings</button></section></div>
    {msg&&<p className="ok">{msg}</p>}
    <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${p.sheetId}`}>Open record sheet</a>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${p.folderId}`}>Open folder</a></div></main>}

function Scenes({w,run}){
  const [yt,setYt]=useState(''),[list,setList]=useState([]),f=useRef(),load=()=>run('Loading scenes…',async()=>setList(await G.listScenes(w)))
  useEffect(()=>{load()},[])
  const up=async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadScene(w,x));load()}
  return <main className="page"><h2>Scenes</h2><p className="muted">Video clips or YouTube links only. Each one gets a row in the Scene Videos sheet; Processed and Description stay empty until the AI fills them.</p>
    <input ref={f} type="file" multiple accept="video/*" hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload scene videos</button>
    <div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} placeholder="Or paste a YouTube link"/><button className="cta sm" onClick={()=>run('Adding link…',async()=>{await G.addSceneLink(w,yt);setYt('');load()})}>Add link</button></div>
    <table><thead><tr><th>Video name</th><th>Processed</th><th>Description</th></tr></thead><tbody>
      {list.map((r,i)=><tr key={i}><td>{r.name}</td><td>{r.processed}</td><td>{r.desc}</td></tr>)}</tbody></table>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${w.sceneSheet}`}>Open scene sheet</a></main>}
