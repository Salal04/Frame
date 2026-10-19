// Social planning: pure functions only (no Drive, no React), so the rules live in one place.
//
// Drive layout (Frame AI/Social/):
//   social_config.json      accounts (YouTube token, Buffer key + channel ids) and defaults.   PRIVATE: holds secrets
//   backend_requests.json   written BY THE BACKEND when it needs something from the user (shown as a banner here)
//   Days/2026-10-15.json    ONE FILE PER DAY. Everything planned for that calendar day, all platforms.
//
// The frontend decides the DAY and the ORDER. The exact time of day is left to the backend ("time": "auto").
import { thumbnailFor, descriptionFor, mergeDeep, csv, normAspect } from './config.js'

export const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', via: 'YouTube API', hasVideo: true, reelName: 'Shorts' },
  { id: 'facebook', name: 'Facebook', via: 'Buffer', hasVideo: true, reelName: 'Reels' },
  { id: 'tiktok', name: 'TikTok', via: 'Buffer', hasVideo: false, reelName: 'Reels' },
  { id: 'instagram', name: 'Instagram', via: 'Buffer', hasVideo: false, reelName: 'Reels' }]
export const platformOf = id => PLATFORMS.find(p => p.id === id)
export const BUFFER_PLATFORMS = PLATFORMS.filter(p => p.via === 'Buffer')   // each has its own Buffer key + channel
export const tkey = (pf, kind) => `${pf}:${kind}`                          // planner target id, e.g. "facebook:video", "tiktok:reel"
export const targetLabel = (P, kind) => kind === 'video' ? `${P.name} · complete video` : `${P.name} · ${P.reelName}`
export const YT_DAILY = 6   // videos.insert costs 1,600 quota units; the default 10,000 units/day is about 6 uploads (plus thumbnails)

export const CUTS = [
  ['equal', 'Equal parts', 'Every reel gets the same length.'],
  ['chapters', 'At chapter / scene breaks', 'The backend cuts at the nearest scene boundary, so no sentence is cut in half.'],
  ['auto', 'Let the backend choose', 'The backend picks natural breaks. The number above is the target.'],
  ['manual', 'My own time ranges', 'You give the start and end of each reel.']]

// Which part of the video the reels come from, and how many reels there are. The backend may be given the freedom to decide either.
export const SOURCES = [
  ['whole', 'Whole video', 'Reels are cut from the full video, start to end.'],
  ['parts', 'Only these parts', 'You give the time ranges to take reels from. Everything outside them is left out.'],
  ['auto', 'Backend picks the moments', 'The backend looks at the whole video and chooses the best moments itself. Some parts may not be used.']]
export const COUNTS = [
  ['exact', 'Exactly this many', 'Always the number you type.'],
  ['max', 'Up to this many', 'Your number is only a ceiling. The backend makes as many as the video needs, so you may get fewer.'],
  ['auto', 'Backend decides', 'No number needed. The backend decides how many reels the video gives and how long each one is.']]
// short names for one planned reel: exact 2/5 · up to 5: 2 · backend decides: a single batch
export const reelNo = r => !r ? '' : r.flex === 'auto' ? '' : r.flex ? `${r.part}` : `${r.part}/${r.of}`
export const reelTag = (P, it) => { const r = it.reel; return !r ? P.reelName : r.flex === 'auto' ? `${P.reelName} · backend decides how many` : r.flex === 'max' ? `${P.reelName} ${r.part} (up to ${r.max})` : `${P.reelName} ${r.part}/${r.of}` }
export const partText = r => `Part ${r?.flex ? r.part : `${r?.part}/${r?.of}`}`
export const sourceNote = r => !r ? '' : r.source === 'parts' ? ' · from chosen parts' : r.source === 'auto' ? ' · backend picks the moments' : ''

