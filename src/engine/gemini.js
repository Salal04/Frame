// Browser Gemini client. Keys stay in memory and are never sent to the sandbox/session.
export class QuotaExhausted extends Error { constructor(resetAt) { super('Gemini quota is exhausted. Try again after the reset time.'); this.resetAt = resetAt } }
export class BadOutput extends Error { constructor(message = 'Gemini returned an unusable response.') { super(message) } }
export class Aborted extends Error { constructor() { super('The request was cancelled.'); this.name = 'AbortError' } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const resetAt = () => { const d = new Date(), p = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })); p.setDate(p.getDate() + 1); p.setHours(0, 0, 5, 0); return new Date(Date.now() + Math.max(0, p - new Date(p.toLocaleString('en-US')))) }
const textOf = j => j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim()
export const extractCode = text => (String(text || '').match(/```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)```/i)?.[1] || String(text || '').replace(/^```\w*\s*|```$/g, '')).trim()
export const parseJson = text => { const raw = String(text || '').replace(/^```(?:json)?\s*|```$/gim, '').trim(), hit = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/); try { return JSON.parse(hit?.[0] || raw) } catch { throw new BadOutput('Gemini returned invalid JSON. Retry the step.') } }

export function createGemini({ keys = [], models = {}, rpm = 5, maxWait = 240 }) {
  const usable = keys.filter(Boolean), cooldown = new Map(); let cursor = 0, last = 0
  if (!usable.length) throw new BadOutput('Add a Gemini API key in Control room first.')
  const chain = task => { const tier = task === 'code' ? 'code' : task === 'tts' ? 'tts' : task === 'medium' ? 'medium' : 'light'; return Array.isArray(models[tier]) ? models[tier] : String(models[tier] || '').split(/[\n,]/).filter(Boolean) }
  const call = async (prompt, { task = 'light', signal, json = false, temperature } = {}) => {
    if (signal?.aborted) throw new Aborted()
    const list = chain(task); if (!list.length) throw new BadOutput(`No ${task} Gemini model is configured.`)
    let lastError, quota = 0
    for (const model of list) for (let tries = 0; tries < usable.length; tries++) {
      const index = (cursor++ % usable.length), key = usable[index]; if ((cooldown.get(key) || 0) > Date.now()) continue
      const gap = Math.max(0, 60000 / Math.max(1, rpm) - (Date.now() - last)); if (gap) await sleep(gap); last = Date.now()
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { ...(temperature === undefined ? {} : { temperature }), ...(json ? { responseMimeType: 'application/json' } : {}) } }) })
        const body = await r.json().catch(() => ({})); if (r.ok && textOf(body)) return textOf(body)
        lastError = new Error(`${model}: ${body?.error?.message || r.statusText}`)
        if (r.status === 429 || /quota|rate limit/i.test(lastError.message)) { cooldown.set(key, Date.now() + Math.min(maxWait, 60000)); quota++; continue }
        if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404) { cooldown.set(key, Date.now() + 300000); continue }
      } catch (e) { if (e.name === 'AbortError') throw new Aborted(); lastError = e }
    }
    if (quota >= usable.length) throw new QuotaExhausted(resetAt()); throw lastError || new BadOutput()
  }
  return { json: async (p, o = {}) => parseJson(await call(p, { ...o, json: true })), code: (p, o) => call(p, { ...o, task: 'code' }).then(extractCode), search: (p, o) => call(p, { ...o, task: 'medium' }), raw: call }
}
