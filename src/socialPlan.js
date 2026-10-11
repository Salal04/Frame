// Social planning: pure functions only (no Drive, no React), so the rules live in one place.
//
// Drive layout (Frame AI/Social/):
//   social_config.json      accounts (YouTube token, Buffer key + channel ids) and defaults.   PRIVATE: holds secrets
//   backend_requests.json   written BY THE BACKEND when it needs something from the user (shown as a banner here)
//   Days/2026-10-15.json    ONE FILE PER DAY. Everything planned for that calendar day, all platforms.
//
// The frontend decides the DAY and the ORDER. The exact time of day is left to the backend ("time": "auto").
import { thumbnailFor, descriptionFor, mergeDeep, csv } from './config.js'

export const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', via: 'YouTube API', hasVideo: true, reelName: 'Shorts' },
  { id: 'tiktok', name: 'TikTok', via: 'Buffer', hasVideo: false, reelName: 'Reels' },
  { id: 'instagram', name: 'Instagram', via: 'Buffer', hasVideo: false, reelName: 'Reels' }]
export const platformOf = id => PLATFORMS.find(p => p.id === id)
export const YT_DAILY = 6   // videos.insert costs 1,600 quota units; the default 10,000 units/day is about 6 uploads (plus thumbnails)

export const CUTS = [
  ['equal', 'Equal parts', 'Every reel gets the same length.'],
  ['chapters', 'At chapter / scene breaks', 'The backend cuts at the nearest scene boundary, so no sentence is cut in half.'],
  ['auto', 'Let the backend choose', 'The backend picks natural breaks. The number above is the target.'],
  ['manual', 'My own time ranges', 'You give the start and end of each reel.']]

export const SOCIAL_DEFAULTS = {
  timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi' } catch { return 'Asia/Karachi' } })(),
  accounts: {
    youtube: { refresh_token: '', channel_id: '', channel_title: '', connected_at: '' },
    // Each platform has its own Buffer key. One Buffer account for both? Paste the same key in both fields.
    // (api_key / organization_id directly on buffer = old single-key config; still honoured as a fallback.)
    buffer: { api_key: '', organization_id: '', connected_at: '',
      tiktok: { api_key: '', organization_id: '', connected_at: '' },
      instagram: { api_key: '', organization_id: '', connected_at: '' } },
  },
  reels: { count: 4, cut: 'equal', fit: 'blur', partLabel: true },   // how a video is divided; the planner starts from these
  platforms: {
    youtube: { privacy: 'public', category: '27', madeForKids: false, tags: '', hashtags: '#shorts',
      videoTitle: '{title}', videoDescription: '{description}', reelTitle: '{title} (Part {part}/{parts})', reelDescription: '{title}\n\n{hashtags}' },
    tiktok: { channel_id: '', channel_name: '', hashtags: '', caption: '{title} (Part {part}/{parts})\n{hashtags}' },
    instagram: { channel_id: '', channel_name: '', hashtags: '', caption: '{title} (Part {part}/{parts})\n\n{hashtags}' },
  },
}
export const YT_CATEGORIES = [['27', 'Education'], ['28', 'Science & Technology'], ['22', 'People & Blogs'], ['24', 'Entertainment'], ['26', 'Howto & Style'], ['25', 'News & Politics']]
// Which Buffer key a platform publishes through (the backend must use the same rule).
export const bufferAccount = (cfg, pf) => { const b = cfg.accounts.buffer; return b[pf]?.api_key ? b[pf] : b }
export const withDefaults = cfg => mergeDeep(SOCIAL_DEFAULTS, cfg || {})

// ---------------------------------------------------------------- dates (a "day" is a plain YYYY-MM-DD in the user's time zone)
const pad = n => String(n).padStart(2, '0')
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => isoOf(new Date())
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoOf(d) }   // noon: immune to DST shifts
export const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(new Date(`${s}T12:00:00`).getTime())
export const niceDay = iso => {
  const t = todayISO(); const d = new Date(`${iso}T12:00:00`)
  const name = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return iso === t ? `Today · ${name}` : iso === addDays(t, 1) ? `Tomorrow · ${name}` : name
}
export const shortDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// ---------------------------------------------------------------- videos
export const fileIdOf = link => (String(link || '').match(/\/d\/([\w-]{10,})/) || String(link || '').match(/[?&]id=([\w-]{10,})/) || [])[1] || ''

