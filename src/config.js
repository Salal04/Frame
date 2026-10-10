// Every setting lives here once: its default, which level owns it, and how the three levels merge.
//   GLOBAL  -> Drive/Frame AI Config/frame_config.json      (all playlists: keys, models, rate limits, machine)
//   PROJECT -> <playlist folder>/project_config.json        (one playlist: narrator, language, look, defaults)
//   VIDEO   -> one row of the playlist's "Playlist" sheet   (topic, minutes + optional overrides)
// Names on the right match the VideoConfig fields in config.py.

export const csv = s => (Array.isArray(s) ? s : String(s || '').split(/[\n,]/)).map(x => String(x).trim()).filter(Boolean)
export const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o)
export const setPath = (o, p, v) => { const c = structuredClone(o), ks = p.split('.'); let t = c; ks.slice(0, -1).forEach(k => { t = t[k] ??= {} }); t[ks.at(-1)] = v; return c }
export const mergeDeep = (a, b) => {
  const isO = x => x && typeof x === 'object' && !Array.isArray(x)
  if (!isO(b)) return b === undefined ? a : b
  const o = { ...a }; for (const k in b) o[k] = isO(a?.[k]) && isO(b[k]) ? mergeDeep(a[k], b[k]) : b[k]; return o
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'playlist'

// ---------------------------------------------------------------- GLOBAL
export const GLOBAL_DEFAULTS = {
  keys: { gemini: [], tts: [], cloudTts: [] },   // one key per line. tts empty = reuse the Gemini keys
  models: {                                      // order = priority (first is tried first)
    light: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'],
    medium: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
    code: ['gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'],
    tts: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
    transcription: ['gemini-3.5-transcribe', 'gemini-3.5-transcribe-live'],
  },
  limits: { rpm: 5, tts_rpm: 4, max_wait: 240, tts_group_scenes: 4, tts_group_chars: 4000, scene_batch: 4 },
  tools: { urdu_font: 'Noto Naskh Arabic', workdir: 'build', output_dir: 'output', tts_cache_dir: 'tts_cache' },
}

export const GLOBAL_FIELDS = [
  ['Rate limits', [
    ['limits.rpm', 'Text requests per minute', 'number', 'Free tier. Lite models get x3 automatically.'],
    ['limits.tts_rpm', 'TTS requests per minute', 'number', ''],
    ['limits.max_wait', 'Longest quota wait (seconds)', 'number', 'Past this the run stops instead of sleeping.'],
    ['limits.tts_group_scenes', 'Scenes per TTS call', 'number', '1 turns batching off.'],
    ['limits.tts_group_chars', 'Characters per TTS call', 'number', ''],
    ['limits.scene_batch', 'Scenes written per Gemini call', 'number', '']]],
  ['Render machine', [
    ['tools.urdu_font', 'Urdu screen font', 'text', 'Must be installed on the machine that renders.'],
    ['tools.workdir', 'Work folder', 'text', 'Script, audio and clips while building.'],
    ['tools.output_dir', 'Output folder', 'text', 'A sub-folder per playlist is added.'],
    ['tools.tts_cache_dir', 'TTS cache folder', 'text', 'Survives deleting the work folder.']]]]

export const LIST_PATHS = ['keys.gemini', 'keys.tts', 'keys.cloudTts', 'models.light', 'models.medium', 'models.code', 'models.tts', 'models.transcription']
export const LIST_INFO = {
  'keys.gemini': ['Gemini API keys', 'One per line. Used for scripts, plans and code. Several keys multiply your free quota.'],
  'keys.tts': ['Gemini TTS keys', 'Optional. Leave empty to reuse the Gemini keys above.'],
  'keys.cloudTts': ['Cloud TTS keys', 'Optional fallback engine (Google Cloud Text-to-Speech).'],
  'models.light': ['Light models', 'Cheap JSON work: concepts and key points.'],
  'models.medium': ['Medium models', 'Animation plan and outline.'],
  'models.code': ['Code models', 'Heavy work: plan, narration and Manim code.'],
  'models.tts': ['TTS models', 'Speech models, first = first choice. A playlist can pin one for a steady voice.'],
  'models.transcription': ['Transcription models', 'Stored for later. Not passed to VideoConfig yet.'],
}

// ---------------------------------------------------------------- PROJECT (playlist)
export const LANGS = [['en', 'English'], ['ur', 'Urdu']]
export const PROJECT_DEFAULTS = {
  language: 'en', screen_language: '', audience: 'curious beginners', minutes: 3,
  voice: 'Kore', tts_style: 'calm, clear and friendly, like a good teacher', tts_engine: 'auto',
  tts_model: '', tts_strict: false, cloud_voices: '',
  scene_sec: 15, chapter_min: 2, min_steps_per_sentence: 2, max_scenes: 60, quality: 'medium', retries: 2, allow_latex: false,
  thumb: { templateId: '', templateName: '', font: 'Fredoka', size: 110, color: '#ffffff', stroke: '#2a2550', align: 'left', x: 6, y: 50, maxWidth: 58, shade: true },
}
export const PROJECT_FIELDS = [
  ['language', 'Narration language', 'select', 'Script, voice and audio.', LANGS],
  ['screen_language', 'On-screen text language', 'select', '', [['', 'Same as narration'], ...LANGS]],
  ['audience', 'Audience', 'text', 'Sets the level of the script.'],
  ['minutes', 'Default length (minutes)', 'number', 'Used when a video row leaves Minutes empty.'],
  ['scene_sec', 'Seconds per scene', 'number', 'Bigger = fewer scenes = fewer renders.'],
  ['chapter_min', 'Chapter length (minutes)', 'number', 'Only for videos longer than 4 minutes.'],
  ['min_steps_per_sentence', 'Animation steps per sentence (min)', 'number', ''],
  ['max_scenes', 'Max scenes', 'number', ''],
  ['quality', 'Render quality', 'select', '', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]],
  ['retries', 'Manim auto-repair attempts', 'number', ''],
  ['allow_latex', 'Allow LaTeX (never with Urdu screen text)', 'bool', '']]

