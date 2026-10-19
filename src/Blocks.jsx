import { useState, useEffect, useRef } from 'react'

// Small collapsible blocks. Open one, change things, press "Save & next": that block is saved and the next one opens.
// items: [{ id, title, note?, body, noSave? }]   save(id) must resolve true when saving worked.
// stamp: any value that changes when the user edits something (clears the "Saved" ticks).
// start (optional): id of the block that is open first; null = everything starts closed. Default: the first block.
// ctl (optional): [{ open, done }, setState] when the parent keeps the open block, so it survives a re-mount.
export default function Blocks({ items, save, stamp, ctl, start }) {
  const own = useState({ open: undefined, done: {} }), [st, setSt] = ctl || own, [busy, setBusy] = useState(false), first = useRef(true)
  const open = st.open === undefined ? (start === undefined ? items[0]?.id : start) : st.open, done = st.done || {}
  useEffect(() => { if (first.current) { first.current = false; return } setSt(s => ({ ...s, done: {} })) }, [stamp])
  const ids = items.map(i => i.id)
  const next = id => {
    const n = items[ids.indexOf(id) + 1]; setSt(s => ({ ...s, open: n ? n.id : null }))
    if (n) setTimeout(() => document.getElementById('blk-' + n.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
  }
  const go = async (it, move) => {
    if (!it.noSave) { setBusy(true); const ok = await save(it.id); setBusy(false); if (!ok) return; setSt(s => ({ ...s, done: { ...(s.done || {}), [it.id]: true } })) }
    if (move) next(it.id)
  }
  return <div className="blocks">{items.map((it, i) => {
    const on = open === it.id, last = i === items.length - 1
    return <section key={it.id} id={'blk-' + it.id} className={'blk' + (on ? ' open' : '')}>
      <button className="blk-head" aria-expanded={on} onClick={() => { setSt(s => ({ ...s, open: on ? null : it.id })); if (!on) setTimeout(() => document.getElementById('blk-' + it.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60) }}>
        <b>{it.title}</b>{done[it.id] ? <small className="ok">Saved ✓</small> : it.note && <small className="muted">{it.note}</small>}<span className="blk-arrow" aria-hidden="true">▾</span>
      </button>
      {on && <div className="blk-body">{it.body}
        <div className="row tight">
          {it.noSave
            ? !last && <button className="cta sm" onClick={() => go(it, true)}>Next →</button>
            : <>{!last && <button className="cta sm" disabled={busy} onClick={() => go(it, true)}>Save &amp; next →</button>}
              <button className={last ? 'cta sm' : 'ghost sm'} disabled={busy} onClick={() => go(it, false)}>{last ? 'Save' : 'Save only'}</button></>}
        </div></div>}
    </section>
  })}</div>
}

// One collapsible section with no Save of its own (its content has its own buttons).
export function Fold({ title, note, children, open = false }) {
  const [on, setOn] = useState(open)
  return <section className={'blk' + (on ? ' open' : '')} style={{ margin: '12px 0' }}>
    <button className="blk-head" aria-expanded={on} onClick={() => setOn(!on)}><b>{title}</b>{note && <small className="muted">{note}</small>}<span className="blk-arrow" aria-hidden="true">▾</span></button>
    {on && <div className="blk-body">{children}</div>}
  </section>
}
