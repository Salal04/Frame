// Drive layer for the Social section. Planning rules live in socialPlan.js.
import * as G from './drive.js'
import * as P from './playlist.js'
import { byOrder } from './config.js'
import { withDefaults, snapshotVideo, planReschedule, applyPatch } from './socialPlan.js'
const { api, find, upload, getToken, enc, D, now } = G
const auth = () => ({ Authorization: `Bearer ${getToken()}` })

// ---------- JSON files ----------
export async function readJson(parent, name) {
  const f = await find(name, parent)
  if (!f) return { file: null, data: null }
  const r = await fetch(`${D}/files/${f.id}?alt=media`, { headers: auth() })
  try { return { file: f.id, data: r.ok ? await r.json() : null } } catch { return { file: f.id, data: null } }
}
export async function writeJson(parent, name, data, fileId) {
  const body = JSON.stringify(data, null, 2)
  if (fileId) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' }, body })
    if (!r.ok) throw new Error(`Could not save ${name}`)
    return fileId
  }
  return (await upload(new File([body], name, { type: 'application/json' }), parent)).id
}

// ---------- social_config.json (accounts + defaults) ----------
export async function loadSocial(w) {
  const { file, data } = await readJson(w.social.folderId, 'social_config.json')
  const cfg = withDefaults(data)
  w.social.timezone = cfg.timezone
  return { fileId: file || await writeJson(w.social.folderId, 'social_config.json', cfg), cfg }
}
export async function saveSocial(w, s, cfg) { w.social.timezone = cfg.timezone; s.fileId = await writeJson(w.social.folderId, 'social_config.json', cfg, s.fileId); s.cfg = cfg }

// ---------- backend_requests.json: the backend writes here when it needs something ----------
// { "requests": [ { "id": "yt-token", "platform": "youtube", "message": "YouTube refused the saved login. Connect it again.", "at": "..." } ] }
export async function loadNeeds(w) { return (await readJson(w.social.folderId, 'backend_requests.json')).data?.requests || [] }
export async function clearNeeds(w, ids) {
  const { file, data } = await readJson(w.social.folderId, 'backend_requests.json')
  if (!file) return
  await writeJson(w.social.folderId, 'backend_requests.json', { ...data, requests: (data?.requests || []).filter(r => !ids.includes(r.id)) }, file)
}

// ---------- one file per day ----------
const DAY = /^\d{4}-\d{2}-\d{2}\.json$/
export async function loadDays(w) {
  const q = enc(`'${w.social.daysId}' in parents and trashed=false`)
  let files = [], tok = ''
  do {
    const r = await api(`${D}/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000${tok ? `&pageToken=${tok}` : ''}`)
    files = files.concat(r.files || []); tok = r.nextPageToken
  } while (tok)
  files = files.filter(f => DAY.test(f.name))
  const out = {}
  for (let i = 0; i < files.length; i += 6) await Promise.all(files.slice(i, i + 6).map(async f => {
    const r = await fetch(`${D}/files/${f.id}?alt=media`, { headers: auth() })
    if (!r.ok) return
    try { const d = await r.json(); if (Array.isArray(d.items)) out[f.name.slice(0, 10)] = d } catch { /* an unreadable file is skipped */ }
  }))
  return out
}
// Always re-read the day right before changing it: the backend writes results into the same file.
async function mutateDay(w, date, fn) {
  const name = `${date}.json`, { file, data } = await readJson(w.social.daysId, name)
  const cur = data && Array.isArray(data.items) ? data : { version: 1, date, items: [] }
  const next = fn({ ...cur, items: [...cur.items] })
  next.date = date; next.timezone = w.social.timezone || ''; next.updated = now(); next.note = 'Day and order are set by the frontend. The backend chooses the time of day.'
  if (!next.items.length) { if (file) await api(`${D}/files/${file}`, { method: 'DELETE' }); return }
  await writeJson(w.social.daysId, name, next, file)
}
const nextOrder = items => items.reduce((m, i) => Math.max(m, i.order || 0), 0) + 1