// What the backend needs to know about one finished video, frozen into the day file at planning time.
export function snapshotVideo(d, r) {
  const fid = fileIdOf(r.output)
  return {
    key: fid || `${d.p.folderId}|${r.row}`, project: d.p.name, projectId: d.p.folderId, single: !!d.p.isSingles, row: r.row, order: r.order,
    title: r.title, description: descriptionFor(d.cfg, r), minutes: +r.minutes || +d.cfg.minutes || 0, language: r.language || d.cfg.language || '',
    output: r.output || '', file_id: fid, status: r.status, thumbnail: thumbnailFor(d.cfg, r),
  }
}
export const isReady = v => !!v.output

// ---------------------------------------------------------------- reel ranges ("0:00-0:45" per line)
const toSec = t => { const p = t.trim().split(':').map(Number); if (!p.length || p.length > 3 || p.some(x => !Number.isFinite(x) || x < 0)) return NaN; return p.reduce((a, x) => a * 60 + x, 0) }
export function parseRanges(text) {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean), out = []
  for (const [i, l] of lines.entries()) {
    const m = l.split(/\s*(?:-|–|—|to)\s*/i)
    if (m.length !== 2) throw new Error(`Range ${i + 1} (“${l}”): write it like 0:00-0:45`)
    const a = toSec(m[0]), b = toSec(m[1])
    if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`Range ${i + 1} (“${l}”): use minutes:seconds, like 1:30`)
    if (b <= a) throw new Error(`Range ${i + 1} (“${l}”): the end must be after the start`)
    out.push([a, b])
  }
  return out
}

// ---------------------------------------------------------------- items
const fill = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).replace(/-/g, '').slice(0, 10)
export const dupKey = it => [it.video?.key, it.platform, it.kind, it.reel?.part || 0].join('|')

function makeItem(platform, kind, v, cfg, reel) {
  const pc = cfg.platforms[platform], isYt = platform === 'youtube'
  const ctx = { title: v.title, description: v.description, project: v.single ? '' : v.project, part: reel?.part ?? '', parts: reel?.of ?? '', hashtags: pc.hashtags || '' }
  return {
    id: newId(), platform, kind, order: 0, status: 'Planned', time: 'auto',   // time "auto" = the backend picks the time of day
    video: { key: v.key, project: v.project, project_id: v.projectId, single: v.single, row: v.row, title: v.title, output: v.output, file_id: v.file_id, minutes: v.minutes, language: v.language },
    reel: reel || null,
    thumbnail: isYt && kind === 'video' ? v.thumbnail : null,
    title: isYt ? fill(kind === 'video' ? pc.videoTitle : pc.reelTitle, ctx).slice(0, 100) : '',
    description: isYt ? fill(kind === 'video' ? pc.videoDescription : pc.reelDescription, ctx) : '',
    caption: isYt ? '' : fill(pc.caption, ctx),
    publish: isYt ? { privacy: pc.privacy, category: pc.category, made_for_kids: !!pc.madeForKids, tags: csv(pc.tags) } : { via: 'buffer', channel_id: pc.channel_id || '' },
    result: { link: '', at: '', error: '', attempts: 0 }, moved_from: [],
  }
}

// How many items each platform already has on each day (a missed item no longer holds a slot).
export function loadOf(days, platform) {
  const load = {}
  Object.entries(days).forEach(([d, v]) => (v.items || []).forEach(i => { if (i.platform === platform && effStatus(i, d) !== 'Missed' && i.status !== 'Failed') load[d] = (load[d] || 0) + 1 }))
  return load
}

