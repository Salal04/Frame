import { useState, useRef } from 'react'
import { Fold } from './Blocks.jsx'
import * as P from './playlist.js'
import * as G from './drive.js'
import { parseScenes, stringifyScenes, parseSceneText, newScene, SCENE_ACCEPT, SCENE_ENGINES, MAX_SCENES, MAX_SCENE_TEXT } from './config.js'

const TEXT_ACCEPT = '.txt,.md,.srt,.pdf,.docx,.doc,.rtf,.odt'
const snip = (t, n = 90) => { const s = (t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s }

// Short summary for the block header: "12 scenes, 3 with your own file".
export const sceneNote = s => {
  const a = parseScenes(s), f = a.filter(x => x.mode === 'file').length
  return a.length ? `${a.length} scene${a.length > 1 ? 's' : ''}${f ? `, ${f} with your own file` : ''}` : 'none yet'
}

// "Add a video" form: scene descriptions typed, pasted or read from a text file. The list is shown straight away.
export function SceneDraft({ text, onText, run }) {
  const f = useRef(), list = parseSceneText(text)
  const pick = ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) run('Reading the scene descriptions…', async () => onText(await G.readTextFile(x))) }
  return <Fold title="Scene descriptions (optional)" note={list.length ? `${list.length} scene${list.length > 1 ? 's' : ''} found` : ''} open={!!(text || '').trim()}><div className="srcopts">
    <label>Describe the scenes<textarea rows={6} value={text || ''} onChange={e => onText(e.target.value)}
      placeholder={'Scene 1: Title card\nA blue circle grows in the centre while the title fades in.\n\nScene 2: The formula\nShow the formula line by line, highlight the last term.'} />
      <small className="hint">One block per scene. “Scene 1:”, “Scene 2:” headings, numbered lines or blank lines between scenes all work. {(text || '').length.toLocaleString()} characters.</small></label>
    <div className="row tight"><input ref={f} type="file" accept={TEXT_ACCEPT} hidden onChange={pick} /><button type="button" className="ghost sm" onClick={() => f.current.click()}>Upload scene file (.txt, .docx, .pdf …)</button></div>
    {list.length > 0 && <ol className="muted">{list.map((s, i) => <li key={s.id}><b>{s.title || `Scene ${i + 1}`}</b>{s.description ? ': ' + snip(s.description) : ''}</li>)}</ol>}
    <small className="hint">After the video is added, open it and go to Scenes. There you can edit every scene and upload your own Manim or Remotion file for any of them.</small>
  </div></Fold>
}

