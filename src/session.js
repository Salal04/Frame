import * as G from './drive.js'

const MIME = 'application/json', cache = new Map()
export class SessionConflict extends Error { constructor() { super('This guided session was changed in another tab. Reload it or overwrite it deliberately.'); this.name = 'SessionConflict' } }
const stamp = () => new Date().toISOString()
export const blankSession = (row, cfg = {}) => ({ version: 1, rev: 0, savedAt: stamp(), mode: 'guided', videoRow: row.row, title: row.title || row.topic || '', inputType: row.inputType || 'Prompt', sourceText: row.script || '', settings: { language: row.language || cfg.language || 'en', screen_language: row.screen_language || cfg.screen_language || row.language || cfg.language || 'en', minutes: +row.minutes || +cfg.minutes || 3, audience: row.audience || cfg.audience || '', voice: row.voice || cfg.voice || '', tts_style: cfg.tts_style || '', aspect: row.aspect || cfg.aspect || '16:9', web_research: true }, stage: 'blueprint', blueprint: { status: 'empty', plan: {}, instruction: '', partial: {} }, current: 1, activeStep: null, scenes: [], editor: { main: [], v2: [], ov: [], aud: [], subs: [], look: {}, trk: {} } })

async function putText(parent, name, text) {
  const old = await G.find(name, parent)
  if (!old) return G.upload(new File([text], name, { type: MIME }), parent)
  const r = await fetch(`${G.D}/files/${old.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${G.getToken()}`, 'Content-Type': MIME }, body: text })
  if (!r.ok) throw new Error('Could not save guided session')
  return { id: old.id }
}
export async function ensureSessionFolders(p, row) {
  const ids = row.folderId ? {} : await (await import('./playlist.js')).ensureVideoFolder(p, row)
  const root = await G.ensureFolder('Session', row.folderId || ids.folderId)
  const [audio, clips, code, media] = await Promise.all(['audio', 'clips', 'code', 'media'].map(x => G.ensureFolder(x, root.id)))
  return { ids, rootId: root.id, audioId: audio.id, clipsId: clips.id, codeId: code.id, mediaId: media.id }
}
export async function createSession(p, row, cfg) { const folders = await ensureSessionFolders(p, row), session = blankSession(row, cfg); await putText(folders.rootId, 'session.json', JSON.stringify(session)); return { session, folders } }
export async function loadSession(p, row, cfg) { const folders = await ensureSessionFolders(p, row), f = await G.find('session.json', folders.rootId); if (!f) return { session: blankSession(row, cfg), folders, exists: false }; const b = await fetch(`${G.D}/files/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${G.getToken()}` } }); if (!b.ok) throw new Error('Could not load guided session'); return { session: JSON.parse(await b.text()), folders, exists: true } }
export async function saveSession(folders, session, { force = false } = {}) { const f = await G.find('session.json', folders.rootId); if (f && !force) { const b = await fetch(`${G.D}/files/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${G.getToken()}` } }); const remote = b.ok ? JSON.parse(await b.text()) : null; if (remote && remote.rev > session.rev) throw new SessionConflict() } const next = { ...session, rev: (session.rev || 0) + 1, savedAt: stamp() }; await putText(folders.rootId, 'session.json', JSON.stringify(next)); return next }
export async function uploadAsset(folders, kind, name, blob) { const parent = folders[`${kind}Id`] || folders.mediaId, r = await G.upload(new File([blob], name, { type: blob.type || 'application/octet-stream' }), parent); return { fileId: r.id, name } }
export async function fetchAsset(fileId) { if (cache.has(fileId)) return cache.get(fileId); const r = await fetch(`${G.D}/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${G.getToken()}` } }); if (!r.ok) throw new Error('Could not fetch session asset'); const b = await r.blob(); cache.set(fileId, b); return b }
const referencedFiles = session => {
  const ids = new Set(session?.submittedMaps?.flatMap(x => x.fileIds || []) || [])
  for (const scene of session?.scenes || []) {
    for (const id of [scene.voice?.fileId, scene.visual?.codeFileId, scene.visual?.clipFileId]) if (id) ids.add(id)
    for (const item of scene.history || []) if (item.fileId) ids.add(item.fileId)
  }
  for (const item of session?.editor?.aud || []) if (item.assetId) ids.add(item.assetId)
  return ids
}
export async function garbageCollectAssets(before, after) {
  const keep = referencedFiles(after)
  await Promise.all([...referencedFiles(before)].filter(id => !keep.has(id)).map(id => G.deleteFile(id).catch(() => {})))
}