// ---------------------------------------------------------------- narrator
export const STATUSES = ['Draft', 'Ready', 'Rendering', 'Done', 'Failed']
export const STYLE_PRESETS = [
  'calm, clear and friendly, like a good teacher', 'upbeat and energetic, like a favourite YouTube explainer',
  'warm and slow, like a bedtime storyteller', 'serious and steady, like a documentary narrator',
  'gentle and patient, for absolute beginners', 'confident and crisp, like a news anchor']
export const SAMPLE = { en: 'Hi! Today we will see how a computer learns, one small step at a time.', ur: 'آج ہم آسان الفاظ میں سمجھیں گے کہ کمپیوٹر کیسے سیکھتا ہے۔' }
// Gemini prebuilt voices: [name, tone word from Google's voice list, how it tends to sit in a lesson]
export const VOICES = [
  ['Zephyr', 'Bright', 'light and cheerful opener'], ['Puck', 'Upbeat', 'lively, keeps kids awake'], ['Charon', 'Informative', 'clear explainer, steady pace'],
  ['Kore', 'Firm', 'confident teacher'], ['Fenrir', 'Excitable', 'big-reaction hype'], ['Leda', 'Youthful', 'young, fresh classroom voice'],
  ['Orus', 'Firm', 'solid and authoritative'], ['Aoede', 'Breezy', 'relaxed and flowing'], ['Callirrhoe', 'Easy-going', 'casual chat feel'],
  ['Autonoe', 'Bright', 'clean and optimistic'], ['Enceladus', 'Breathy', 'soft, close-to-the-mic'], ['Iapetus', 'Clear', 'plain and precise'],
  ['Umbriel', 'Easy-going', 'calm and unhurried'], ['Algieba', 'Smooth', 'polished, even flow'], ['Despina', 'Smooth', 'mellow and rounded'],
  ['Erinome', 'Clear', 'crisp diction'], ['Algenib', 'Gravelly', 'textured, character voice'], ['Rasalgethi', 'Informative', 'measured lecturer'],
  ['Laomedeia', 'Upbeat', 'positive and moving'], ['Achernar', 'Soft', 'gentle, good for slow topics'], ['Alnilam', 'Firm', 'direct and decisive'],
  ['Schedar', 'Even', 'level, no surprises'], ['Gacrux', 'Mature', 'seasoned and grounded'], ['Pulcherrima', 'Forward', 'upfront and assertive'],
  ['Achird', 'Friendly', 'approachable guide'], ['Zubenelgenubi', 'Casual', 'everyday conversation'], ['Vindemiatrix', 'Gentle', 'kind, patient'],
  ['Sadachbia', 'Lively', 'animated storyteller'], ['Sadaltager', 'Knowledgeable', 'expert tone'], ['Sulafat', 'Warm', 'warm and reassuring']]
