import { useRef, useState } from 'react'
import { fetchAsset } from '../session.js'
import { validateTsx } from '../engine/visual.js'

const sizeOf = aspect => ({ '16:9': [640, 360], '9:16': [360, 640], '1:1': [480, 480], '4:5': [384, 480] }[aspect] || [640, 360])

export default function WholeVideoPreview({ session }) {
  const frame = useRef(null), sandboxLoaded = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [open, setOpen] = useState(false), [skipped, setSkipped] = useState([])
  const preview = async () => {
    setBusy(true); setError(''); setSkipped([]); if (!open) sandboxLoaded.current = false; setOpen(true)
    try {
      const candidates = [], omitted = []
      for (const scene of session.scenes) {
        const voiceOk = scene.voice?.status === 'approved' && scene.voice?.fileId && Number(scene.voice.duration) > 0
        const visualOk = scene.visual?.status === 'approved' && scene.visual?.codeFileId
        if (!voiceOk || !visualOk) { omitted.push({ id: scene.id, heading: scene.heading, reason: !voiceOk ? `voice ${scene.voice?.status || 'missing'}` : `visual ${scene.visual?.status || 'missing'}` }); continue }
        try {
          const [codeBlob, audioBlob] = await Promise.all([fetchAsset(scene.visual.codeFileId), fetchAsset(scene.voice.fileId)])
          const tsx = await codeBlob.text(), invalid = validateTsx(tsx)
          if (invalid) throw new Error(invalid)
          const durationInFrames = Math.max(30, Math.round((Number(scene.voice.duration) + Number(scene.visual.tailSec || 0)) * 30))
          candidates.push({ id: scene.id, heading: scene.heading || `Scene ${scene.id}`, tsx, audioBytes: await audioBlob.arrayBuffer(), durationInFrames, timeline: scene.voice.timeline || [] })
        } catch (e) { omitted.push({ id: scene.id, heading: scene.heading, reason: e.message || 'Could not load scene assets' }) }
      }
      setSkipped(omitted)
      if (!candidates.length) throw new Error('No approved scenes with available voice and visual files are ready to preview.')
      const [width, height] = sizeOf(session.settings.aspect)
      await new Promise((resolve, reject) => { const started = Date.now(), timer = setInterval(() => { if (sandboxLoaded.current && frame.current?.contentWindow) { clearInterval(timer); resolve() } else if (Date.now() - started > 15000) { clearInterval(timer); reject(new Error('The preview sandbox did not load. Reload the page and try again.')) } }, 50) })
      const waitReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { removeEventListener('message', onMessage); reject(new Error('The preview sandbox did not respond. Reload the page and try again.')) }, 15000)
        const onMessage = e => { if (e.source !== frame.current?.contentWindow) return; if (e.data?.type === 'frame-sandbox-error') { clearTimeout(timer); removeEventListener('message', onMessage); reject(new Error(e.data.error)) } if (e.data?.type === 'frame-whole-ready') { clearTimeout(timer); removeEventListener('message', onMessage); resolve() } }
        addEventListener('message', onMessage)
      })
      const send = () => { if (!frame.current?.contentWindow) return false; const transfers = candidates.map(x => x.audioBytes); frame.current.contentWindow.postMessage({ type: 'frame-whole-preview', scenes: candidates, width, height, fps: 30 }, '*', transfers); return true }
      if (!send()) throw new Error('The preview sandbox is not ready.')
      await waitReady
    } catch (e) { setError(e.message); if (!skipped.length) setOpen(false) } finally { setBusy(false) }
  }
  return <section className="panel"><h3>Whole-video draft preview</h3><p className="hint">Draft preview. The final video is rendered later by the backend and will look sharper.</p>
    <button className="cta sm" disabled={busy || session.scenes.length === 0} onClick={preview}>{busy ? 'Preparing preview...' : 'Preview whole video'}</button>
    {!!skipped.length && <div className="note"><b>Skipped scenes</b><ul>{skipped.map(x => <li key={x.id}>{x.heading || `Scene ${x.id}`}: {x.reason}</li>)}</ul></div>}
    {error && <p className="err">{error}</p>}
    {open && <div style={{ marginTop: 12 }}><button className="ghost sm" onClick={() => setOpen(false)}>Close preview</button><iframe ref={frame} title="Whole-video draft preview" src="/sandbox.html" sandbox="allow-scripts" onLoad={() => { sandboxLoaded.current = true }} style={{ display: 'block', width: '100%', border: 0, minHeight: 500, background: '#0e1024', marginTop: 8 }} /></div>}
  </section>
}
