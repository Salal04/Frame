// Summary-a-Video: Drive layer. A source video (YouTube link, uploaded file, or a file already in Drive) becomes one row in the
// "Summary Queue" sheet inside Frame AI/Summary-a-Video/. The user sets the longest summary (minutes) and presses Start:
// that moves the row from Hold to Waiting, which is the signal for the backend. Same Hold/Waiting rule as playlist videos.
import * as G from './drive.js'
import { SUMMARY_COLS, SUMMARY_MIN, SUMMARY_MAX, normLangs, normStatus, isLocked, canUserSet } from './config.js'
const { api, find, put, read, append, log, safe, now, upload, delRow, D, S, getToken } = G
const colL = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }
const HEAD = SUMMARY_COLS.map(c => c[0]), LAST = colL(HEAD.length - 1)
const VIDEO_RE = /^video\//, DRIVE_LINK = id => `https://drive.google.com/file/d/${id}/view`

async function sheetOf(w) {
  if (w.summarySheet) return w.summarySheet
  const f = await find('Summary Queue', w.summary.folderId, G.SHEET)
  if (f) {   // older sheet without the newest columns: write the full header (new columns are only ever added at the end)
    if (((await read(f.id, 'Summary!A1:Z1'))[0] || []).length < HEAD.length) await put(f.id, 'Summary!A1', [HEAD])
    return (w.summarySheet = f.id)
  }
  const id = await G.mkSheet('Summary Queue', w.summary.folderId, [{ title: 'Summary', header: HEAD }, { title: 'Log', header: ['Time', 'Action', 'Details'] }])
  await api(`${S}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ setDataValidation: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: HEAD.indexOf('Status'), endColumnIndex: HEAD.indexOf('Status') + 1 },
    rule: { condition: { type: 'ONE_OF_LIST', values: ['Hold', 'Waiting', 'In Process', 'Completed', 'Uploaded', 'Failed'].map(userEnteredValue => ({ userEnteredValue })) }, showCustomUi: true, strict: false } } }] }) }).catch(() => {})
  return (w.summarySheet = id)
}
export const summarySheetId = sheetOf

export async function listSummary(w) {
  const id = await sheetOf(w), v = await read(id, `Summary!A1:${LAST}`), head = v[0] || HEAD
  return v.slice(1).map((r, i) => {
    const raw = Object.fromEntries(head.map((h, j) => [h, r[j] ?? ''])), o = { row: i + 2, raw }
    SUMMARY_COLS.forEach(([h, k]) => { o[k] = raw[h] ?? '' }); o.status = normStatus(o.status); o.translateTo = normLangs(o.translateTo).join(','); return o
  }).filter(o => o.title || o.link || o.fileId)
}

const toRow = o => HEAD.map(h => safe(String(((SUMMARY_COLS.find(c => c[0] === h) || [])[1] && o[SUMMARY_COLS.find(c => c[0] === h)[1]]) ?? '')))
async function addRow(w, o) {
  const id = await sheetOf(w), n = (await read(id, 'Summary!A2:A')).length + 1
  await append(id, 'Summary', toRow({ order: n, status: 'Hold', maxMinutes: 3, language: 'en', style: 'highlights', added: now(), updated: now(), ...o }))
  await log(id, 'Source added', `${o.source}: ${o.title}`)
}
// a YouTube link: validated + titled, never downloaded in the browser (the backend fetches it when the row is Waiting)
export async function addYouTube(w, url) {
  const y = await G.ytInfo(url)
  if ((await listSummary(w)).some(r => r.link === y.link)) throw new Error('That YouTube link is already in the list.')
  await addRow(w, { title: y.title, source: 'YouTube', link: y.link })
}
// a video file from this computer: stored in Summary-a-Video/ in Drive (resumable upload, works for big files)
export async function addUpload(w, file) {
  if (!VIDEO_RE.test(file.type) && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)) throw new Error(`${file.name} is not a video file.`)
  const r = await upload(file, w.summary.folderId)
  await addRow(w, { title: file.name.replace(/\.[^.]+$/, ''), source: 'Upload', fileId: r.id, driveLink: r.webViewLink || DRIVE_LINK(r.id) })
}
// Sync: every video the app can see in Summary-a-Video/ that is not in the list yet is added (on Hold). Returns how many were new.
// Note: with the drive.file permission the app only sees files IT created or that the user picked with "Pick from Drive".
export async function syncFolder(w) {
  const q = encodeURIComponent(`'${w.summary.folderId}' in parents and trashed=false and mimeType contains 'video/'`)
  const files = (await api(`${D}/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=200`)).files || []
  const have = new Set((await listSummary(w)).map(r => r.fileId).filter(Boolean)); let n = 0
  for (const f of files) if (!have.has(f.id)) { await addRow(w, { title: f.name.replace(/\.[^.]+$/, ''), source: 'Drive', fileId: f.id, driveLink: f.webViewLink || DRIVE_LINK(f.id) }); n++ }
  return { found: files.length, added: n }
}

// ---- Google Picker: lets the user choose a video that is already in their Drive (grants the app access to just that file) ----
export const pickerReady = () => !!import.meta.env.VITE_GOOGLE_API_KEY
const load = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the Google file picker')); document.head.appendChild(s) })
export async function pickFromDrive(w) {
  await load('https://apis.google.com/js/api.js')
  await new Promise(res => window.gapi.load('picker', res))
  const picked = await new Promise(res => {
    const gp = window.google.picker, view = new gp.DocsView(gp.ViewId.DOCS_VIDEOS).setIncludeFolders(false).setSelectFolderEnabled(false)
    new gp.PickerBuilder().addView(view).setOAuthToken(getToken()).setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY).setAppId(String(import.meta.env.VITE_GOOGLE_CLIENT_ID).split('-')[0])
      .enableFeature(gp.Feature.MULTISELECT_ENABLED).setTitle('Choose videos to summarise').setCallback(d => { if (d.action === gp.Action.PICKED) res(d.docs); else if (d.action === gp.Action.CANCEL) res([]) }).build().setVisible(true)
  })
  let n = 0
  for (const d of picked) {   // copy into Summary-a-Video/ so everything lives in one folder (the copy is owned by the user and visible to the app)
    const c = await api(`${D}/files/${d.id}/copy?fields=id,name,webViewLink`, { method: 'POST', body: JSON.stringify({ parents: [w.summary.folderId], name: d.name }) })
    await addRow(w, { title: String(d.name).replace(/\.[^.]+$/, ''), source: 'Drive', fileId: c.id, driveLink: c.webViewLink || DRIVE_LINK(c.id) }); n++
  }
  return n
}

// ---- change a row. Users may only move Hold <-> Waiting, and never once the backend has the row (checked against the sheet itself). ----
export async function saveSummary(w, o, opts = {}) {
  const id = await sheetOf(w)
  if (!opts.backend) {
    const live = normStatus((await read(id, `Summary!${colL(HEAD.indexOf('Status'))}${o.row}`))[0]?.[0])
    if (isLocked(live)) throw new Error(`“${o.title}” is already ${live} on the backend, so it can no longer be changed here.`)
    if (!canUserSet(live, normStatus(o.status))) throw new Error('Only Hold and Waiting can be set by hand.')
  }
  const m = Math.min(SUMMARY_MAX, Math.max(SUMMARY_MIN, parseFloat(o.maxMinutes) || 3))
  const raw = { ...(o.raw || {}) }; SUMMARY_COLS.forEach(([h, k]) => { if (k in o) raw[h] = k === 'maxMinutes' ? m : k === 'translateTo' ? normLangs(o.translateTo).join(',') : o[k] }); raw['Updated'] = now()
  await put(id, `Summary!A${o.row}:${LAST}${o.row}`, [HEAD.map(h => safe(String(raw[h] ?? '')))])
  await log(id, 'Summary saved', `${o.title} · ${o.status} · up to ${m} min`)
}
export async function removeSummary(w, o) { const id = await sheetOf(w); await delRow(id, 0, o.row - 2); await log(id, 'Source removed', o.title) }

// length of a video file in Drive (seconds). Drive may not know it yet right after an upload: then null.
export async function driveDuration(fileId) {
  try { const j = await api(`${D}/files/${fileId}?fields=videoMediaMetadata(durationMillis)`); const ms = +j.videoMediaMetadata?.durationMillis; return ms ? Math.round(ms / 1000) : null } catch { return null }
}
