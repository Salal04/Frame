import { useEffect, useRef, useState } from 'react'
import { clock, logText } from './log.js'

const COLOR = { error: '#e5484d', warn: '#d98e04', ok: '#2f9e5b', info: 'inherit' }
const MARK = { error: '✗', warn: '!', ok: '✓', info: '·' }

// Every step the studio takes, with the time, the scene, and (for problems) what to do. Kept in this browser, so it survives a refresh.
export default function LogPanel({ logs, scenes, onClear }) {
  const [open, setOpen] = useState(false), [bad, setBad] = useState(false), [copied, setCopied] = useState(false), box = useRef(null)
  const num = id => scenes.findIndex(s => s.id === id) + 1
  const errors = logs.filter(l => l.level === 'error').length, shown = bad ? logs.filter(l => l.level === 'error' || l.level === 'warn') : logs, last = logs.at(-1)
  useEffect(() => { if (open && box.current) box.current.scrollTop = box.current.scrollHeight }, [logs.length, open, bad])
  const copy = async () => { try { await navigator.clipboard.writeText(logText(logs, num)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the download button still works */ } }
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([logText(logs, num)], { type: 'text/plain' })); a.download = `frame-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
  return <details className="panel gs-log" open={open} onToggle={e => setOpen(e.currentTarget.open)} style={{ marginTop: 14 }}>
    <summary style={{ cursor: 'pointer' }}><b>Activity log</b> <small className="muted">{logs.length} lines</small>{errors > 0 && <b style={{ color: COLOR.error, marginLeft: 8 }}>{errors} error{errors > 1 ? 's' : ''}</b>}
      {!open && last && <small style={{ marginLeft: 10, color: COLOR[last.level] }}>{clock(last.t)} {last.msg.slice(0, 90)}</small>}</summary>
    <div className="row tight" style={{ margin: '8px 0' }}>
      <label className="chk"><input type="checkbox" checked={bad} onChange={e => setBad(e.target.checked)} /> Only problems</label><span className="gs-sp" />
      <button className="ghost sm" disabled={!logs.length} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      <button className="ghost sm" disabled={!logs.length} onClick={download}>Download .txt</button>
      <button className="ghost sm" disabled={!logs.length} onClick={() => confirm('Clear the log?') && onClear()}>Clear</button>
    </div>
    <div ref={box} style={{ maxHeight: 260, overflow: 'auto', font: '12.5px/1.55 ui-monospace, Menlo, Consolas, monospace', padding: '6px 8px', borderRadius: 8, background: 'var(--bg)', boxShadow: 'var(--in)' }}>
      {shown.length ? shown.map((l, i) => <div key={i} style={{ color: COLOR[l.level], fontWeight: l.level === 'error' ? 600 : 400, wordBreak: 'break-word' }}>
        <span style={{ opacity: .6 }}>{clock(l.t)}</span> {MARK[l.level]} {l.scene != null && num(l.scene) ? <b>[scene {num(l.scene)}] </b> : null}{l.msg}</div>) : <span className="muted">{bad ? 'No problems so far.' : 'Nothing yet. Every step will be written here.'}</span>}
    </div>
    <small className="muted">Saved in this browser. If something goes wrong, press Copy and send the text.</small>
  </details>
}