// plan = { videos (in the order the user chose), start, gap, targets, reels, days }
//   Complete video (YouTube): on its own day = start + (video number x gap) + offset.
//   Reels: one queue per platform, in the chosen order (all parts of video 1, then video 2 ...), `perDay` a day,
//   starting at start + offset and skipping days that already hold `perDay` items of that platform.
// Returns [{ date, item }] plus what was left out. Nothing is written here.
export function buildEntries({ videos, start, gap, targets, reels, cfg, existing = new Set(), days = {} }) {
  if (!validDay(start)) throw new Error('Pick a start day.')
  const entries = [], skipped = [], gapN = Math.max(0, Math.floor(+gap || 0))
  const wantReels = ['youtube', 'tiktok', 'instagram'].filter(p => targets[p === 'youtube' ? 'ytReel' : p]?.on)
  let ranges = null, count = Math.max(1, Math.floor(+reels.count || 1))
  if (wantReels.length) {
    if (reels.cut === 'manual') { ranges = parseRanges(reels.manual); if (!ranges.length) throw new Error('Write at least one time range, or choose another way to cut.'); count = ranges.length }
    else if (count > 60) throw new Error('That is a lot of reels for one video. Use 60 or fewer.')
  }
  const lane = {}   // per platform: where its reel queue stands
  wantReels.forEach(p => { const t = targets[p === 'youtube' ? 'ytReel' : p]; lane[p] = { day: addDays(start, Math.max(0, Math.floor(+t.offset || 0))), per: Math.max(1, Math.floor(+t.perDay || 1)), load: loadOf(days, p) } })
  const put = (date, item) => { const k = dupKey(item); if (existing.has(k)) { skipped.push(item); return false } existing.add(k); entries.push({ date, item }); return true }
  videos.forEach((v, vi) => {
    if (targets.ytVideo?.on) put(addDays(start, vi * gapN + Math.max(0, Math.floor(+targets.ytVideo.offset || 0))), makeItem('youtube', 'video', v, cfg, null))
    wantReels.forEach(p => {
      const L = lane[p]
      for (let n = 1; n <= count; n++) {
        const reel = { part: n, of: count, cut: reels.cut, fit: reels.fit, part_label: !!reels.partLabel, range_sec: ranges ? ranges[n - 1] : null }
        const item = makeItem(p, 'reel', v, cfg, reel)
        if (existing.has(dupKey(item))) { skipped.push(item); continue }
        while ((L.load[L.day] || 0) >= L.per) L.day = addDays(L.day, 1)
        put(L.day, item); L.load[L.day] = (L.load[L.day] || 0) + 1
      }
    })
  })
  return { entries, skipped, count }
}

// ---------------------------------------------------------------- reading the day files
export const effStatus = (it, date, today = todayISO()) => it.status === 'Planned' && date < today ? 'Missed' : it.status
export function itemsOf(days, platform) {
  const today = todayISO()
  return Object.entries(days).flatMap(([date, d]) => (d.items || []).filter(i => i.platform === platform).map(item => ({ date, item, eff: effStatus(item, date, today) })))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.item.order || 0) - (b.item.order || 0))
}
export const byVideoKey = days => {
  const m = {}
  Object.entries(days).forEach(([date, d]) => (d.items || []).forEach(item => { (m[item.video?.key] ||= []).push({ date, item, eff: effStatus(item, date) }) }))
  return m
}
export const existingKeys = days => new Set(Object.values(days).flatMap(d => (d.items || []).map(dupKey)))

// One short line per platform+kind for a video: "TikTok reels 2/5 uploaded · 18–22 Oct"
export function summarize(entries) {
  const g = {}
  entries.forEach(e => { const k = `${e.item.platform}:${e.item.kind}`; (g[k] ||= []).push(e) })
  return Object.entries(g).map(([k, list]) => {
    const [pf, kind] = k.split(':'), P = platformOf(pf), dates = list.map(x => x.date).sort()
    const up = list.filter(x => x.eff === 'Uploaded').length, late = list.filter(x => x.eff === 'Missed' || x.eff === 'Failed').length
    const what = kind === 'video' ? 'complete video' : P.reelName.toLowerCase()
    const span = dates[0] === dates.at(-1) ? shortDay(dates[0]) : `${shortDay(dates[0])} to ${shortDay(dates.at(-1))}`
    return { key: k, text: `${P.name} ${what}${kind === 'reel' ? ` ${up}/${list.length} uploaded` : up ? ' uploaded' : ''} · ${span}`, late, done: up === list.length }
  })
}

// Move a set of missed/failed items to new days: `perDay` per day starting at `start`, counting what is already planned there.
export function planReschedule(list, days, platform, start, perDay) {
  const per = Math.max(1, Math.floor(+perDay || 1)), load = loadOf(days, platform)
  let day = start; const out = []
  for (const e of list) {
    while ((load[day] || 0) >= per) day = addDays(day, 1)
    out.push({ ...e, to: day }); load[day] = (load[day] || 0) + 1
  }
  return out
}
