// Google Drive + Sheets layer. Scope drive.file = app only touches files it creates.
const CID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const D = 'https://www.googleapis.com/drive/v3', S = 'https://sheets.googleapis.com/v4/spreadsheets'
export const FOLDER = 'application/vnd.google-apps.folder', SHEET = 'application/vnd.google-apps.spreadsheet'
let token = null
const enc = encodeURIComponent
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

export function signIn() {
  return new Promise((res, rej) => {
    if (!window.google) return rej(new Error('Google script not loaded yet'))
    window.google.accounts.oauth2.initTokenClient({
      client_id: CID, scope: 'https://www.googleapis.com/auth/drive.file',
      callback: r => r.access_token ? (token = r.access_token, res()) : rej(new Error(r.error || 'Sign-in failed')),
    }).requestAccessToken({ prompt: '' })
  })
}
async function api(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opt.headers } })
  if (!r.ok) throw new Error((await r.text()).slice(0, 300))
  return r.status === 204 ? null : r.json()
}
async function find(name, parent, mime) {
  const c = [`name='${name.replace(/'/g, "\\'")}'`, 'trashed=false']
  if (parent) c.push(`'${parent}' in parents`); if (mime) c.push(`mimeType='${mime}'`)
  return (await api(`${D}/files?q=${enc(c.join(' and '))}&fields=files(id,name)`)).files[0]
}
const mkFolder = (name, parent) => api(`${D}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }) })
async function mkSheet(name, parent, tabs) {
  const cell = h => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })
  const s = await api(S, { method: 'POST', body: JSON.stringify({ properties: { title: name }, sheets: tabs.map((t, i) => ({ properties: { title: t.title, sheetId: i, gridProperties: { frozenRowCount: 1 } }, data: [{ startRow: 0, startColumn: 0, rowData: [{ values: t.header.map(cell) }] }] })) }) })
  await api(`${D}/files/${s.spreadsheetId}?addParents=${parent}&removeParents=root&fields=id`, { method: 'PATCH', body: '{}' })
  return s.spreadsheetId
}
const append = (id, tab, row) => api(`${S}/${id}/values/${enc(tab + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [row] }) })
const read = async (id, range) => (await api(`${S}/${id}/values/${enc(range)}`)).values || []
const log = (sheet, action, details) => append(sheet, 'Log', [now(), action, details])

// ---------- workspace bootstrap ----------
export async function init() {
  let root = await find('Frame AI', null, FOLDER)
  if (!root) {
    root = await mkFolder('Frame AI')
    await api(`${D}/files/${root.id}/permissions`, { method: 'POST', body: JSON.stringify({ type: 'anyone', role: 'reader' }) }) // public, view-only
  }
  let ps = await find('Projects', root.id, SHEET)
  const projectsSheet = ps ? ps.id : await mkSheet('Projects', root.id, [{ title: 'Projects', header: ['Project Name', 'Folder ID', 'Sheet ID', 'Created', 'Output Type', 'Length (s)', 'Status'] }])
  let sc = await find('Scene', root.id, FOLDER); if (!sc) sc = await mkFolder('Scene', root.id)
  let ss = await find('Scene Videos', sc.id, SHEET)
  const sceneSheet = ss ? ss.id : await mkSheet('Scene Videos', sc.id, [{ title: 'Scenes', header: ['Video Name', 'Processed', 'Description'] }, { title: 'Log', header: ['Time', 'Action', 'Details'] }])
  return { rootId: root.id, projectsSheet, sceneId: sc.id, sceneSheet }
}

