// Builds the Render Map from a finished guided session and sends it to the backend queue (used by Finish and by "send when finished").
import * as G from '../drive.js'
import * as P from '../playlist.js'
import { tailOf, isApproved } from './model.js'

export const canSend = session => session.scenes.length > 0 && session.scenes.every(s => isApproved(s) && !!s.voice?.fileId && !!s.visual?.codeFileId && Number(s.voice?.duration) > 0)

export async function sendToBackend({ session, playlist, row, project, global, onStep = () => {} }) {
  if (!canSend(session)) throw new Error('Approve every narration, voice, and visual before sending the Render Map.')
  onStep('Checking saved scene files...')
  const assets = session.scenes.flatMap(s => [{ id: s.voice.fileId, scene: s.id, kind: 'voice' }, { id: s.visual.codeFileId, scene: s.id, kind: 'visual' }])
  for (const item of assets) {
    let file
    try { file = await G.getFile(item.id) } catch { throw new Error(`Scene ${item.scene} ${item.kind} file is missing or unavailable in Drive. Re-save it, then try again.`) }
    if (file.trashed) throw new Error(`Scene ${item.scene} ${item.kind} file was deleted from Drive. Re-save it, then try again.`)
  }
  let start = 0
  const scenes = session.scenes.map(s => {
    const duration = Number(s.voice.duration), tailSec = tailOf(s), scene = {
      id: s.id, heading: s.heading || `Scene ${s.id}`, narration: s.narration || '', start, tailSec,
      voice: { fileId: s.voice.fileId, name: s.voice.name || `scene_${s.id}.wav`, duration, timeline: s.voice.timeline || [] },
      visual: { engine: 'remotion', fileId: s.visual.codeFileId, name: s.visual.codeName || `scene_${s.id}.v${s.visual.version || 1}.tsx`, version: s.visual.version || 1, durationSec: duration + tailSec },
    }
    start += duration + tailSec
    return scene
  })
  const renderMap = { version: 1, title: session.title, createdAt: new Date().toISOString(), settings: {
    aspect: session.settings.aspect || project?.aspect || '16:9', quality: 'high', fps: 30,
    language: session.settings.language || project?.language || 'en',
    screen_language: session.settings.screen_language || project?.screen_language || session.settings.language || 'en',
    urdu_font: global?.tools?.urdu_font || 'Noto Naskh Arabic',
  }, scenes, captions: true, total: start }
  onStep('Sending Render Map to the backend...')
  const submitted = await P.sendGuidedRenderMap(playlist, row, renderMap)
  return { submitted, renderMap, fileIds: assets.map(x => x.id) }
}
