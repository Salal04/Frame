// Drive layer for the pipeline: JSON config files, the per-playlist "Playlist" sheet, thumbnails.
import * as G from './drive.js'
import { PLAYLIST_COLS, PROJECT_DEFAULTS, GLOBAL_DEFAULTS, STATUSES, mergeDeep, normStatus, analyzeTable, importRows, buildQueue, waitingOf, makeRecord } from './config.js'
const { api, find, ensureFolder, put, read, append, log, safe, now, upload, delRow, getToken, enc, D, S } = G
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

// ---------- global config: one file for every project, in the private Application Config folder (NOT inside the public Frame AI folder) ----------
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
    const o = { row: i + 2, raw }; PLAYLIST_COLS.forEach(([h, k]) => { o[k] = raw[h] ?? '' }); o.status = normStatus(o.status); return o
  }).filter(o => o.title || o.topic)
}

export async function saveVideo(p, o) {
  const raw = { ...(o.raw || {}) }
  PLAYLIST_COLS.forEach(([h, k]) => { if (k in o) raw[h] = o[k] })
  raw['Updated'] = now()
  const arr = p.head.map(h => safe(String(raw[h] ?? '')))   // user-added columns pass through untouched
  if (o.row) await put(p.sheetId, `Playlist!A${o.row}:${colL(p.head.length - 1)}${o.row}`, [arr])
  else await append(p.sheetId, 'Playlist', arr)
  await log(p.sheetId, o.row ? 'Video saved' : 'Video added', o.title || '')
}
export async function deleteVideo(p, o) { await delRow(p.sheetId, p.tabId, o.row - 2); await log(p.sheetId, 'Video removed', o.title) }

// results written by run_from_frame.py (frame_results.json)
export async function importResults(p, rows, results) {
  let n = 0
  for (const r of results) {
    const row = rows.find(x => x.row === r.row && x.title === r.title)
    if (row) { await saveVideo(p, { ...row, status: normStatus(r.status), output: r.output || row.output || '' }); n++ }
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

// ---------- production record (Application Config / production_record.json) ----------
// Written only when something actually changed, so opening the tab does not rewrite it every time.
export async function syncRecord(g, plan, data) {
  const rec = makeRecord(plan, data, buildQueue(plan, waitingOf(data)))
  const { file, data: old } = await readJson(g.dirId, 'production_record.json')
  const { updated_at, ...prev } = old || {}
  if (JSON.stringify(prev) !== JSON.stringify(rec)) await writeJson(g.dirId, 'production_record.json', { updated_at: new Date().toISOString(), ...rec }, file)
  return rec
}
