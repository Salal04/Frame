// Browser audio helpers: decode, cut, peaks, and silence-based alignment (so captions and visuals follow the REAL speech, not a guess).
const AC = () => new (window.AudioContext || window.webkitAudioContext)()
export async function decode(blobOrBuffer) {
  const ac = AC()
  try { return await ac.decodeAudioData(blobOrBuffer instanceof ArrayBuffer ? blobOrBuffer.slice(0) : await blobOrBuffer.arrayBuffer()) }
  catch { throw new Error('This audio could not be read. Try a .wav, .mp3, .m4a or a fresh recording.') }
  finally { ac.close?.() }
}
export const mono = buf => { if (buf.numberOfChannels === 1) return buf.getChannelData(0); const a = buf.getChannelData(0), b = buf.getChannelData(1), out = new Float32Array(a.length); for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2; return out }
// cut [start,end] seconds out of a decoded buffer -> 24 kHz mono 16-bit WAV (what the backend and Gemini voices use)
export function sliceToWav(buf, start = 0, end = buf.duration, rate = 24000) {
  const src = mono(buf), s0 = Math.max(0, Math.floor(start * buf.sampleRate)), s1 = Math.min(src.length, Math.ceil(end * buf.sampleRate)), n = Math.max(1, Math.floor((s1 - s0) * rate / buf.sampleRate)), ratio = buf.sampleRate / rate
  const out = new DataView(new ArrayBuffer(44 + n * 2)), tag = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  tag(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); tag(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); tag(36, 'data'); out.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) { const p = s0 + i * ratio, a = Math.floor(p), f = p - a, v = (src[a] || 0) * (1 - f) + (src[Math.min(a + 1, src.length - 1)] || 0) * f; out.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true) }
  return { blob: new Blob([out.buffer], { type: 'audio/wav' }), duration: n / rate }
}
export function peaksOf(pcm, bins) { bins = Math.max(1, Math.min(bins, pcm.length)); const out = new Float32Array(bins), step = pcm.length / bins; for (let b = 0; b < bins; b++) { let m = 0; for (let i = Math.floor(b * step), e = Math.floor((b + 1) * step); i < e; i += Math.max(1, ((e - i) >> 4))) m = Math.max(m, Math.abs(pcm[i])); out[b] = Math.min(1, m) } return out }

// ---------- pure maths (no browser APIs, so it can be unit-tested) ----------
const HOP = .02
export function rmsFrames(pcm, rate) { const n = Math.max(1, Math.floor(rate * HOP)), out = new Float32Array(Math.floor(pcm.length / n)); for (let f = 0; f < out.length; f++) { let sum = 0; for (let i = f * n, e = i + n; i < e; i++) sum += pcm[i] * pcm[i]; out[f] = Math.sqrt(sum / n) } return out }
// Find where speech starts/ends and the pauses inside it.
export function speechMap(pcm, rate, { minSilence = .14 } = {}) {
  const rms = rmsFrames(pcm, rate), duration = pcm.length / rate
  if (!rms.length) return { start: 0, end: duration, silences: [], duration }
  const sorted = Float32Array.from(rms).sort(), p95 = sorted[Math.floor(sorted.length * .95)] || 0, thr = Math.max(p95 * .1, 1e-4)
  let f0 = rms.findIndex(v => v > thr), f1 = rms.length - 1 - [...rms].reverse().findIndex(v => v > thr)
  if (f0 < 0) return { start: 0, end: duration, silences: [], duration }
  const silences = []; let run = -1
  for (let f = f0; f <= f1 + 1; f++) { const quiet = f <= f1 && rms[f] <= thr; if (quiet && run < 0) run = f; if (!quiet && run >= 0) { const len = (f - run) * HOP; if (len >= minSilence) silences.push({ at: (run + (f - run) / 2) * HOP, len }); run = -1 } }
  return { start: Math.max(0, f0 * HOP - .05), end: Math.min(duration, (f1 + 1) * HOP + .08), silences, duration }
}
// weights: relative length of each piece (characters). Returns the k-1 cut times between pieces, picking real pauses closest to where the text says they should be.
export function pickCuts(map, weights) {
  const k = weights.length, total = weights.reduce((a, b) => a + b, 0) || 1, span = map.end - map.start, cuts = []; let cum = 0, prev = map.start
  for (let i = 0; i < k - 1; i++) {
    cum += weights[i]
    const want = map.start + span * cum / total, tol = Math.max(1.2, span * .18)
    let best = null, bestScore = Infinity
    for (const s of map.silences) { if (s.at <= prev + .25 || Math.abs(s.at - want) > tol) continue; const score = Math.abs(s.at - want) - 2 * s.len; if (score < bestScore) { bestScore = score; best = s.at } }
    const cut = Math.max(prev + .25, best ?? want); cuts.push(+cut.toFixed(3)); prev = cut
  }
  return cuts
}
export const splitSentences = text => String(text || '').trim().split(/(?<=[.!?۔؟…])\s+/).filter(Boolean)
export function alignTimeline(pcm, rate, text, duration) {
  const sentences = splitSentences(text); if (!sentences.length) return []
  const map = speechMap(pcm, rate), cuts = pickCuts(map, sentences.map(s => Math.max(1, s.length))), edges = [0, ...cuts, duration]
  return sentences.map((t, i) => ({ i, start: +edges[i].toFixed(3), end: +Math.max(edges[i] + .05, edges[i + 1]).toFixed(3), text: t }))
}
// one long recording -> where each scene starts and ends: [in, cut1, cut2, ..., out]
export const splitPoints = (pcm, rate, narrations) => { const map = speechMap(pcm, rate, { minSilence: .3 }); return [+map.start.toFixed(3), ...pickCuts(map, narrations.map(t => Math.max(1, String(t).length))), +map.end.toFixed(3)] }
export const trimPoints = (pcm, rate) => { const m = speechMap(pcm, rate); return [+m.start.toFixed(3), +m.end.toFixed(3)] }

// ---------- microphone ----------
export async function startMic() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone. Use Chrome, Edge or Safari over https.')
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }) } catch { throw new Error('Microphone permission was denied. Allow it in the address bar and try again.') }
  const rec = new MediaRecorder(stream), chunks = [], ac = AC(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an)
  const data = new Uint8Array(an.fftSize); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(250)
  return {
    level: () => { an.getByteTimeDomainData(data); let m = 0; for (const v of data) m = Math.max(m, Math.abs(v - 128)); return m / 128 },
    stop: () => new Promise(ok => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); ac.close?.(); ok(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) }; rec.state !== 'inactive' ? rec.stop() : rec.onstop() }),
  }
}