export const SOCIAL_DEFAULTS = {
  timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi' } catch { return 'Asia/Karachi' } })(),
  accounts: {
    youtube: { refresh_token: '', channel_id: '', channel_title: '', connected_at: '' },
    // Each platform has its own Buffer key. One Buffer account for both? Paste the same key in both fields.
    // (api_key / organization_id directly on buffer = old single-key config; still honoured as a fallback.)
    buffer: { api_key: '', organization_id: '', connected_at: '',
      facebook: { api_key: '', organization_id: '', connected_at: '' },
      tiktok: { api_key: '', organization_id: '', connected_at: '' },
      instagram: { api_key: '', organization_id: '', connected_at: '' } },
  },
  reels: { count: 4, countMode: 'exact', source: 'whole', cut: 'equal', fit: 'blur', partLabel: true },   // how a video is divided; the planner starts from these
  platforms: {
    youtube: { privacy: 'public', category: '27', madeForKids: false, tags: '', hashtags: '#shorts',
      videoTitle: '{title}', videoDescription: '{description}', reelTitle: '{title} (Part {part}/{parts})', reelDescription: '{title}\n\n{hashtags}' },
    // Facebook Page: a complete video and a reel each get their own caption. channel_id = the Page's Buffer channel.
    facebook: { channel_id: '', channel_name: '', hashtags: '', videoCaption: '{title}\n\n{description}\n\n{hashtags}', reelCaption: '{title} (Part {part}/{parts})\n\n{hashtags}' },
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
    aspect: normAspect(r.aspect) || normAspect(d.cfg.aspect) || '16:9',   // shape of the finished video (used by the review preview)
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

const captionOf = (pc, kind) => (kind === 'video' ? pc.videoCaption : pc.reelCaption) ?? pc.caption ?? ''

function makeItem(platform, kind, v, cfg, reel) {
  const pc = cfg.platforms[platform], isYt = platform === 'youtube', P = platformOf(platform)
  const flex = reel?.flex || ''   // '' = fixed count; 'max' = up to N; 'auto' = the backend decides
  // The total is unknown for a flexible reel, so "/{parts}" is dropped. With 'auto' the backend also fills in {part}.
  const T = s => flex ? String(s || '').replace(/\s*\/\s*\{parts\}/g, '') : s
  const ctx = { title: v.title, description: v.description, project: v.single ? '' : v.project, part: flex === 'auto' ? '{part}' : reel?.part ?? '', parts: flex ? '' : reel?.of ?? '', hashtags: pc.hashtags || '' }
  return {
    id: newId(), platform, kind, order: 0, status: 'Planned', time: 'auto',   // time "auto" = the backend picks the time of day
    video: { key: v.key, project: v.project, project_id: v.projectId, single: v.single, row: v.row, title: v.title, output: v.output, file_id: v.file_id, minutes: v.minutes, language: v.language, aspect: v.aspect || '16:9' },
    reel: reel || null,
    thumbnail: P.hasVideo && kind === 'video' ? v.thumbnail : null,   // YouTube and Facebook complete videos get the thumbnail
    title: isYt ? fill(kind === 'video' ? pc.videoTitle : T(pc.reelTitle), ctx).slice(0, 100) : '',
    description: isYt ? fill(kind === 'video' ? pc.videoDescription : T(pc.reelDescription), ctx) : '',
    caption: isYt ? '' : fill(T(captionOf(pc, kind)), ctx),
    // format tells the backend what to post: "video" = a normal (landscape) video post, "reel" = a vertical reel
    publish: isYt ? { privacy: pc.privacy, category: pc.category, made_for_kids: !!pc.madeForKids, tags: csv(pc.tags) } : { via: 'buffer', channel_id: pc.channel_id || '', format: kind },
    result: { link: '', at: '', error: '', attempts: 0 }, moved_from: [],
  }
}

// How many items each platform already has on each day (a missed item no longer holds a slot).
export function loadOf(days, platform) {
  const load = {}
  Object.entries(days).forEach(([d, v]) => (v.items || []).forEach(i => { if (i.platform === platform && effStatus(i, d) !== 'Missed' && i.status !== 'Failed' && i.status !== 'Skipped') load[d] = (load[d] || 0) + 1 }))
  return load
}

// plan = { videos (in the order the user chose), start, gap, targets, reels, days }
//   Complete video (YouTube, Facebook): on its own day = start + (video number x gap) + offset.
//   Reels: one queue per platform, in the chosen order (all parts of video 1, then video 2 ...), `perDay` a day,
//   starting at start + offset and skipping days that already hold `perDay` items of that platform.
// Returns [{ date, item }] plus what was left out. Nothing is written here.
export function buildEntries({ videos, start, gap, targets, reels, cfg, existing = new Set(), days = {} }) {
  if (!validDay(start)) throw new Error('Pick a start day.')
  const entries = [], skipped = [], gapN = Math.max(0, Math.floor(+gap || 0))
  const wantVideos = PLATFORMS.filter(P => P.hasVideo && targets[tkey(P.id, 'video')]?.on)
  const wantReels = PLATFORMS.map(P => P.id).filter(p => targets[tkey(p, 'reel')]?.on)
  // manual = one reel per range you write (exact). Otherwise: which part of the video (source) and how many reels (countMode).
  const manual = reels.cut === 'manual', source = manual ? 'ranges' : (reels.source || 'whole'), countMode = manual ? 'exact' : (reels.countMode || 'exact')
  const cut = !manual && (source === 'auto' || countMode === 'auto') && reels.cut === 'equal' ? 'auto' : reels.cut   // "equal parts" needs a number and fixed parts
  let ranges = null, srcRanges = null, count = Math.max(1, Math.floor(+reels.count || 1))
  if (wantReels.length) {
    if (manual) { ranges = parseRanges(reels.manual); if (!ranges.length) throw new Error('Write at least one time range, or choose another way to cut.'); count = ranges.length }
    else {
      if (source === 'parts') { srcRanges = parseRanges(reels.sourceText); if (!srcRanges.length) throw new Error('Write the parts of the video to use (like 0:30-3:00), or choose “Whole video”.') }
      if (countMode !== 'auto' && count > 60) throw new Error('That is a lot of reels for one video. Use 60 or fewer.')
    }
  }
  const flex = countMode === 'exact' ? '' : countMode, slots = flex === 'auto' ? 1 : count   // 'auto': one batch per video, the backend splits it
  const lane = {}   // per platform: where its reel queue stands
  wantReels.forEach(p => { const t = targets[tkey(p, 'reel')]; lane[p] = { day: addDays(start, Math.max(0, Math.floor(+t.offset || 0))), per: Math.max(1, Math.floor(+t.perDay || 1)), load: loadOf(days, p) } })
  const put = (date, item) => { const k = dupKey(item); if (existing.has(k)) { skipped.push(item); return false } existing.add(k); entries.push({ date, item }); return true }
  videos.forEach((v, vi) => {
    wantVideos.forEach(P => put(addDays(start, vi * gapN + Math.max(0, Math.floor(+targets[tkey(P.id, 'video')].offset || 0))), makeItem(P.id, 'video', v, cfg, null)))
    wantReels.forEach(p => {
      const L = lane[p]
      for (let n = 1; n <= slots; n++) {
        const reel = { part: n, of: flex === 'auto' ? null : count, flex, max: flex === 'max' ? count : null, per_day: L.per, source, source_sec: srcRanges, cut, fit: reels.fit, part_label: !!reels.partLabel, range_sec: ranges ? ranges[n - 1] : null }
        const item = makeItem(p, 'reel', v, cfg, reel)
        if (existing.has(dupKey(item))) { skipped.push(item); continue }
        while ((L.load[L.day] || 0) >= L.per) L.day = addDays(L.day, 1)
        put(L.day, item); L.load[L.day] = (L.load[L.day] || 0) + 1
      }
    })
  })
  return { entries, skipped, count: slots }
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
  entries.filter(e => e.item.status !== 'Skipped').forEach(e => { const k = `${e.item.platform}:${e.item.kind}`; (g[k] ||= []).push(e) })
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


// ---------------------------------------------------------------- review before upload (pure helpers)
// Limits that the platforms really enforce. Everything else is only advice.
export const LIMITS = { ytTitle: 100, ytDesc: 5000, ytTags: 500, igCaption: 2200, igTags: 30, ttCaption: 2200 }
export const hashtagsIn = s => String(s || '').match(/#[\p{L}\p{N}_]+/gu) || []
// YouTube counts the tag text, the commas between tags and a pair of quotes around tags that hold a space
export const tagChars = tags => (tags || []).reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, (tags || []).length - 1)
export const arOf = a => { const [w, h] = String(a || '16:9').split(':').map(Number); return w > 0 && h > 0 ? w / h : 16 / 9 }

// Apply the fields the user edited in the review window. Only edited fields are in a patch, so a later change of
// the planner settings (reel count, ...) is not overwritten by stale copies of untouched fields.
export const applyPatch = (it, p) => ({
  ...it, ...p, edited: true,
  publish: { ...it.publish, ...(p.publish || {}) },
  reel: p.reel ? { ...(it.reel || {}), ...p.reel } : it.reel,
  thumbnail: p.thumbnail !== undefined ? p.thumbnail : it.thumbnail,
})

// A list of {level: ok | info | warn | bad, text}. "bad" = will fail or is wrong, "warn" = worth a look.
export function checkItem(it, { connected = true, date = '', today = todayISO() } = {}) {
  const out = [], add = (level, text) => out.push({ level, text }), P = platformOf(it.platform), yt = it.platform === 'youtube', reel = it.kind === 'reel'
  it.video?.output ? add('ok', 'The finished video file is linked.') : add('bad', 'The finished video has no output file, so there is nothing to upload.')
  connected ? add('ok', `${P.name} is connected.`) : add('warn', `${P.name} is not connected yet (see Setup). This item waits until it is.`)
  if (date) date < today ? add('bad', `The day (${shortDay(date)}) has passed. Give it a new day.`) : add('ok', `Goes out on ${niceDay(date)}. The backend picks the time.`)
  if (yt) {
    const t = (it.title || '').trim(), d = it.description || '', tags = it.publish?.tags || []
    if (!t) add('bad', 'The title is empty.'); else if (t.length > LIMITS.ytTitle) add('bad', `The title is ${t.length} characters. YouTube allows ${LIMITS.ytTitle}.`); else add('ok', `Title: ${t.length}/${LIMITS.ytTitle} characters.`)
    if (d.length > LIMITS.ytDesc) add('bad', `The description is ${d.length} characters. YouTube allows ${LIMITS.ytDesc}.`); else if (!d.trim()) add('warn', 'The description is empty. A few lines help people and search find the video.'); else add('ok', `Description: ${d.length}/${LIMITS.ytDesc} characters.`)
    if (tagChars(tags) > LIMITS.ytTags) add('bad', `The tags are ${tagChars(tags)} characters. YouTube allows ${LIMITS.ytTags} in total.`); else if (!tags.length) add('warn', 'No tags. They help YouTube understand the topic.'); else add('ok', `${tags.length} tag${tags.length > 1 ? 's' : ''} (${tagChars(tags)}/${LIMITS.ytTags} characters).`)
    if (reel && !/#shorts/i.test([t, d, ...tags].join(' '))) add('warn', 'No #shorts in the title or description. It is the clearest signal that this is a Short.')
    const pv = it.publish?.privacy
    add(pv === 'public' ? 'info' : 'warn', pv === 'public' ? 'Visibility is Public. If the Google project has not passed YouTube’s API audit, YouTube may still make it Private.' : `Visibility is ${pv}. Nobody will see it until you change that on YouTube.`)
    add('info', it.publish?.made_for_kids ? 'Declared as made for kids: YouTube turns comments and some features off.' : 'Declared as not made for kids.')
  } else {
    const c = it.caption || '', tags = hashtagsIn(c)
    if (!c.trim()) add('warn', 'The caption is empty.'); else add('ok', `Caption: ${c.length} characters${tags.length ? `, ${tags.length} hashtag${tags.length > 1 ? 's' : ''}` : ''}.`)
    if (it.platform === 'instagram') { if (c.length > LIMITS.igCaption) add('bad', `The caption is ${c.length} characters. Instagram allows ${LIMITS.igCaption}.`); if (tags.length > LIMITS.igTags) add('bad', `${tags.length} hashtags. Instagram allows ${LIMITS.igTags}.`) }
    if (it.platform === 'tiktok' && c.length > LIMITS.ttCaption) add('bad', `The caption is ${c.length} characters. Keep TikTok captions under ${LIMITS.ttCaption}.`)
    if (!it.publish?.channel_id) add('warn', `No ${P.id === 'facebook' ? 'Page' : 'channel'} is chosen for ${P.name} (see Setup).`)
  }
  if (P.hasVideo && it.kind === 'video') {
    const th = it.thumbnail
    if (!th) add('warn', 'No thumbnail.'); else if (th.source === 'plain_background') add('warn', 'The project has no thumbnail template, so the thumbnail is a plain background with the title.'); else add('ok', th.source === 'video' ? 'This video has its own thumbnail.' : 'The thumbnail is made from the project template.')
    if (yt && th) add('info', 'YouTube accepts custom thumbnails only on verified channels (phone verification).')
  }
  if (reel && it.reel) {
    const r = it.reel, span = r.range_sec ? r.range_sec[1] - r.range_sec[0] : r.source_sec?.length ? r.source_sec.reduce((a, [s, e]) => a + e - s, 0) : r.source === 'auto' ? 0 : (it.video?.minutes || 0) * 60
    const sec = Math.round(r.range_sec ? span : r.flex === 'auto' || !r.of ? 0 : span / r.of)
    if (r.flex === 'auto') add('info', 'The backend decides how many reels this video gives and how long each one is.')
    else if (r.flex === 'max') add('info', `Up to ${r.max} reels. The backend makes only as many as the video needs; the slots it does not use are marked Skipped.`)
    if (r.source === 'auto') add('info', 'The backend picks the moments of the video itself.')
    if (sec > 90) add('warn', `About ${sec} seconds. That is long for a reel; more parts make shorter reels.`); else if (sec) add('ok', `About ${sec} seconds per reel.`)
    if (arOf(it.video?.aspect) > 1.2 && it.reel.fit === 'crop') add('info', 'A wide video cropped to vertical loses about two thirds of the picture. “Blurred background” keeps all of it.')
  }
  return out
}
export const issuesOf = list => list.filter(x => x.level === 'bad' || x.level === 'warn')
