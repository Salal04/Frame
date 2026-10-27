import { useState, useEffect } from 'react'
import './prompts.css'

// Prompt library: write a prompt once with [Field] brackets, fill the fields, copy it. Saved in this browser.
const KEY = 'frame.prompts.v1'
const FIELD = /\[([^\[\]\n]{1,40})\]/g
const names = t => { const o = []; for (const m of String(t || '').matchAll(FIELD)) if (!o.includes(m[1])) o.push(m[1]); return o }
const fill = (tpl, vals) => String(tpl || '').replace(FIELD, (a, n) => ((vals || {})[n] || '').trim() || a)
const big = n => /notes|details|instruction/i.test(n)
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

const STARTER = {
  id: 'starter', title: 'Frame AI: script.txt + scenes.txt', vals: {},
  tpl: `You are a scriptwriter and storyboard designer for Frame AI, an app that turns a script file plus a scene file into an animated explainer video. I will paste your output into two files: script.txt and scenes.txt. Follow the rules exactly.

## MY INPUT
- Topic: [Topic]
- Length: [Minutes] minutes
- Narration language: [Narration Language]
- On-screen text language: [Screen Text Language]
- Audience: [Audience]
- Extra notes: [Extra Notes]

## OUTPUT 1: script.txt
- Pure narration only, exactly as it will be spoken aloud.
- Plain text: no markdown, no timestamps, no stage directions, no sound cues, no speaker labels, no notes, no title line.
- Short, clear sentences written to be heard, not read.
- Length: about 150 words per minute for English, about 130 words per minute for Urdu.
- Structure: strong hook, explanation in logical order, one example or analogy, short recap at the end.
- Urdu narration must be written in Urdu script. Keep technical terms consistent.
- Must be under 49,000 characters.
- Be factually accurate. Do not invent facts, numbers or dates; keep unsure parts general.

## OUTPUT 2: scenes.txt
Use exactly this format, one block per scene, in the same order as the narration:

Scene 1: Short title
What appears and moves on screen, described visually and concretely.

Scene 2: Short title
What appears and moves on screen...

Rules:
- Number of scenes = (minutes x 60) / 15, rounded. Never more than 200.
- Each description is 2 to 4 sentences (hard limit 4,000 characters).
- Describe only what is SEEN: shapes, labels, charts, timelines, counters, cards, arrows, highlights, transitions. Do not copy the narration. No voice-over text, no camera jargon, no real photos (the app draws animations).
- Put exact on-screen text in quotes when it matters, written in the on-screen text language.
- Optional engine hint inside a description: Remotion style for text, cards, flows, timelines, charts, Urdu text; Manim style only for real maths, graphs, geometry. If unsure, add no hint.
- Scene 1 is the hook, the last scene is the recap. Vary the layout between scenes.
- Every scene must match the part of the script it illustrates, in the same order.

## FORMAT OF YOUR ANSWER
Give exactly two code blocks and nothing else (no introduction, no explanation):
1. First block labelled script.txt
2. Second block labelled scenes.txt

Before answering, silently check: script length matches the minutes, script is under 49,000 characters, scene count is correct, scenes follow the narration order.

Start now with the topic: [Topic]`,
}

const load = () => {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.items) && s.items.length) return s } catch { /* storage empty or blocked */ }
  return { items: [STARTER], active: STARTER.id }
}

