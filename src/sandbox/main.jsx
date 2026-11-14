import React, { Component, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Player } from '@remotion/player'
import * as Remotion from 'remotion'
import * as Shapes from '@remotion/shapes'
import * as Paths from '@remotion/paths'
import { AbsoluteFill, Audio, Sequence } from 'remotion'
import { transform } from 'sucrase'

class Boundary extends Component {
  state = { error: '' }
  static getDerivedStateFromError(e) { return { error: e.message || String(e) } }
  componentDidCatch(e) { parent.postMessage({ type: 'frame-sandbox-error', error: e.message || String(e) }, '*') }
  render() { return this.state.error ? <pre style={{ color: '#fff', padding: 12, whiteSpace: 'pre-wrap' }}>{this.state.error}</pre> : this.props.children }
}

const compile = code => {
  const output = transform(code, { transforms: ['typescript', 'jsx', 'imports'], production: true }).code
  const module = { exports: {} }
  const require = name => ({ react: React, remotion: Remotion, '@remotion/shapes': Shapes, '@remotion/paths': Paths }[name] || (() => { throw new Error(`Module ${name} is not allowed`) })())
  new Function('require', 'module', 'exports', output)(require, module, module.exports)
  return module.exports.default || module.exports.Scene
}

function VideoComposition({ scenes }) {
  const frame = Remotion.useCurrentFrame(), fps = Remotion.useVideoConfig().fps
  let cursor = 0, active = null
  const sequences = scenes.map(scene => {
    const from = cursor
    cursor += scene.durationInFrames
    if (frame >= from && frame < cursor) active = { scene, localFrame: frame - from }
    return <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames}><scene.Component /><Audio src={scene.audioUrl} /></Sequence>
  })
  const second = active ? active.localFrame / fps : -1
  const caption = active?.scene.timeline.find(x => second >= Number(x.start || 0) && second < Number(x.end || 0))?.text
  return <AbsoluteFill style={{ backgroundColor: '#080b15' }}>{sequences}{caption && <div style={{ position: 'absolute', left: '6%', right: '6%', bottom: '6%', padding: '12px 18px', borderRadius: 8, color: 'white', background: 'rgba(0,0,0,.78)', textAlign: 'center', fontSize: 22, lineHeight: 1.35 }}>{caption}</div>}</AbsoluteFill>
}

function WholePreview({ state }) {
  const player = useRef(null), [frame, setFrame] = useState(0), duration = state.scenes.reduce((n, s) => n + s.durationInFrames, 0)
  useEffect(() => { const timer = setInterval(() => { const n = player.current?.getCurrentFrame(); if (Number.isFinite(n)) setFrame(n) }, 100); return () => clearInterval(timer) }, [])
  let cursor = 0
  const markers = state.scenes.map(scene => { const from = cursor; cursor += scene.durationInFrames; return { ...scene, from } })
  return <div style={{ color: '#fff', padding: 10, font: '14px system-ui' }}>
    <Player ref={player} component={VideoComposition} inputProps={{ scenes: state.scenes }} durationInFrames={duration} compositionWidth={state.width} compositionHeight={state.height} fps={state.fps} controls={false} style={{ width: '100%', aspectRatio: `${state.width}/${state.height}` }} onFrameUpdate={f => setFrame(typeof f === 'number' ? f : f.frame ?? 0)} onError={e => parent.postMessage({ type: 'frame-sandbox-error', error: e.message || String(e) }, '*')} />
    <input aria-label="Whole-video scrubber" type="range" min="0" max={Math.max(0, duration - 1)} value={frame} onChange={e => player.current?.seekTo(+e.target.value)} style={{ width: '100%' }} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{markers.map(s => <button key={s.id} onClick={() => player.current?.seekTo(s.from)} style={{ color: '#fff', background: '#272c42', border: '1px solid #59617e', borderRadius: 5, padding: '5px 8px', cursor: 'pointer' }}>Scene {s.id} - {s.heading}</button>)}</div>
    <div style={{ marginTop: 6, color: '#bac3dc' }}>{(frame / state.fps).toFixed(1)} s / {(duration / state.fps).toFixed(1)} s</div>
  </div>
}