export async function addEntries(w, entries) {
  const by = {}; entries.forEach(e => (by[e.date] ||= []).push(e.item))
  for (const [date, items] of Object.entries(by).sort()) await mutateDay(w, date, d => { let o = nextOrder(d.items); items.forEach(it => d.items.push({ ...it, order: o++ })); return d })
  return entries.length
}
// change what will be posted (title, description, caption, tags, thumbnail, reel shape) of one planned item
export const updateItem = (w, date, id, patch) => mutateDay(w, date, d => {
  const i = d.items.findIndex(x => x.id === id)
  if (i < 0) throw new Error('That item is no longer in the day file. Refresh.')
  const it = d.items[i]
  if (it.status === 'Uploaded' || it.status === 'Uploading') throw new Error('An item that is uploading or already uploaded cannot be edited.')
  d.items[i] = applyPatch(it, patch)
  return d
})
// a thumbnail picked for one upload goes to Frame AI / Social / Thumbnails; the backend reads it from the link
export async function uploadThumb(w, file) {
  const dir = await G.ensureFolder('Thumbnails', w.social.folderId)
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  return (await upload(new File([file], `thumb-${Date.now().toString(36)}.${ext}`, { type: file.type }), dir.id)).webViewLink
}
export const removeItem = (w, date, id) => mutateDay(w, date, d => ({ ...d, items: d.items.filter(i => i.id !== id) }))

// move to another day: write the new day first, then remove from the old one (a failure in between shows a duplicate rather than losing the item)
export async function moveItem(w, date, id, to) {
  if (date === to) return
  let item
  await mutateDay(w, date, d => { item = d.items.find(i => i.id === id); return d })
  if (!item) throw new Error('That item is no longer in the day file. Refresh.')
  if (item.status === 'Uploaded' || item.status === 'Uploading') throw new Error('An item that is uploading or already uploaded cannot be moved.')
  const moved = { ...item, status: 'Planned', moved_from: [...(item.moved_from || []), { date, status: item.status, at: now() }], result: { ...item.result, error: '' } }
  await mutateDay(w, to, d => { d.items.push({ ...moved, order: nextOrder(d.items) }); return d })
  await removeItem(w, date, id)
}
export async function moveMany(w, list, days, platform, start, perDay) {
  for (const e of planReschedule(list, days, platform, start, perDay)) await moveItem(w, e.date, e.item.id, e.to)
}
// swap the order of an item with its neighbour of the same platform on the same day
export const nudge = (w, date, id, dir) => mutateDay(w, date, d => {
  const it = d.items.find(i => i.id === id); if (!it) return d
  const same = d.items.filter(i => i.platform === it.platform).sort((a, b) => (a.order || 0) - (b.order || 0)), k = same.findIndex(i => i.id === id), o = same[k + dir]
  if (o) { const t = it.order; it.order = o.order; o.order = t }
  return d
})

// ---------- finished videos from every playlist and Singles ----------
export async function loadPool(w) {
  const ps = [...await G.listProjects(w), w.singles], out = []
  for (const p of ps) { const cfg = await P.loadProject(p); out.push({ p, cfg, rows: await P.loadVideos(p) }) }
  return out
}
export const poolVideos = pool => pool.flatMap(d => d.rows.filter(r => r.status === 'Completed' || r.status === 'Uploaded').sort(byOrder).map(r => snapshotVideo(d, r)))

// ---------- Buffer: look up organization + channels with the API key (the browser may be blocked by CORS: then IDs are typed by hand) ----------
export async function bufferChannels(key) {
  const call = async query => {
    let r
    try { r = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` }, body: JSON.stringify({ query }) }) }
    catch { throw new Error('Buffer did not answer from the browser (it may block this site). Type the channel IDs by hand below.') }
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.errors) throw new Error(j.errors?.[0]?.message || `Buffer said ${r.status}. Check the API key.`)
    return j.data
  }
  const orgs = (await call('query { account { organizations { id name } } }')).account?.organizations || []
  if (!orgs.length) throw new Error('This API key has no organization.')
  const org = orgs[0], channels = (await call(`query { channels(input: { organizationId: "${org.id}" }) { id name displayName service } }`)).channels || []
  return { organization_id: org.id, organization: org.name, channels: channels.map(c => ({ id: c.id, name: c.displayName || c.name, service: String(c.service || '').toLowerCase() })) }
}
