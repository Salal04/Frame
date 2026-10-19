// Drive layer for the pipeline: JSON config files, the per-playlist "Playlist" sheet, thumbnails.
import * as G from './drive.js'
import { PLAYLIST_COLS, PROJECT_DEFAULTS, GLOBAL_DEFAULTS, STATUSES, USER_STATUSES, isLocked, canUserSet, mergeDeep, normStatus, normInput, clipsFor, analyzeTable, importRows, buildQueue, waitingOf, makeRecord } from './config.js'
const { api, find, ensureFolder, put, read, append, log, safe, now, upload, delRow, getToken, enc, D, S } = G
const mkFolder = (name, parent) => api(`${D}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name, mimeType: G.FOLDER, parents: [parent] }) })
const auth = () => ({ Authorization: `Bearer ${getToken()}` })
const colL = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }

// ---------- JSON files in Drive ----------
async function readJson(parent, name) {
  const f = await find(name, parent)
  if (!f) return { file: null, data: null }
  const r = await fetch(`${D}/files/${f.id}?alt=media`, { headers: auth() })
  try { return { file: f.id, data: r.ok ? await r.json() : null } } catch { return { file: f.id, data: null } }
}
async function writeJson(parent, name, data, fileId) {
  const body = JSON.stringify(data, null, 2)
  if (fileId) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' }, body })
    if (!r.ok) throw new Error(`Could not save ${name}`)
    return fileId
  }
  return (await upload(new File([body], name, { type: 'application/json' }), parent)).id
}

// ---------- global config: one file for every project, in the Application Config folder (private to the owner; never share it, it holds API keys) ----------
export async function loadGlobal(appId) {
  const { file, data } = await readJson(appId, 'frame_config.json')
  const cfg = mergeDeep(GLOBAL_DEFAULTS, data || {})
  return { dirId: appId, fileId: file || await writeJson(appId, 'frame_config.json', cfg), cfg }
}
export async function saveGlobal(g, cfg) { g.fileId = await writeJson(g.dirId, 'frame_config.json', cfg, g.fileId); g.cfg = cfg }

// ---------- project (playlist) config ----------
export async function loadProject(p) {
  const { file, data } = await readJson(p.folderId, 'project_config.json')
  const cfg = mergeDeep(PROJECT_DEFAULTS, data || {})
  p.cfgFileId = file || await writeJson(p.folderId, 'project_config.json', cfg)
  if (p.isSingles) cfg.description = ''   // Singles never have a shared description
  return cfg
}
export async function saveProject(p, cfg) { p.cfgFileId = await writeJson(p.folderId, 'project_config.json', cfg, p.cfgFileId) }

export async function createPlaylist(w, name) {
  const p = await G.createProject(w, name)
  await ensureTab(p); await loadProject(p)
  return p
}

// ---------- the Playlist sheet: read by header NAME, so you can reorder, rename nothing, or add your own columns ----------
const statusRule = (sheetId, st) => ({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: st, endColumnIndex: st + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: STATUSES.map(userEnteredValue => ({ userEnteredValue })) }, showCustomUi: true, strict: false } } })
const growCols = async (p, need) => {   // the sheet grid must be wide enough before we write a wider header
  if (need <= (p.cols || 26)) return
  await api(`${S}/${p.sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ appendDimension: { sheetId: p.tabId, dimension: 'COLUMNS', length: need - (p.cols || 26) } }] }) })
  p.cols = need
}
export async function ensureTab(p) {
  const meta = await api(`${S}/${p.sheetId}?fields=sheets.properties(title,sheetId,gridProperties)`)
  const tab = meta.sheets.find(s => s.properties.title === 'Playlist')
  if (tab) { p.tabId = tab.properties.sheetId; p.cols = tab.properties.gridProperties?.columnCount || 26; return }
  const head = PLAYLIST_COLS.map(c => c[0]), st = head.indexOf('Status'), sheetId = 1000 + Math.floor(Math.random() * 1e6)
  await api(`${S}/${p.sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [
    { addSheet: { properties: { title: 'Playlist', sheetId, gridProperties: { frozenRowCount: 1 } } } }, statusRule(sheetId, st)] }) })
  await put(p.sheetId, 'Playlist!A1', [head])
  p.tabId = sheetId; p.cols = 26; p.valDone = true
}

export async function loadVideos(p) {
  if (p.tabId === undefined) await ensureTab(p)
  const v = await read(p.sheetId, 'Playlist')
  let head = v[0] || []
  const miss = PLAYLIST_COLS.map(c => c[0]).filter(h => !head.includes(h))
  if (miss.length) { await growCols(p, head.length + miss.length); await put(p.sheetId, `Playlist!${colL(head.length)}1`, [miss]); head = [...head, ...miss] }
  p.head = head
  if (!p.valDone) { p.valDone = true; await api(`${S}/${p.sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [statusRule(p.tabId, head.indexOf('Status'))] }) }).catch(() => {}) }   // dropdown shows the current statuses
  return v.slice(1).map((r, i) => {
    const raw = Object.fromEntries(head.map((h, j) => [h, r[j] ?? '']))
    const o = { row: i + 2, raw }; PLAYLIST_COLS.forEach(([h, k]) => { o[k] = raw[h] ?? '' }); o.status = normStatus(o.status)
    o.inputType = o.inputType ? normInput(o.inputType) : (o.script ? 'Script' : 'Prompt'); return o
  }).filter(o => o.title || o.topic || o.script)
}