// ---------- studio mode ----------
// ONE player owns picture, sound and the clock. Audio is played by Remotion <Audio> inside each scene's Sequence, so it can never drift from
// the picture (the old preview played a separate <audio> tag next to the player, which slowly drifted apart).
const post = m => parent.postMessage(m, '*')
const dirOf = t => (/[\u0600-\u06FF]/.test(t || '') ? 'rtl' : 'ltr')
function Card({ heading, note }) {
  return <AbsoluteFill style={{ background: 'linear-gradient(145deg,#1d2350,#0e1024)', color: '#fff', alignItems: 'center', justifyContent: 'center', padding: '8%', textAlign: 'center', fontFamily: 'system-ui, "Noto Naskh Arabic", sans-serif' }}>
    <div dir={dirOf(heading)} style={{ fontSize: '7.5cqw', fontWeight: 700, lineHeight: 1.2 }}>{heading}</div>{note && <div style={{ marginTop: 14, opacity: .55, fontSize: '3cqw' }}>{note}</div>}
  </AbsoluteFill>
}
class Guard extends Component {
  state = { error: '' }
  static getDerivedStateFromError(e) { return { error: e.message || String(e) } }
  componentDidCatch(e) { post({ type: 'frame-scene-error', id: this.props.id, error: e.message || String(e) }) }
  render() { return this.state.error ? <Card heading={this.props.heading} note="This visual has an error. Open the scene and press Fix with AI." /> : this.props.children }
}
function StudioComp({ scenes }) {
  const frame = Remotion.useCurrentFrame(), fps = Remotion.useVideoConfig().fps
  let cursor = 0, active = null
  const seqs = scenes.map(sc => {
    const from = cursor; cursor += sc.frames; if (frame >= from && frame < cursor) active = { sc, t: (frame - from) / fps }
    const C = sc.Component
    return <Sequence key={sc.key} from={from} durationInFrames={sc.frames}><Guard id={sc.id} heading={sc.heading}><C /></Guard>{sc.audioUrl && <Audio src={sc.audioUrl} />}</Sequence>
  })
  const cap = active?.sc.timeline?.find(x => active.t >= Number(x.start || 0) && active.t < Number(x.end || 0))?.text
  return <AbsoluteFill style={{ backgroundColor: '#080b15', containerType: 'size' }}>{seqs}{cap && <div dir={dirOf(cap)} style={{ position: 'absolute', left: '6%', right: '6%', bottom: '6%', padding: '.5em .9em', borderRadius: 8, color: '#fff', background: 'rgba(0,0,0,.72)', textAlign: 'center', fontSize: '3.6cqw', lineHeight: 1.35, fontFamily: 'system-ui, "Noto Naskh Arabic", sans-serif' }}>{cap}</div>}</AbsoluteFill>
}
function Studio({ state }) {
  const ref = useRef(null)
  useEffect(() => {
    const p = ref.current; if (!p) return
    let last = -1
    const tick = e => { const f = e.detail.frame; if (f !== last) { last = f; post({ type: 'frame-time', frame: f }) } }
    const on = n => () => post({ type: 'frame-state', playing: n === 'play' })
    const play = on('play'), pause = on('pause'), ended = on('pause')
    p.addEventListener('frameupdate', tick); p.addEventListener('play', play); p.addEventListener('pause', pause); p.addEventListener('ended', ended)
    const cmd = e => {
      if (e.source !== parent) return; const d = e.data || {}
      if (d.type === 'frame-play') { try { p.play() } catch (x) { post({ type: 'frame-sandbox-error', error: x.message }) } }
      if (d.type === 'frame-pause') p.pause()
      if (d.type === 'frame-seek') { p.seekTo(Math.max(0, Math.min(state.total - 1, Math.round(d.frame || 0)))) }
    }
    addEventListener('message', cmd)
    if (state.startFrame) p.seekTo(Math.min(state.total - 1, state.startFrame))
    return () => { p.removeEventListener('frameupdate', tick); p.removeEventListener('play', play); p.removeEventListener('pause', pause); p.removeEventListener('ended', ended); removeEventListener('message', cmd) }
  }, [state])
  return <Player ref={ref} component={StudioComp} inputProps={{ scenes: state.scenes }} durationInFrames={Math.max(1, state.total)} compositionWidth={state.width} compositionHeight={state.height} fps={state.fps} controls={false} clickToPlay doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false} style={{ width: '100%', height: '100%' }} />
}

