import {useState,useEffect,useRef} from 'react'
import * as G from './drive.js'

const MODES=[['reel','Reel'],['complete','Complete video'],['both','Reel + complete video']]
const ACCEPT='video/*,audio/*,.pdf,.md,application/pdf,text/markdown'

export default function App(){
  const [w,setW]=useState(null),[view,setView]=useState({t:'home'}),[busy,setBusy]=useState(''),[err,setErr]=useState('')
  const run=async(msg,fn)=>{setBusy(msg);setErr('');try{return await fn()}catch(e){setErr(e.message)}finally{setBusy('')}}
  const connect=()=>run('Connecting to your Google Drive…',async()=>{await G.signIn();setW(await G.init())})
  if(!w)return <Landing onConnect={connect} busy={busy} err={err}/>
  const inProj=['home','project','video'].includes(view.t)
  return <div className="shell">
    <header className="top"><b className="logo" onClick={()=>setView({t:'home'})}><i/>Frame AI</b>
      <nav><button className={inProj?'on':''} onClick={()=>setView({t:'home'})}>Projects</button>
      <button className={view.t==='reqs'?'on':''} onClick={()=>setView({t:'reqs'})}>Requirements</button>
      <button className={view.t==='scenes'?'on':''} onClick={()=>setView({t:'scenes'})}>Scenes</button>
      <a href={`https://drive.google.com/drive/folders/${w.rootId}`} target="_blank" rel="noreferrer">Open in Drive</a></nav></header>
    {busy&&<div className="bar"><span/>{busy}</div>}
    {err&&<div className="err" onClick={()=>setErr('')}>{err}</div>}
    {view.t==='home'&&<Projects w={w} run={run} open={p=>setView({t:'project',p})}/>}
    {view.t==='project'&&<Project p={view.p} run={run} back={()=>setView({t:'home'})} open={v=>setView({t:'video',p:view.p,v})}/>}
    {view.t==='video'&&<Video p={view.p} v={view.v} run={run} back={()=>setView({t:'project',p:view.p})}/>}
    {view.t==='reqs'&&<Requirements w={w} run={run}/>}
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

function Confirm({title,text,yes,onYes,onNo}){return <div className="modal"><div className="box"><h3>{title}</h3><p>{text}</p>
  <div className="row"><button className="ghost" onClick={onNo}>Keep it</button><button className="cta sm red" onClick={onYes}>{yes}</button></div></div></div>}

// ---------- big projects: one per teacher / series ----------
function Projects({w,run,open}){
  const [list,setList]=useState(null),[name,setName]=useState(''),[del,setDel]=useState(null)
  const load=()=>run('Loading projects…',async()=>setList(await G.listProjects(w)))
  useEffect(()=>{load()},[])
  const add=()=>{const n=name.trim();if(!n)return;run('Creating project and global folders…',async()=>{await G.createProject(w,n);setName('');setList(await G.listProjects(w))})}
  const remove=()=>run('Deleting project…',async()=>{await G.deleteProject(w,del);setDel(null);setList(await G.listProjects(w))})
  return <main className="page"><h2>Your projects</h2><p className="muted">One project per teacher or series. Inside it you add a sub-project for every video, plus global assets shared by all of them.</p>
    <div className="row"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New project, e.g. the teacher's name"/><button className="cta sm" onClick={add}>Create project</button></div>
    <div className="cards">{list&&!list.length&&<p className="muted">No projects yet.</p>}
      {list?.map(p=><div className="card" key={p.folderId}><div onClick={()=>open(p)}><h3>{p.name}</h3><small>{p.created}</small></div>
        <button className="ghost danger" onClick={()=>setDel(p)}>Delete</button></div>)}</div>
    {del&&<Confirm title={`Delete “${del.name}”?`} text="This permanently deletes the project folder in Google Drive with every video and global asset inside it. This cannot be undone." yes="Delete forever" onYes={remove} onNo={()=>setDel(null)}/>}
  </main>}

function Project({p,run,back,open}){
  const [tab,setTab]=useState('videos')
  return <main className="page"><button className="ghost" onClick={back}>← All projects</button><h2>{p.name}</h2>
    <div className="seg tabs">{[['videos','Videos'],['global','Global assets'],['profile','Profile & defaults']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {tab==='videos'&&<Videos p={p} run={run} open={open}/>}
    {tab==='global'&&<GlobalAssets p={p} run={run}/>}
    {tab==='profile'&&<Profile p={p} run={run}/>}
    <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${p.sheetId}`}>Open record sheet</a>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${p.folderId}`}>Open folder</a></div></main>}

function Videos({p,run,open}){
  const [list,setList]=useState(null),[name,setName]=useState(''),[del,setDel]=useState(null)
  useEffect(()=>{run('Loading videos…',async()=>setList(await G.listVideos(p)))},[])
  const add=()=>{const n=name.trim();if(!n)return;run('Creating video…',async()=>{await G.createVideo(p,n);setName('');setList(await G.listVideos(p))})}
  const remove=()=>run('Deleting video…',async()=>{await G.deleteVideo(p,del);setDel(null);setList(await G.listVideos(p))})
  return <section><div className="row"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New video name"/><button className="cta sm" onClick={add}>Add video</button></div>
    <div className="cards">{list&&!list.length&&<p className="muted">No videos yet. Name one above to create its folder and record sheet.</p>}
      {list?.map(v=><div className="card" key={v.folderId}><div onClick={()=>open(v)}><h3>{v.name}</h3>
        <p className="muted">{MODES.find(m=>m[0]===v.mode)?.[1]||'Output not set'}{v.length?` · ${v.length}s`:''}</p><small>{v.created}</small></div>
        <button className="ghost danger" onClick={()=>setDel(v)}>Delete</button></div>)}</div>
    {del&&<Confirm title={`Delete “${del.name}”?`} text="This deletes the video folder and everything inside it. Global assets are not touched." yes="Delete forever" onYes={remove} onNo={()=>setDel(null)}/>}
  </section>}

function GlobalAssets({p,run}){
  const [files,setFiles]=useState([]),load=()=>run('Loading assets…',async()=>setFiles(await G.listGlobal(p)))
  useEffect(()=>{load()},[])
  const up=cat=>async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadGlobal(p,cat,x));load()}
  return <section><p className="muted">Uploaded once, used by every video of this project.</p><div className="cards">
    {G.GLOBAL.map(([cat,hint,acc])=><div className="card" key={cat}><div><h3>{cat.replace('-',' & ')}</h3><p className="muted">{hint}</p>
      {files.filter(f=>f.cat===cat).map((f,i)=><small key={i}><a href={f.link} target="_blank" rel="noreferrer">{f.name}</a><br/></small>)}</div>
      <label className="ghost">Upload<input type="file" multiple hidden accept={acc} onChange={up(cat)}/></label></div>)}</div></section>}