export const ttsNote = m => /lite/.test(m) ? 'Lite: lighter, bigger free daily allowance' : /preview/.test(m) ? 'Preview build: can change or disappear' : /2\.5/.test(m) ? 'Older model: safe fallback' : 'Standard flash TTS: tried first, smaller free daily allowance'

// ---------------------------------------------------------------- playlist sheet (header name -> field)
export const PLAYLIST_COLS = [
  ['#', 'order'], ['Video Title', 'title'], ['Topic / Prompt', 'topic'], ['Minutes', 'minutes'], ['Status', 'status'],
  ['Audience', 'audience'], ['Language', 'language'], ['Screen Language', 'screen_language'], ['Voice', 'voice'],
  ['Thumbnail Text', 'thumbText'], ['Thumbnail Link', 'thumbLink'], ['Extra Config (JSON)', 'extra'],
  ['Output Link', 'output'], ['Notes', 'notes'], ['Updated', 'updated']]

// ---------------------------------------------------------------- merge the three levels into one VideoConfig
export function resolveJob(g, p, v, playlist) {
  let extra = {}
  if (v.extra?.trim()) { try { extra = JSON.parse(v.extra) } catch { throw new Error(`Row ${v.row} (${v.title}): Extra Config is not valid JSON`) } }
  const pin = p.tts_model, rest = csv(g.models.tts).filter(x => x !== pin)
  const tts = p.tts_strict && pin ? [pin] : [...(pin ? [pin] : []), ...rest]   // a pinned model keeps the voice identical across the playlist
  const cfg = {
    topic: (v.topic || v.title || '').trim(), minutes: +v.minutes || +p.minutes || 3, audience: v.audience || p.audience,
    language: v.language || p.language, screen_language: v.screen_language || p.screen_language,
    voice: v.voice || p.voice, tts_style: p.tts_style, tts_engine: p.tts_engine, cloud_voices: p.cloud_voices,
    light_models: csv(g.models.light).join(','), medium_models: csv(g.models.medium).join(','), code_models: csv(g.models.code).join(','), tts_models: tts.join(','),
    rpm: +g.limits.rpm, tts_rpm: +g.limits.tts_rpm, max_wait: +g.limits.max_wait, tts_group_scenes: +g.limits.tts_group_scenes, tts_group_chars: +g.limits.tts_group_chars, scene_batch: +g.limits.scene_batch,
    scene_sec: +p.scene_sec, chapter_min: +p.chapter_min, min_steps_per_sentence: +p.min_steps_per_sentence, max_scenes: +p.max_scenes,
    quality: p.quality, retries: +p.retries, allow_latex: !!p.allow_latex,
    urdu_font: g.tools.urdu_font, workdir: g.tools.workdir, output_dir: `${g.tools.output_dir}/${slug(playlist)}`,
  }
  Object.keys(cfg).forEach(k => cfg[k] === '' && delete cfg[k])   // empty = let config.py use its own default
  return { ...cfg, ...extra }
}

export function buildJobs(g, p, playlist, rows, all = false) {
  const gem = csv(g.keys.gemini), tts = csv(g.keys.tts).length ? csv(g.keys.tts) : gem
  return {
    playlist, exported: new Date().toISOString(), keys: { gemini: gem, tts, cloudTts: csv(g.keys.cloudTts) }, tts_cache_dir: g.tools.tts_cache_dir,
    jobs: rows.filter(r => all || r.status === 'Ready').map(r => ({ row: r.row, title: r.title, config: resolveJob(g, p, r, playlist) })),
  }
}