// Inside one video: the full scene list. Per scene: leave it to Frame, or use the user's own file.
export default function Scenes({ e, setE, p, run, reload, locked }) {
  const [list, setList] = useState(() => parseScenes(e.scenes)), [txt, setTxt] = useState(''), [imp, setImp] = useState(false)
  const tf = useRef(), tx = useRef(), tgt = useRef(null)
  const commit = (next, extra = {}) => { setList(next); setE(c => ({ ...c, ...extra, scenes: stringifyScenes(next) })) }
  const patch = (id, o) => commit(list.map(s => s.id === id ? { ...s, ...o } : s))
  const move = (i, d) => { const n = [...list], j = i + d; if (j < 0 || j >= n.length) return;[n[i], n[j]] = [n[j], n[i]]; commit(n) }
  const add = () => { if (list.length < MAX_SCENES) commit([...list, newScene()]) }
  const readText = mode => { const a = parseSceneText(txt); if (!a.length) return; commit(mode === 'replace' ? a : [...list, ...a].slice(0, MAX_SCENES)); setTxt(''); setImp(false) }
  const pickText = ev => { const x = ev.target.files[0]; ev.target.value = ''; if (x) run('Reading the scene descriptions…', async () => { setTxt(await G.readTextFile(x)); setImp(true) }) }
  const ask = id => { tgt.current = id; tf.current.click() }
  const pickFile = ev => {
    const x = ev.target.files[0]; ev.target.value = ''; const id = tgt.current, i = list.findIndex(s => s.id === id)
    if (!x || i < 0) return
    run('Uploading the scene file…', async () => {
      const { ids, file } = await P.uploadSceneFile(p, e, x, i + 1)
      const next = list.map(s => s.id === id ? { ...s, ...file, mode: 'file' } : s)
      commit(next, ids)                                                      // keep the new folder ids in this editor, or the next save would make a second folder
      await P.saveVideo(p, { ...e, ...ids, scenes: stringifyScenes(next) }); await reload()
    })
  }
  const nFile = list.filter(s => s.mode === 'file').length
  const parsed = parseSceneText(txt).length

  return <div className="scenes">
    <input ref={tf} type="file" accept={SCENE_ACCEPT} hidden onChange={pickFile} />
    <input ref={tx} type="file" accept={TEXT_ACCEPT} hidden onChange={pickText} />
    {locked && <p className="muted">🔒 The backend has taken this video, so the scenes can no longer be changed here.</p>}
    <p className="hint">{list.length
      ? <><b>{list.length}</b> scene{list.length > 1 ? 's' : ''}: <b>{list.length - nFile}</b> built by Frame from the description, <b>{nFile}</b> use your own file. Text changes are saved with the Save button of this section; an uploaded file saves by itself.</>
      : 'No scenes yet. Without a list Frame plans the scenes itself. Add scene descriptions below, or add scenes one by one.'}</p>

    <div className="row tight">
      <button className="ghost sm" disabled={locked} onClick={() => setImp(!imp)}>{imp ? 'Close' : 'Paste or upload scene descriptions'}</button>
      <button className="ghost sm" disabled={locked || list.length >= MAX_SCENES} onClick={add}>Add one scene</button>
    </div>
    {imp && <div className="panel">
      <label>Scene descriptions<textarea rows={7} value={txt} onChange={ev => setTxt(ev.target.value)} placeholder={'Scene 1: Title card\nA blue circle grows in the centre.\n\nScene 2: The formula\nShow it line by line.'} />
        <small className="hint">{parsed ? `${parsed} scene${parsed > 1 ? 's' : ''} found in this text.` : 'Nothing found yet.'} “Scene 1:” headings, numbered lines or blank lines between scenes all work.</small></label>
      <div className="row tight"><button className="ghost sm" onClick={() => tx.current.click()}>Upload text file</button>
        <button className="cta sm" disabled={!parsed} onClick={() => readText(list.length ? 'append' : 'replace')}>{list.length ? 'Add these to the list' : 'Make the scene list'}</button>
        {list.length > 0 && <button className="ghost danger sm" disabled={!parsed} onClick={() => readText('replace')}>Replace the list</button>}</div>
      {list.length > 0 && <small className="hint">Replace removes the current list, including which scene uses which file. The uploaded files stay in the video's Drive folder.</small>}
    </div>}

    {list.map((s, i) => <div className="panel scene" key={s.id}>
      <div className="row tight"><b>Scene {i + 1}</b>
        <input value={s.title} maxLength={120} disabled={locked} onChange={ev => patch(s.id, { title: ev.target.value })} placeholder="Short title (optional)" />
        <button className="ghost sm" disabled={locked || i === 0} onClick={() => move(i, -1)}>Up</button>
        <button className="ghost sm" disabled={locked || i === list.length - 1} onClick={() => move(i, 1)}>Down</button>
        <button className="ghost danger sm" disabled={locked} onClick={() => commit(list.filter(x => x.id !== s.id))}>Remove</button></div>
      <textarea rows={3} maxLength={MAX_SCENE_TEXT} value={s.description} disabled={locked} onChange={ev => patch(s.id, { description: ev.target.value })}
        placeholder={s.mode === 'file' ? 'Optional note about this scene (your file is used as it is).' : 'What should happen in this scene?'} />
      <div className="seg tabs">
        <button type="button" className={s.mode !== 'file' ? 'on' : ''} disabled={locked} onClick={() => patch(s.id, { mode: 'auto' })}>Frame builds it</button>
        <button type="button" className={s.mode === 'file' ? 'on' : ''} disabled={locked} onClick={() => s.fileId || s.url ? patch(s.id, { mode: 'file' }) : ask(s.id)}>I upload the file</button></div>
      {s.mode === 'file'
        ? <div className="row tight">
          <small className="muted">{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name || 'scene file'}</a> : (s.name || 'scene file')} is used for this scene as it is.</small>
          <select value={s.engine} disabled={locked} onChange={ev => patch(s.id, { engine: ev.target.value })}>{SCENE_ENGINES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="ghost sm" disabled={locked} onClick={() => ask(s.id)}>Replace file</button>
          <button className="ghost sm" disabled={locked} onClick={() => patch(s.id, { mode: 'auto', fileId: '', url: '', name: '', engine: '' })}>Remove file</button></div>
        : <small className="hint">Frame writes the code for this scene from the description{s.fileId || s.url ? ' (the file you uploaded earlier is not used)' : ''}.</small>}
    </div>)}
  </div>
}
