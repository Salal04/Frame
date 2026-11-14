// Shared scene maths: the timeline, the preview and the Render Map must all agree on how long a scene is.
export const FPS = 30
export const wps = lang => (lang === 'ur' ? 2.3 : 2.5)
export const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length
export const sizeOf = aspect => ({ '16:9': [640, 360], '9:16': [360, 640], '1:1': [480, 480], '4:5': [384, 480] }[aspect] || [640, 360])
export const tailOf = s => (Number.isFinite(+s.visual?.tailSec) ? +s.visual.tailSec : .4)
export const hasVoice = s => !!s.voice?.fileId && Number(s.voice?.duration) > 0
// seconds a scene lasts: the real voice if there is one, otherwise an estimate from the words (so the preview works before any voice exists)
export const voiceSec = (s, settings) => (hasVoice(s) ? Number(s.voice.duration) : Math.max(2, words(s.narration) / wps(settings?.language)))
export const sceneFrames = (s, settings) => Math.max(FPS, Math.round((voiceSec(s, settings) + tailOf(s)) * FPS))
export function layout(scenes, settings) {
  let at = 0
  const items = scenes.map(s => { const frames = sceneFrames(s, settings), o = { id: s.id, from: at, frames, end: at + frames, sec: frames / FPS, start: at / FPS, voiceSec: voiceSec(s, settings), real: hasVoice(s) }; at += frames; return o })
  return { items, frames: at, sec: at / FPS }
}
export const sceneAtFrame = (lay, frame) => lay.items.find(x => frame >= x.from && frame < x.end) || lay.items.at(-1)
export const isApproved = s => s.narrationStatus !== 'stale' && s.voice?.status === 'approved' && s.visual?.status === 'approved'
export const staleVisual = v => (v?.codeFileId || v?.status === 'approved' ? { ...v, status: 'stale' } : v)
export const pad = id => String(id).padStart(2, '0')
export const blankScene = id => ({ id, heading: `Scene ${id}`, idea: '', narration: '', locked: false, narrationStatus: 'draft', voice: { status: 'none', fileId: '', duration: 0, timeline: [], take: 0, voice: '', style: '' }, visual: { status: 'none', engine: 'remotion', steps: [], visuals: [], codeFileId: '', version: 0, durationSec: 0, tailSec: .4, clipFileId: '', error: '' }, notes: [], history: [] })
export const fmtTime = sec => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}` }
