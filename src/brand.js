// Brand kit: ONE place for the logo, profile picture, banner, intro/outro and where the logo sits on a video.
//
// Drive layout (Frame AI/Brand/):
//   brand.json        identity, handles, the Drive id of every file, and the logo placement for videos and reels
//   Logo/ Profile/ Banner/ Intro-Outro/ End-card/ Lower-third/     the uploaded files themselves
//
// The frontend only decides WHAT and WHERE. The backend reads brand.json, downloads the files by id and burns them into
// the video. Placement is stored as fractions of the video WIDTH, so it is the same on any resolution.
import * as G from './drive.js'
import { readJson, writeJson } from './social.js'
import { mergeDeep } from './config.js'
const { api, upload, ensureFolder, D, now } = G

export const SLOTS = [
  { id: 'logo', name: 'Main logo', kind: 'image', folder: 'Logo', accept: 'image/*', hint: 'A PNG with a transparent background. This is the one put on your videos.' },
  { id: 'logoAlt', name: 'Alternate logo', kind: 'image', folder: 'Logo', accept: 'image/*', hint: 'Optional white or dark version, for footage where the main logo is hard to see.' },
  { id: 'avatar', name: 'Profile picture', kind: 'image', folder: 'Profile', accept: 'image/*', hint: 'Square, 800 x 800 or bigger. Shown on YouTube, Facebook, Instagram and TikTok.' },
  { id: 'banner', name: 'Channel banner', kind: 'image', folder: 'Banner', accept: 'image/*', hint: '2560 x 1440. Keep the text inside the middle 1546 x 423 so it survives every screen.' },
  { id: 'intro', name: 'Intro clip', kind: 'video', folder: 'Intro-Outro', accept: 'video/*', hint: 'A short clip put at the start of complete videos.' },
  { id: 'outro', name: 'Outro clip', kind: 'video', folder: 'Intro-Outro', accept: 'video/*', hint: 'A short clip put at the end of complete videos (subscribe, next video).' },
  { id: 'endCard', name: 'End card', kind: 'image', folder: 'End-card', accept: 'image/*', hint: 'A picture held for a few seconds at the very end of complete videos.' },
  { id: 'lowerThird', name: 'Lower third', kind: 'image', folder: 'Lower-third', accept: 'image/*', hint: 'The name strip shown near the start of a video (name and title).' }]
export const slotOf = id => SLOTS.find(s => s.id === id)
export const EXTRAS = [['intro', 'Intro clip at the start'], ['outro', 'Outro clip at the end'], ['endCard', 'End card at the very end'], ['lowerThird', 'Lower third near the start']]

export const BRAND_DEFAULTS = {
  version: 1,
  identity: { name: '', tagline: '', cta: '', primary: '#4560e6', accent: '#ffd466' },
  handles: { youtube: '', facebook: '', instagram: '', tiktok: '' },
  files: {},   // slot id -> { id (Drive file id), name, link, size, at }
  // where the logo goes. pos = tl tc tr / ml c mr / bl bc br. size, margin = % of the video width. when = always | first | last (seconds)
  watermark: {
    video: { on: true, pos: 'br', size: 12, opacity: 85, margin: 3, when: 'always', seconds: 5, use: 'logo' },
    reel: { on: true, pos: 'tl', size: 22, opacity: 85, margin: 5, when: 'always', seconds: 5, use: 'logo' },   // reels: the app puts its own buttons on the right and bottom
  },
  extras: { intro: false, outro: false, endCard: false, lowerThird: false },   // complete videos only
}

export const POS = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
export const POS_NAME = { tl: 'Top left', tc: 'Top centre', tr: 'Top right', ml: 'Middle left', c: 'Centre', mr: 'Middle right', bl: 'Bottom left', bc: 'Bottom centre', br: 'Bottom right' }
const vh = pos => pos === 'c' ? ['m', 'c'] : pos.split('')   // [vertical t/m/b, horizontal l/c/r]

// CSS for the preview. aspect = frame width / frame height. The margin is a share of the WIDTH on both axes, like the backend does.
export function boxStyle(wm, aspect) {
  const [v, h] = vh(wm.pos), mx = +wm.margin || 0, my = mx * aspect, st = { width: `${wm.size}%`, opacity: (+wm.opacity || 0) / 100 }
  if (h === 'l') st.left = `${mx}%`; else if (h === 'r') st.right = `${mx}%`; else st.left = '50%'
  if (v === 't') st.top = `${my}%`; else if (v === 'b') st.bottom = `${my}%`; else st.top = '50%'
  if (h === 'c' || v === 'm') st.transform = `translate(${h === 'c' ? '-50%' : '0'}, ${v === 'm' ? '-50%' : '0'})`
  return st
}
// The same placement as numbers the backend can use directly (ffmpeg overlay expressions).
export function ffmpegOf(wm, files) {
  const [v, h] = vh(wm.pos), m = ((+wm.margin || 0) / 100).toFixed(4)
  return {
    on: !!wm.on, file_id: (files[wm.use] || files.logo || {}).id || '', width_fraction: (+wm.size || 0) / 100, margin_fraction: +m, opacity: (+wm.opacity || 0) / 100,
    x: h === 'l' ? `main_w*${m}` : h === 'r' ? `main_w-overlay_w-main_w*${m}` : '(main_w-overlay_w)/2',
    y: v === 't' ? `main_w*${m}` : v === 'b' ? `main_h-overlay_h-main_w*${m}` : '(main_h-overlay_h)/2',
    when: wm.when, seconds: wm.when === 'always' ? 0 : +wm.seconds || 0,
  }
}

// ---------------------------------------------------------------- Drive
export async function loadBrand(w) {
  const { file, data } = await readJson(w.brand.folderId, 'brand.json')
  const b = mergeDeep(BRAND_DEFAULTS, data || {})
  return { fileId: file || await writeJson(w.brand.folderId, 'brand.json', b), b }
}
export async function saveBrand(w, s, b) {
  const out = { ...b, updated: now(), backend: {
    note: 'Written by the frontend. Files are Drive file ids. Placement is a fraction of the video width: video = complete videos, reel = every reel (YouTube Shorts, Facebook, Instagram, TikTok).',
    video: ffmpegOf(b.watermark.video, b.files), reel: ffmpegOf(b.watermark.reel, b.files),
    extras: Object.fromEntries(EXTRAS.map(([k]) => [k, b.extras[k] && b.files[k] ? b.files[k].id : ''])) } }
  s.fileId = await writeJson(w.brand.folderId, 'brand.json', out, s.fileId); s.b = b
}
// upload a new file for a slot; the old one is deleted once the new one is safely there
export async function setSlot(w, slot, file, old) {
  const dir = await ensureFolder(slot.folder, w.brand.folderId)
  const r = await upload(file, dir.id)
  if (old?.id) await api(`${D}/files/${old.id}`, { method: 'DELETE' }).catch(() => {})
  return { id: r.id, name: file.name, link: r.webViewLink || '', size: file.size, at: now() }
}
export const dropFile = f => f?.id ? api(`${D}/files/${f.id}`, { method: 'DELETE' }).catch(() => {}) : Promise.resolve()

// Drive files need the login token, so a picture is fetched once and shown from a local blob.
const cache = new Map()
export async function imageUrl(id) {
  if (cache.has(id)) return cache.get(id)
  const r = await fetch(`${D}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${G.getToken()}` } })
  if (!r.ok) throw new Error('Could not load the picture from Drive.')
  const u = URL.createObjectURL(await r.blob()); cache.set(id, u); return u
}
