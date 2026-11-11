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

function Sandbox() {
  const [state, setState] = useState(null), audio = useRef(null)
  useEffect(() => {
    const on = e => {
      if (e.source !== parent) return
      try {
        if (e.data?.type === 'frame-preview') {
          const next = { ...e.data, Scene: compile(e.data.tsx) }
          if (next.audioBytes) next.audioUrl = URL.createObjectURL(new Blob([next.audioBytes], { type: 'audio/wav' }))
          setState(next); parent.postMessage({ type: 'frame-sandbox-ready' }, '*')
        }
        if (e.data?.type === 'frame-whole-preview') {
          const scenes = e.data.scenes.map(s => ({ ...s, Component: compile(s.tsx), audioUrl: URL.createObjectURL(new Blob([s.audioBytes], { type: 'audio/wav' })) }))
          setState({ ...e.data, scenes }); parent.postMessage({ type: 'frame-whole-ready' }, '*')
        }
      } catch (x) { parent.postMessage({ type: 'frame-sandbox-error', error: x.message || String(x) }, '*') }
    }
    addEventListener('message', on); return () => removeEventListener('message', on)
  }, [])
  if (!state) return <div style={{ color: '#fff', padding: 16 }}>Waiting for scene...</div>
  if (state.scenes) return <Boundary><WholePreview state={state} /></Boundary>
  const { Scene, width, height, fps, durationInFrames, audioUrl } = state
  return <Boundary><Player component={Scene} durationInFrames={durationInFrames} compositionWidth={width} compositionHeight={height} fps={fps} style={{ width: '100%', aspectRatio: `${width}/${height}` }} controls onPlay={() => audio.current?.play()} onPause={() => audio.current?.pause()} onSeek={e => { if (audio.current) audio.current.currentTime = e.detail.frame / fps }} />{audioUrl && <audio ref={audio} src={audioUrl} />}</Boundary>
}

createRoot(document.getElementById('root')).render(<Sandbox />)