// ---------- one Drive folder per video:  <playlist>/Videos/<NN - title>/  with  Input/  and  Output/ ----------
//   Input/   what the video is made from: input.json (the full request), script.txt or prompt.txt, description.txt
//   Output/  everything the backend produces for it: video, thumbnail, audio, logs ...
const folderLink = id => `https://drive.google.com/drive/folders/${id}`
const vName = o => `${String(o.order || (o.row ? o.row - 1 : 0) || 0).padStart(2, '0')} - ${(o.title || 'video').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`
export async function ensureVideoFolder(p, o) {
  if (o.folderId && o.inputFolderId && o.outputFolderId) return {}
  const parent = await ensureFolder('Videos', p.folderId)
  const dir = o.folderId ? { id: o.folderId } : await mkFolder(vName(o), parent.id)
  const [i, out] = await Promise.all([o.inputFolderId ? { id: o.inputFolderId } : ensureFolder('Input', dir.id), o.outputFolderId ? { id: o.outputFolderId } : ensureFolder('Output', dir.id)])
  return { folderId: dir.id, inputFolderId: i.id, outputFolderId: out.id, folderLink: folderLink(dir.id) }
}
async function putText(parent, name, text, type = 'text/plain') {
  const old = await find(name, parent)
  if (!old) return upload(new File([text], name, { type }), parent)
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${old.id}?uploadType=media`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': type }, body: text })
  if (!r.ok) throw new Error(`Could not save ${name}`)
}
// the input side of the folder: a plain snapshot of what the user typed, so the folder is self-contained
async function writeInput(o) {
  const isScript = o.inputType === 'Script'
  const input = { title: o.title, input_type: isScript ? 'script' : 'prompt', topic: o.topic || '', script: isScript ? o.script || '' : '', minutes: o.minutes || '', description: o.description || '', audience: o.audience || '', language: o.language || '', screen_language: o.screen_language || '', aspect: o.aspect || '', voice: o.voice || '', engine: o.engine || '', thumbnail_text: o.thumbText || '', thumbnail_link: o.thumbLink || '', custom_clips: clipsFor(o), extra: o.extra || '', saved: now() }
  await putText(o.inputFolderId, 'input.json', JSON.stringify(input, null, 2), 'application/json')
  if (isScript) await putText(o.inputFolderId, 'script.txt', o.script || '')
  else await putText(o.inputFolderId, 'prompt.txt', o.topic || o.title || '')
  if ((o.description || '').trim()) await putText(o.inputFolderId, 'description.txt', o.description)
}

// opts.backend = a result coming from the backend (may set any status). opts.system = the app itself finished a video (editor).
// Otherwise it is the USER: they may only move a video between Hold and Waiting, and never once the backend has taken it.
export async function saveVideo(p, o, opts = {}) {
  const by = opts.backend || opts.system, existing = !!o.row
  const prev = existing ? normStatus(o.raw?.['Status']) : null
  let next = normStatus(o.status ?? prev ?? 'Hold'), live = prev
  if (!by) {
    if (existing) {   // look at the sheet itself: the backend may have started this video after the page was loaded
      const col = colL(p.head.indexOf('Status'))
      live = normStatus((await read(p.sheetId, `Playlist!${col}${o.row}`))[0]?.[0])
      if (isLocked(live)) { if (next !== live && next !== prev) throw new Error(`“${o.title}” is already ${live} on the backend, so its status can no longer be changed here.`); next = live }
      else if (!canUserSet(live, next)) throw new Error(`Only Hold and Waiting can be set by hand. “${next}” is set by the backend.`)
    } else if (isLocked(next)) throw new Error('A new video must start on Hold or Waiting.')
  }
  o = { ...o, status: next }
  const locked = isLocked(next)
  if (!locked || !o.folderId) o = { ...o, ...await ensureVideoFolder(p, o) }
  const raw = { ...(o.raw || {}) }
  PLAYLIST_COLS.forEach(([h, k]) => { if (k in o) raw[h] = o[k] })
  raw['Updated'] = now()
  const arr = p.head.map(h => safe(String(raw[h] ?? '')))   // user-added columns pass through untouched
  if (o.row) await put(p.sheetId, `Playlist!A${o.row}:${colL(p.head.length - 1)}${o.row}`, [arr])
  else await append(p.sheetId, 'Playlist', arr)
  if (!locked && o.inputFolderId) await writeInput(o)   // once the backend has the video, its input snapshot stays as it was
  await log(p.sheetId, o.row ? (prev !== next ? `Video ${prev} → ${next}` : 'Video saved') : 'Video added', o.title || '')
}
// a Waiting video must have its folder before the backend can write into it: build the missing ones, then the caller reloads
export async function prepareFolders(p, rows) {
  let n = 0
  for (const r of rows) if (r.status === 'Waiting' && !(r.folderId && r.inputFolderId && r.outputFolderId)) { await saveVideo(p, r); n++ }
  return n
}
// Hold -> Waiting for many videos at once (the user releases them to the backend)
export async function releaseAll(p, rows) {
  let n = 0
  for (const r of rows) if (r.status === 'Hold') { await saveVideo(p, { ...r, status: 'Waiting' }); n++ }
  return n
}
export async function deleteVideo(p, o) { await delRow(p.sheetId, p.tabId, o.row - 2); await log(p.sheetId, 'Video removed', o.title) }

// results written by run_from_frame.py (frame_results.json)
export async function importResults(p, rows, results) {
  let n = 0
  for (const r of results) {
    const row = rows.find(x => x.row === r.row && x.title === r.title)
    if (row) { await saveVideo(p, { ...row, status: normStatus(r.status), output: r.output || row.output || '' }, { backend: true }); n++ }
  }
  return n
}

// ---------- upload a sheet into this project: append to the current one or replace it ----------
export const checkTable = (p, table) => analyzeTable(p.head || [], table)
export async function importTable(p, existing, table, mode) {
  if (!p.head) await loadVideos(p)
  const a = analyzeTable(p.head, table)
  if (!a.hasKey) throw new Error('The file needs a "Video Title" or "Topic / Prompt" column.')
  const head = [...p.head, ...a.added]
  if (a.added.length) { await growCols(p, head.length); await put(p.sheetId, 'Playlist!A1', [head]) }   // new columns are added, nothing is dropped
  p.head = head
  const base = mode === 'replace' ? 0 : existing.reduce((m, r) => Math.max(m, +r.order || 0, r.row - 1), 0)
  const rows = importRows(head, a, table, base, now()).map(r => r.map(c => safe(String(c))))
  if (!rows.length) throw new Error('No video rows found in that file.')
  if (mode === 'replace') {
    await api(`${S}/${p.sheetId}/values/${enc(`Playlist!A2:${colL(Math.max(p.cols || 26, head.length) - 1)}`)}:clear`, { method: 'POST', body: '{}' })
    await put(p.sheetId, 'Playlist!A2', rows)
  } else await api(`${S}/${p.sheetId}/values/${enc('Playlist!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: rows }) })
  await log(p.sheetId, mode === 'replace' ? 'Sheet replaced from upload' : 'Sheet appended from upload', `${rows.length} videos${a.added.length ? `, new columns: ${a.added.join(', ')}` : ''}`)
  return rows.length
}

// ---------- thumbnails ----------
export async function uploadTemplate(p, file) {
  const dir = await ensureFolder('Thumbnails', p.globalId)
  const r = await upload(file, dir.id)
  return { templateId: r.id, templateName: file.name, templateLink: r.webViewLink }   // project folder is view-only public, so the backend can fetch this link
}
export async function fileBlobUrl(id) {
  const r = await fetch(`${D}/files/${id}?alt=media`, { headers: auth() })
  if (!r.ok) throw new Error('Could not open the template image')
  return URL.createObjectURL(await r.blob())
}
export async function saveThumb(p, blob, name) {
  const dir = await ensureFolder('Thumbnails', p.globalId), gen = await ensureFolder('Generated', dir.id)
  return (await upload(new File([blob], name, { type: 'image/png' }), gen.id)).webViewLink
}

// a thumbnail uploaded for ONE video (beats the project's default template)
export async function uploadVideoThumb(p, file, row) {
  const dir = await ensureFolder('Thumbnails', p.globalId), own = await ensureFolder('Videos', dir.id)
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  return (await upload(new File([file], `${String(row.order || row.row).padStart(2, '0')}-${(row.title || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.${ext}`, { type: file.type }), own.id)).webViewLink
}

// ---------- production plan + record: two Google Sheets inside Application Config, editable here or straight in Drive ----------
const PLAN_HEAD = ['Order', 'Project', 'State', 'Videos Per Turn', 'Pause (min)', 'Pause After Every N Videos', 'Folder ID (do not edit)']
async function planSheet(w) {
  if (w.planSheet) return w.planSheet
  const f = await find('Production Plan', w.appId, G.SHEET)
  if (f) return (w.planSheet = f.id)
  const id = await G.mkSheet('Production Plan', w.appId, [{ title: 'Plan', header: PLAN_HEAD }, { title: 'Settings', header: ['Setting', 'Value'] }])
  await api(`${S}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ setDataValidation: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 }, rule: { condition: { type: 'ONE_OF_LIST', values: ['Active', 'Paused'].map(userEnteredValue => ({ userEnteredValue })) }, showCustomUi: true, strict: false } } }] }) })
  await put(id, 'Settings!A2', [['Order', 'Take turns'], ['Order choices', 'Take turns  |  One project at a time']])
  return (w.planSheet = id)
}
export async function loadPlan(w) {
  const id = await planSheet(w), rows = await read(id, 'Plan!A2:G'), set = await read(id, 'Settings!A2:B')
  const ord = String(set.find(r => r[0] === 'Order')?.[1] || '').toLowerCase()
  return {
    order: /one|sequen/.test(ord) ? 'sequential' : 'rotate',
    projects: rows.filter(r => r[6]).sort((a, b) => (+a[0] || 9999) - (+b[0] || 9999)).map(r => ({ id: r[6], name: r[1] || '', state: /pause/i.test(r[2] || '') ? 'paused' : 'active', perTurn: Math.max(1, +r[3] || 1), pauseMin: Math.max(0, +r[4] || 0), pauseEvery: Math.max(1, +r[5] || 1) })),
  }
}
export async function savePlan(w, plan) {
  const id = await planSheet(w)
  await api(`${S}/${id}/values/${enc('Plan!A2:G')}:clear`, { method: 'POST', body: '{}' })
  if (plan.projects.length) await put(id, 'Plan!A2', plan.projects.map((x, i) => [i + 1, safe(x.name), x.state === 'paused' ? 'Paused' : 'Active', x.perTurn, x.pauseMin, x.pauseEvery, x.id]))
  await put(id, 'Settings!A2', [['Order', plan.order === 'sequential' ? 'One project at a time' : 'Take turns'], ['Order choices', 'Take turns  |  One project at a time']])
}

async function recordSheet(w) {
  if (w.recSheet) return w.recSheet
  const f = await find('Production Record', w.appId, G.SHEET)
  if (f) return (w.recSheet = f.id)
  return (w.recSheet = await G.mkSheet('Production Record', w.appId, [{ title: 'Record', header: ['Section', 'Position', 'Project', 'Row', 'Title', 'Status', 'Pause After (min)', 'Output', 'Updated'] }, { title: 'Summary', header: ['Item', 'Value'] }]))
}
// What is next, what is queued, what is running, what is finished. Rewritten from the project sheets each time.
export async function syncRecord(w, plan, data) {
  const rec = makeRecord(plan, data, buildQueue(plan, waitingOf(data))), id = await recordSheet(w)
  const rows = [
    ...rec.queue.map(q => [q.position === 1 ? 'Next up' : 'Queue', q.position, q.playlist, q.row, q.title, 'Waiting', q.pause_after_min || '', '', '']),
    ...rec.in_process.map(r => ['In process', '', r.playlist, r.row, r.title, r.status, '', r.output, r.updated]),
    ...rec.completed.map(r => ['Made', '', r.playlist, r.row, r.title, r.status, '', r.output, r.updated]),
    ...rec.failed.map(r => ['Failed', '', r.playlist, r.row, r.title, r.status, '', r.output, r.updated])].map(r => r.map(c => safe(String(c ?? ''))))
  await api(`${S}/${id}/values/${enc('Record!A2:I')}:clear`, { method: 'POST', body: '{}' })
  if (rows.length) await put(id, 'Record!A2', rows)
  await api(`${S}/${id}/values/${enc('Summary!A2:B')}:clear`, { method: 'POST', body: '{}' })
  await put(id, 'Summary!A2', [['Updated', now()], ['Order', plan.order === 'sequential' ? 'One project at a time' : 'Take turns'],
    ['Next up', rec.next ? `${rec.next.playlist}: ${rec.next.title}` : 'nothing waiting'], ...Object.entries(rec.summary), ['Paused projects', rec.paused_projects.join(', ') || 'none']].map(r => r.map(c => safe(String(c)))))
  return rec
}

// ---------- custom clips: images / video clips the user wants overlaid on ONE video ----------
// Files go to <video>/Input/clips/. The list (positions, timing ...) is saved on the video's own row by saveVideo.
const mediaInfo = file => new Promise(res => {
  if (!file.type.startsWith('video/')) return res({ kind: 'image', seconds: null })
  const v = document.createElement('video'), u = URL.createObjectURL(file), done = x => { URL.revokeObjectURL(u); res(x) }
  v.preload = 'metadata'; v.onloadedmetadata = () => done({ kind: 'video', seconds: isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null }); v.onerror = () => done({ kind: 'video', seconds: null }); v.src = u
})
export async function uploadVideoClip(p, o, file) {
  if (!/^(image|video)\//.test(file.type)) throw new Error(`${file.name} is not an image or a video.`)
  const ids = await ensureVideoFolder(p, o), inputId = o.inputFolderId || ids.inputFolderId
  const dir = await ensureFolder('clips', inputId), [info, r] = await Promise.all([mediaInfo(file), upload(file, dir.id)])
  return { ids, clip: { name: file.name, kind: info.kind, fileId: r.id, url: r.webViewLink, duration: info.seconds || 5 } }
}
