// Drive layer for the pipeline: JSON config files, the per-playlist "Playlist" sheet, thumbnails.
import * as G from './drive.js'
import { PLAYLIST_COLS, PROJECT_DEFAULTS, GLOBAL_DEFAULTS, STATUSES, mergeDeep, normStatus, normInput, analyzeTable, importRows, buildQueue, waitingOf, makeRecord } from './config.js'
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
