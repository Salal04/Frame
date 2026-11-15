import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Copy to clipboard (works on http pages and older browsers too)
export const copyText = async text => {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall back below */ }
  try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok } catch { return false }
}
export function CopyButton({ text, label = 'Copy' }) {
  const [state, setState] = useState('')
  return <button className="ghost sm" disabled={!text} onClick={async () => { setState((await copyText(text)) ? 'ok' : 'bad'); setTimeout(() => setState(''), 1800) }}>{state === 'ok' ? '✓ Copied' : state === 'bad' ? 'Copy failed' : `⧉ ${label}`}</button>
}

// Full-screen reading view: the page behind is blurred, only this card is sharp. Esc or a click outside closes it.
export function FocusModal({ title, onClose, actions, footer, rtl, children }) {
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') onClose() }, prev = document.body.style.overflow
    addEventListener('keydown', key); document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [onClose])
  return createPortal(
    <div className="gs-focus" role="dialog" aria-modal="true" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="gs-focus-card">
        <header><h2>{title}</h2><span className="gs-sp" />{actions}<button className="ghost sm" onClick={onClose}>✕ Close (Esc)</button></header>
        <div className="gs-focus-body" dir={rtl ? 'rtl' : 'ltr'}>{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>, document.body)
}

const line = x => (typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x))
// Everything the planner decided about this scene's picture, as plain text (for reading and copying)
export const visualText = scene => {
  const v = scene?.visual || {}, out = []
  if (scene?.heading) out.push(`Scene: ${line(scene.heading)}`)
  if (scene?.idea) out.push(`Picture idea: ${line(scene.idea)}`)
  if (v.bigIdea) out.push(`Big idea: ${line(v.bigIdea)}`)
  if (v.metaphor) out.push(`Metaphor: ${line(v.metaphor)}`)
  if (v.visuals?.length) out.push('Visuals:\n' + v.visuals.map(x => `• ${x?.type ? `${x.type}: ` : ''}${line(x?.description ?? x)}`).join('\n'))
  if (v.steps?.length) out.push('Animation steps (in time with the voice):\n' + v.steps.map((x, i) => `${i + 1}. ${x?.at_sec != null ? `[${(+x.at_sec).toFixed(1)} s] ` : ''}${line(x?.action ?? x)}`).join('\n'))
  return out.join('\n\n')
}