export default function Prompts() {
  const [st, setSt] = useState(load), [edit, setEdit] = useState(null), [arm, setArm] = useState(false), [msg, setMsg] = useState('')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* storage blocked */ } }, [st])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 1800); return () => clearTimeout(t) }, [msg])

  const it = st.items.find(i => i.id === st.active) || st.items[0]
  const patch = (id, o) => setSt(s => ({ ...s, items: s.items.map(i => i.id === id ? { ...i, ...o } : i) }))
  const pick = id => { setSt(s => ({ ...s, active: id })); setEdit(null); setArm(false) }
  const add = () => { const n = { id: uid(), title: 'New prompt', tpl: 'Write about [Topic] for [Audience].', vals: {} }; setSt(s => ({ items: [...s.items, n], active: n.id })); setEdit({ title: n.title, tpl: n.tpl }); setArm(false) }
  const dup = () => { const n = { ...it, id: uid(), title: (it.title || 'Untitled') + ' copy', vals: { ...it.vals } }; setSt(s => ({ items: [...s.items, n], active: n.id })); setMsg('Duplicated') }
  const save = () => {
    if (!edit.tpl.trim()) return setMsg('Write some prompt text first')
    const keep = {}; names(edit.tpl).forEach(n => { if (it.vals?.[n]) keep[n] = it.vals[n] })
    patch(it.id, { title: edit.title.trim() || 'Untitled', tpl: edit.tpl, vals: keep }); setEdit(null); setMsg('Saved')
  }
  const remove = () => {
    if (st.items.length < 2) return setMsg('Keep at least one prompt')
    if (!arm) return setArm(true)
    const rest = st.items.filter(i => i.id !== it.id); setSt({ items: rest, active: rest[0].id }); setEdit(null); setArm(false); setMsg('Deleted')
  }
  const restore = () => setSt(s => ({ items: s.items.some(i => i.id === STARTER.id) ? s.items.map(i => i.id === STARTER.id ? STARTER : i) : [STARTER, ...s.items], active: STARTER.id })) || setEdit(null)
  const out = fill(it.tpl, it.vals)
  const copy = async () => {
    try { await navigator.clipboard.writeText(out); setMsg('Copied') }
    catch { const a = document.createElement('textarea'); a.value = out; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); let ok = false; try { ok = document.execCommand('copy') } catch { /* no clipboard */ } a.remove(); setMsg(ok ? 'Copied' : 'Copy failed. Select the text and copy it by hand.') }
  }

  return <main className="page"><h2>Prompts</h2>
    <p className="muted">Fill the brackets, copy the prompt, paste it into Claude or ChatGPT. Your own prompts are saved in this browser.</p>
    <div className="pr-grid">
      <aside className="card pr-side">
        <h3>My prompts</h3>
        <div className="pr-list">{st.items.map(p => <button key={p.id} className={'pr-item' + (p.id === it.id ? ' on' : '')} onClick={() => pick(p.id)}>
          {p.title || 'Untitled'}<small>{names(p.tpl).length} fields</small></button>)}</div>
        <button className="cta sm" onClick={add}>New prompt</button>
        <button className="ghost sm" onClick={restore}>Restore starter prompt</button>
      </aside>

      <section className="card pr-main">
        {edit ? <>
          <h3 style={{ margin: 0 }}>Edit prompt</h3>
          <label>Title<input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Name of this prompt" /></label>
          <label>Prompt text<textarea className="pr-tpl" rows={14} value={edit.tpl} onChange={e => setEdit({ ...edit, tpl: e.target.value })}
            placeholder="Write your prompt. Put anything you fill later in square brackets, like [Topic] or [Audience]." /></label>
          <div className="pr-tags">{names(edit.tpl).length ? names(edit.tpl).map(n => <span key={n} className="pr-tag">{n}</span>) : <small className="muted">No fields yet. Add one like [Topic].</small>}</div>
          <div className="row tight"><button className="cta sm" onClick={save}>Save prompt</button>
            <button className="ghost" onClick={() => { setEdit(null); setArm(false) }}>Cancel</button>
            <button className="ghost danger" onClick={remove}>{arm ? 'Click again to delete' : 'Delete'}</button></div>
        </> : <>
          <div className="pr-head"><h3 style={{ margin: 0 }}>{it.title || 'Untitled'}</h3>
            <button className="ghost sm" onClick={() => setEdit({ title: it.title, tpl: it.tpl })}>Edit prompt</button></div>
          {names(it.tpl).length > 0
            ? <div className="pr-fields">{names(it.tpl).map(n => <label key={n}>{n}
              {big(n) ? <textarea rows={2} value={it.vals?.[n] || ''} placeholder={n} onChange={e => patch(it.id, { vals: { ...it.vals, [n]: e.target.value } })} />
                : <input value={it.vals?.[n] || ''} placeholder={n} onChange={e => patch(it.id, { vals: { ...it.vals, [n]: e.target.value } })} />}</label>)}</div>
            : <p className="muted">This prompt has no [Field] brackets yet. Press Edit prompt and add one like [Topic].</p>}
          <label>Ready prompt<textarea className="pr-out" rows={12} readOnly value={out} /></label>
          <small className="hint">Empty fields stay as [Field] in the text.</small>
          <div className="row tight"><button className="cta" onClick={copy}>Copy prompt</button>
            <button className="ghost" onClick={dup}>Duplicate</button>
            <button className="ghost" onClick={() => patch(it.id, { vals: {} })}>Clear fields</button></div>
        </>}
      </section>
    </div>
    <div className={'pr-toast' + (msg ? ' show' : '')} role="status">{msg}</div>
  </main>
}