function Profile({p,run}){
  const [v,setV]=useState({}),[ok,setOk]=useState(false)
  useEffect(()=>{run('Loading profile…',async()=>setV(await G.getProfile(p)))},[])
  return <section><p className="muted">Defaults every video of this project starts from.</p>
    {G.PROFILE.map(([k,ph,long])=><label key={k}>{k}{long?<textarea rows={3} value={v[k]||''} placeholder={ph} onChange={e=>setV({...v,[k]:e.target.value})}/>:<input value={v[k]||''} placeholder={ph} onChange={e=>setV({...v,[k]:e.target.value})}/>}</label>)}
    <button className="cta sm" onClick={()=>run('Saving…',async()=>{await G.saveProfile(p,v);setOk(true)})}>Save profile</button>{ok&&<p className="ok">Saved to the Profile sheet</p>}</section>}

// ---------- one video (sub-project) ----------
function Video({p,v,run,back}){
  const [s,setS]=useState({mode:'complete',length:60,start:'00:00',end:'',whole:true}),[desc,setDesc]=useState(''),[msg,setMsg]=useState(''),[yt,setYt]=useState(''),f=useRef()
  useEffect(()=>{run('Loading settings…',async()=>{const [o,pr]=await Promise.all([G.getSettings(v),G.getProfile(p)])
    if(o['Output type'])setS({mode:o['Output type'],length:+o['Video length (s)']||60,start:o['Process part: start']||'00:00',end:o['Process part: end']||'',whole:o['Process whole video']!=='no'})
    else if(+pr['Default video length (s)'])setS(x=>({...x,length:+pr['Default video length (s)']}))})},[])
  const up=async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadToVideo(v,x));setMsg(`${fs.length} file(s) uploaded and logged`)}
  const set=k=>e=>setS({...s,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value})
  return <main className="page"><button className="ghost" onClick={back}>← {p.name}</button><h2>{v.name}</h2>
    <div className="cols"><section><h3>Files</h3><p className="muted">Video, audio, PDF or Markdown, or a YouTube link. Each item is recorded in this video’s sheet.</p>
      <input ref={f} type="file" multiple accept={ACCEPT} hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload files</button>
      <h3>YouTube link</h3><div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} placeholder="https://youtube.com/watch?v=…"/><button className="ghost" onClick={()=>run('Adding link…',async()=>{await G.addLinkToVideo(v,yt);setYt('');setMsg('YouTube link added and logged')})}>Add link</button></div>
      <h3>Instructions</h3><textarea rows={6} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Tell the AI what this video should look like…"/>
      <button className="ghost" onClick={()=>run('Saving…',async()=>{await G.saveDescription(v,desc);setMsg('description.txt saved')})}>Save as description.txt</button></section>
    <section><h3>Output</h3><div className="seg">{MODES.map(([k,l])=><button key={k} className={s.mode===k?'on':''} onClick={()=>setS({...s,mode:k})}>{l}</button>)}</div>
      <label>Video length (seconds)<input type="number" min="5" value={s.length} onChange={set('length')}/></label>
      <label className="chk"><input type="checkbox" checked={s.whole} onChange={set('whole')}/>Process the whole video</label>
      {!s.whole&&<div className="row"><label>From<input value={s.start} onChange={set('start')} placeholder="00:00"/></label><label>To<input value={s.end} onChange={set('end')} placeholder="02:30"/></label></div>}
      <button className="cta sm" onClick={()=>run('Saving settings…',async()=>{await G.saveSettings(p,v,s);setMsg('Settings written to the video sheet')})}>Save settings</button></section></div>
    {msg&&<p className="ok">{msg}</p>}
    <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${v.sheetId}`}>Open record sheet</a>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${v.folderId}`}>Open folder</a></div></main>}