function Sandbox() {
  const [state, setState] = useState(null)
  useEffect(() => {
    const on = e => {
      if (e.source !== parent) return
      try {
        if (e.data?.type === 'frame-preview') {
          const Component = compile(e.data.tsx), audioUrl = e.data.audioBytes ? URL.createObjectURL(new Blob([e.data.audioBytes], { type: 'audio/wav' })) : ''
          setState({ mode: 'single', scenes: [{ id: 1, key: 'one', heading: '', Component, audioUrl, frames: e.data.durationInFrames, timeline: [] }], total: e.data.durationInFrames, width: e.data.width, height: e.data.height, fps: e.data.fps }); parent.postMessage({ type: 'frame-sandbox-ready' }, '*')
        }
        if (e.data?.type === 'frame-load') {
          const errs = [], scenes = e.data.scenes.map(s => {
            let Component = null
            if (s.tsx) { try { Component = compile(s.tsx) } catch (x) { errs.push({ id: s.id, error: x.message || String(x) }) } }
            if (!Component) Component = () => <Card heading={s.heading} note={s.tsx ? 'This visual has an error.' : 'Visual not made yet'} />
            return { ...s, key: `${s.id}:${s.rev || 0}`, Component, audioUrl: s.audioBytes ? URL.createObjectURL(new Blob([s.audioBytes], { type: 'audio/wav' })) : '' }
          })
          setState(old => { old?.scenes?.forEach(x => x.audioUrl && URL.revokeObjectURL(x.audioUrl)); return { mode: 'studio', scenes, total: scenes.reduce((n, x) => n + x.frames, 0), width: e.data.width, height: e.data.height, fps: e.data.fps || 30, startFrame: e.data.startFrame || 0 } })
          post({ type: 'frame-loaded', errors: errs })
        }
        if (e.data?.type === 'frame-whole-preview') {
          const scenes = e.data.scenes.map(s => ({ ...s, Component: compile(s.tsx), audioUrl: URL.createObjectURL(new Blob([s.audioBytes], { type: 'audio/wav' })) }))
          setState({ ...e.data, scenes }); parent.postMessage({ type: 'frame-whole-ready' }, '*')
        }
      } catch (x) { parent.postMessage({ type: 'frame-sandbox-error', error: x.message || String(x) }, '*') }
    }
    addEventListener('message', on); return () => removeEventListener('message', on)
  }, [])
  useEffect(() => { post({ type: 'frame-sandbox-up' }) }, [])
  if (!state) return <div style={{ color: '#fff', padding: 16 }}>Waiting for scene...</div>
  if (state.mode === 'studio') return <div style={{ position: 'fixed', inset: 0 }}><Boundary><Studio state={state} /></Boundary></div>
  if (state.mode === 'single') return <Boundary><Player component={StudioComp} inputProps={{ scenes: state.scenes }} durationInFrames={state.total} compositionWidth={state.width} compositionHeight={state.height} fps={state.fps} style={{ width: '100%', aspectRatio: `${state.width}/${state.height}` }} controls /></Boundary>
  if (state.scenes) return <Boundary><WholePreview state={state} /></Boundary>
  return null
}

createRoot(document.getElementById('root')).render(<Sandbox />)