// ---------- projects ----------
export async function listProjects(w) {
  return (await read(w.projectsSheet, 'Projects!A2:G')).map(r => ({ name: r[0], folderId: r[1], sheetId: r[2], created: r[3], mode: r[4], length: r[5], status: r[6] }))
}
export async function createProject(w, name) {
  const f = await mkFolder(name, w.rootId)
  const sheetId = await mkSheet(`${name} - Record`, f.id, [
    { title: 'Files', header: ['File Name', 'Type', 'Size (MB)', 'Uploaded', 'Drive Link'] },
    { title: 'Settings', header: ['Setting', 'Value'] },
    { title: 'Log', header: ['Time', 'Action', 'Details'] }])
  await append(w.projectsSheet, 'Projects', [name, f.id, sheetId, now(), 'not set', '', 'Created'])
  await log(sheetId, 'Project created', `Folder ${f.id}`)
}
export async function deleteProject(w, p) {
  await api(`${D}/files/${p.folderId}`, { method: 'DELETE' }) // removes folder + everything inside
  const ids = await read(w.projectsSheet, 'Projects!B2:B')
  const i = ids.findIndex(r => r[0] === p.folderId)
  if (i >= 0) await api(`${S}/${w.projectsSheet}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 } } }] }) })
}

// ---------- files ----------
async function upload(file, parent) {
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': file.type || 'application/octet-stream' }, body: JSON.stringify({ name: file.name, parents: [parent] }) })
  if (!r.ok) throw new Error('Upload could not start')
  const p = await fetch(r.headers.get('Location'), { method: 'PUT', body: file })
  if (!p.ok) throw new Error('Upload failed')
  return p.json()
}
export async function uploadToProject(p, file) {
  const r = await upload(file, p.folderId)
  await append(p.sheetId, 'Files', [file.name, file.type || file.name.split('.').pop(), (file.size / 1048576).toFixed(2), now(), r.webViewLink])
  await log(p.sheetId, 'File uploaded', `${file.name} (${(file.size / 1048576).toFixed(2)} MB)`)
}
export async function addYoutubeLink(p, url) {
  if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) throw new Error('Enter a valid YouTube link')
  let title = url
  try { const o = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${enc(url)}`)).json(); if (o.title) title = o.title } catch {}
  await append(p.sheetId, 'Files', [title, 'YouTube link (pending download)', '', now(), url])
  await log(p.sheetId, 'YouTube link added', `${title} - ${url}`)
  return title
}
export async function saveDescription(p, text) {
  const old = await find('description.txt', p.folderId)
  if (old) await api(`${D}/files/${old.id}`, { method: 'DELETE' })
  await upload(new File([text], 'description.txt', { type: 'text/plain' }), p.folderId)
  await log(p.sheetId, 'Description saved', `${text.length} characters`)
}
export async function getSettings(p) {
  const o = {}; (await read(p.sheetId, 'Settings!A2:B')).forEach(r => o[r[0]] = r[1]); return o
}
export async function saveSettings(w, p, s) {
  const rows = [['Setting', 'Value'], ['Output type', s.mode], ['Video length (s)', s.length], ['Process part: start', s.start], ['Process part: end', s.end], ['Process whole video', s.whole ? 'yes' : 'no'], ['Updated', now()]]
  await api(`${S}/${p.sheetId}/values/Settings!A1:B20:clear`, { method: 'POST', body: '{}' })
  await api(`${S}/${p.sheetId}/values/Settings!A1?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: rows }) })
  const ids = await read(w.projectsSheet, 'Projects!B2:B'), i = ids.findIndex(r => r[0] === p.folderId)
  if (i >= 0) await api(`${S}/${w.projectsSheet}/values/Projects!E${i + 2}:G${i + 2}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: [[s.mode, s.length, 'Ready']] }) })
  await log(p.sheetId, 'Settings updated', `${s.mode}, ${s.length}s, ${s.whole ? 'whole video' : s.start + ' to ' + s.end}`)
}

// ---------- scenes (videos only) ----------
export async function listScenes(w) { return (await read(w.sceneSheet, 'Scenes!A2:C')).map(r => ({ name: r[0], processed: r[1], desc: r[2] })) }
export async function uploadScene(w, file) {
  if (!file.type.startsWith('video/')) throw new Error(`${file.name} is not a video`)
  await upload(file, w.sceneId)
  await append(w.sceneSheet, 'Scenes', [file.name, '', ''])
  await log(w.sceneSheet, 'Scene uploaded', file.name)
}

// ---------- YouTube links (recorded, not downloaded in the browser) ----------
export const ytId = u => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/) || [])[1]
async function ytTitle(url) { try { return (await (await fetch(`https://noembed.com/embed?url=${enc(url)}`)).json()).title || null } catch { return null } }
async function ytInfo(url) {
  const id = ytId(url.trim()); if (!id) throw new Error('That is not a valid YouTube link')
  return { id, link: `https://www.youtube.com/watch?v=${id}`, title: (await ytTitle(url)) || `YouTube video ${id}` }
}
export async function addLinkToProject(p, url) {
  const y = await ytInfo(url)
  await append(p.sheetId, 'Files', [y.title, 'YouTube link', '', now(), y.link])
  await log(p.sheetId, 'YouTube link added', `${y.title} (${y.link})`)
}
export async function addSceneLink(w, url) {
  const y = await ytInfo(url)
  await append(w.sceneSheet, 'Scenes', [`=HYPERLINK("${y.link}","${y.title.replace(/"/g, '""')}")`, '', ''])
  await log(w.sceneSheet, 'Scene link added', `${y.title} (${y.link})`)
}