// ---------- requirements: scenes the project needs, read from the Requirements sheet ----------
function Requirements({w,run}){
  const [list,setList]=useState([]),[nm,setNm]=useState(''),[ds,setDs]=useState(''),load=()=>run('Reading requirement sheet…',async()=>setList(await G.listReqs(w)))
  useEffect(()=>{load()},[])
  const add=()=>{if(!nm.trim())return;run('Adding requirement…',async()=>{await G.addReq(w,nm.trim(),ds.trim());setNm('');setDs('');setList(await G.listReqs(w))})}
  const done=list.filter(r=>r.done).length
  return <main className="page"><h2>Required scenes</h2>
    <p className="muted">Read live from the Requirements sheet. Upload a clip (or paste a YouTube link) for each one: it goes to the Scene folder, its length is measured, and the row is ticked ✅.</p>
    <p className="ok">{done} of {list.length} done</p>
    <div className="row"><input value={nm} onChange={e=>setNm(e.target.value)} placeholder="Required scene name"/><input value={ds} onChange={e=>setDs(e.target.value)} placeholder="Description"/><button className="cta sm" onClick={add}>Add requirement</button></div>
    <div className="cards">{list.map(r=><Req key={r.row} r={r} w={w} run={run} reload={load}/>)}</div>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${w.reqSheet}`}>Open requirement sheet</a></main>}

function Req({r,w,run,reload}){
  const [d,setD]=useState(r.desc),[yt,setYt]=useState(''),f=useRef()
  const up=e=>{const x=e.target.files[0];e.target.value='';if(x)run(`Uploading ${x.name}…`,async()=>{await G.fulfilWithFile(w,r,x,d);await reload()})}
  const link=()=>run('Adding link…',async()=>{await G.fulfilWithLink(w,r,yt,d);setYt('');await reload()})
  return <div className={'card'+(r.done?' done':'')}><div><h3>{r.done?'✅ ':''}{r.name}</h3>
    {r.done?<p className="muted">{r.video}{r.len?` · ${G.fmtLen(+r.len)}`:''}{r.link&&<> · <a href={r.link} target="_blank" rel="noreferrer">open</a></>}</p>
    :<><label>Description (saved to the Scene sheet)<textarea rows={3} value={d} onChange={e=>setD(e.target.value)}/></label>
      <input ref={f} type="file" accept="video/*" hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload video</button>
      <div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} placeholder="or YouTube link"/><button className="ghost" onClick={link}>Add</button></div></>}</div></div>}

// ---------- scenes ----------
function Scenes({w,run}){
  const [yt,setYt]=useState(''),[d,setD]=useState(''),[list,setList]=useState([]),f=useRef(),load=()=>run('Loading scenes…',async()=>setList(await G.listScenes(w)))
  useEffect(()=>{load()},[])
  const up=async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadScene(w,x,d));setD('');load()}
  return <main className="page"><h2>Scenes</h2><p className="muted">Video clips or YouTube links. Each gets a row with its length; Processed stays empty until the AI fills it. Type a description now if you have one.</p>
    <input value={d} onChange={e=>setD(e.target.value)} placeholder="Scene description (optional)"/>
    <div className="row"><input ref={f} type="file" multiple accept="video/*" hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload scene videos</button>
    <input value={yt} onChange={e=>setYt(e.target.value)} placeholder="Or paste a YouTube link"/><button className="cta sm" onClick={()=>run('Adding link…',async()=>{await G.addSceneLink(w,yt,d);setYt('');setD('');load()})}>Add link</button></div>
    <table><thead><tr><th>Video name</th><th>Length</th><th>Processed</th><th>Description</th><th>For requirement</th></tr></thead><tbody>
      {list.map((r,i)=><tr key={i}><td>{r.name}</td><td>{G.fmtLen(+r.len)}</td><td>{r.processed}</td><td>{r.desc}</td><td>{r.req}</td></tr>)}</tbody></table>
    <a className="ghost" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${w.sceneSheet}`}>Open scene sheet</a></main>}
