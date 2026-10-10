// Voice preview straight from the browser with your own Gemini key. Models are tried in order.
function wavUrl(b64, rate = 24000) {   // Gemini returns raw 16-bit mono PCM at 24 kHz
  const pcm = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), h = new DataView(new ArrayBuffer(44))
  const tag = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  tag(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); tag(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); tag(36, 'data'); h.setUint32(40, pcm.length, true)
  return URL.createObjectURL(new Blob([h.buffer, pcm], { type: 'audio/wav' }))
}

export async function previewVoice({ key, models, voice, style, text }) {
  let last
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Say this in a ${style} voice: ${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) })
      if (!r.ok) { last = new Error(`${m}: ${(await r.text()).slice(0, 160)}`); continue }
      const b64 = (await r.json()).candidates?.[0]?.content?.parts?.find(x => x.inlineData)?.inlineData?.data
      if (b64) return wavUrl(b64)
      last = new Error(`${m}: no audio came back`)
    } catch (e) { last = e }
  }
  throw last || new Error('No TTS model is listed in the Control room')
}
