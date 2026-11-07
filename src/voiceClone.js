// Make a voice of your own with Gemini voice replication (POST /v1beta/voices).
// Two real human recordings of the SAME adult speaker go to Gemini:
//   1. source  : 10-30 s of natural speech
//   2. consent : the speaker reading the consent sentence out loud (see CONSENT in config.js)
// Gemini checks the consent, keeps the voice in YOUR Gemini project and returns an ID (voice_...). Only that ID is saved by Frame.
// The recordings are converted in the browser, sent once and never written to Drive or to the sheet.
const API = 'https://generativelanguage.googleapis.com/v1beta'
export const SRC_MIN = 10, SRC_MAX = 30

// any audio the browser can play -> 24 kHz, mono, 16-bit WAV (the format Gemini recommends)
export async function toWav24k(file, maxSec) {
  const ac = new (window.AudioContext || window.webkitAudioContext)()
  let buf
  try { buf = await ac.decodeAudioData(await file.arrayBuffer()) } catch { throw new Error('This audio file could not be read. Try a .wav, .mp3, .m4a or a fresh recording.') } finally { ac.close?.() }
  const sec = Math.min(buf.duration, maxSec || buf.duration), rate = 24000, n = Math.max(1, Math.ceil(sec * rate))
  const off = new OfflineAudioContext(1, n, rate), src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0)
  const pcm = (await off.startRendering()).getChannelData(0), out = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const tag = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  tag(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); tag(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); tag(36, 'data'); out.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true)
  const blob = new Blob([out.buffer], { type: 'audio/wav' })
  return { blob, seconds: sec, fullSeconds: buf.duration, b64: await b64(blob), url: URL.createObjectURL(blob) }
}
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read the audio')); r.readAsDataURL(blob) })

export async function createVoice({ key, model, name, source, consent }) {
  if (!key) throw new Error('Add a Gemini key in the Control room first.')
  const r = await fetch(`${API}/voices`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ store: true, voice: { model, type: 'replicated', display_name: name,
      replicated: { source_audio: { mime_type: 'audio/wav', data: source.b64 }, consent_audio: { mime_type: 'audio/wav', data: consent.b64 } } } }),
  })
  const text = await r.text()
  if (!r.ok) {
    if (r.status === 403 || /billing|paid|tier/i.test(text)) throw new Error('Gemini refused: voice replication needs a Paid Tier (Tier 1 or higher) Gemini API project. ' + text.slice(0, 140))
    throw new Error(`Gemini could not make the voice (${r.status}). ${/consent|verif|speaker/i.test(text) ? 'The consent sentence or the speaker did not match: record both in the same room, same microphone, reading the sentence exactly. ' : ''}${text.slice(0, 200)}`)
  }
  let j = {}; try { j = JSON.parse(text) } catch { /* handled below */ }
  const id = j.id || String(j.name || '').split('/').pop()
  if (!/^voice_/.test(id)) throw new Error('Gemini answered without a voice ID. ' + text.slice(0, 160))
  return { id, expire: j.expire_time || j.expireTime || '' }
}
export async function deleteVoice({ key, id }) {
  const r = await fetch(`${API}/voices/${id}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } })
  if (!r.ok && r.status !== 404) throw new Error(`Gemini could not delete the voice (${r.status})`)
}
