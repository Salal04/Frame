// Untouched screens from the first version of Frame AI (Requirements, Scenes, global asset upload, confirm dialog).
import {useState,useEffect,useRef} from 'react'
import * as G from './drive.js'

export function Confirm({title,text,yes,onYes,onNo}){return <div className="modal"><div className="box"><h3>{title}</h3><p>{text}</p>
  <div className="row"><button className="ghost" onClick={onNo}>Keep it</button><button className="cta sm red" onClick={onYes}>{yes}</button></div></div></div>}

export function GlobalAssets({p,run}){
  const [files,setFiles]=useState([]),load=()=>run('Loading assets…',async()=>setFiles(await G.listGlobal(p)))
  useEffect(()=>{load()},[])
  const up=cat=>async e=>{const fs=[...e.target.files];e.target.value='';for(const x of fs)await run(`Uploading ${x.name}…`,()=>G.uploadGlobal(p,cat,x));load()}
  return <section><p className="muted">Uploaded once, used by every video of this project.</p><div className="cards">
    {G.GLOBAL.map(([cat,hint,acc])=><div className="card" key={cat}><div><h3>{cat.replace('-',' & ')}</h3><p className="muted">{hint}</p>
      {files.filter(f=>f.cat===cat).map((f,i)=><small key={i}><a href={f.link} target="_blank" rel="noreferrer">{f.name}</a><br/></small>)}</div>
      <label className="ghost">Upload<input type="file" multiple hidden accept={acc} onChange={up(cat)}/></label></div>)}</div></section>}

export function Requirements({w,run}){
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

export function Req({r,w,run,reload}){
  const [d,setD]=useState(r.desc),[yt,setYt]=useState(''),f=useRef()
  const up=e=>{const x=e.target.files[0];e.target.value='';if(x)run(`Uploading ${x.name}…`,async()=>{await G.fulfilWithFile(w,r,x,d);await reload()})}
  const link=()=>run('Adding link…',async()=>{await G.fulfilWithLink(w,r,yt,d);setYt('');await reload()})
  return <div className={'card'+(r.done?' done':'')}><div><h3>{r.done?'✅ ':''}{r.name}</h3>
    {r.done?<p className="muted">{r.video}{r.len?` · ${G.fmtLen(+r.len)}`:''}{r.link&&<> · <a href={r.link} target="_blank" rel="noreferrer">open</a></>}</p>
    :<><label>Description (saved to the Scene sheet)<textarea rows={3} value={d} onChange={e=>setD(e.target.value)}/></label>
      <input ref={f} type="file" accept="video/*" hidden onChange={up}/><button className="cta sm" onClick={()=>f.current.click()}>Upload video</button>
      <div className="row"><input value={yt} onChange={e=>setYt(e.target.value)} placeholder="or YouTube link"/><button className="ghost" onClick={link}>Add</button></div></>}</div></div>}

export function Scenes({w,run}){
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

