// Shared helpers for the "log in once" cookie. The Google refresh token is encrypted (AES-256-GCM) and kept
// in an HttpOnly cookie in the user's own browser. Nothing is stored on the server. JavaScript on the page can never read it.
import crypto from 'node:crypto'
export const COOKIE = 'frame_rt', MAX_AGE = 60 * 60 * 24 * 180   // 180 days, renewed every time it is used

const key = () => {
  const s = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET
  if (!s) throw new Error('Server env var missing: GOOGLE_CLIENT_SECRET (or SESSION_SECRET)')
  return crypto.createHash('sha256').update('frame-ai-session:' + s).digest()
}
export const seal = text => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url')
}
export const unseal = blob => {
  const b = Buffer.from(blob, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}
export const readCookie = req => {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))
  return m ? m.slice(COOKIE.length + 1) : ''
}
const flags = 'Path=/api; HttpOnly; Secure; SameSite=Lax'
export const setCookie = (res, value) => res.setHeader('Set-Cookie', `${COOKIE}=${value}; ${flags}; Max-Age=${MAX_AGE}`)
export const clearCookie = res => res.setHeader('Set-Cookie', `${COOKIE}=; ${flags}; Max-Age=0`)

// Same-site requests only: the browser sends Origin on POST, and it must match this site.
export const sameSite = req => {
  const o = req.headers.origin
  if (!o) return true
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  return o === `https://${req.headers.host}` || o === `http://${req.headers.host}` || allowed.includes(o)
}
export const ids = () => ({ id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET })
export const body = req => req.body && typeof req.body === 'object' ? req.body : (() => { try { return JSON.parse(req.body) || {} } catch { return {} } })()
