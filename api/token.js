// POST → uses the encrypted cookie to get a fresh access token from Google. 401 means "please sign in again".
import { readCookie, unseal, seal, setCookie, clearCookie, sameSite, ids } from './_session.js'
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!sameSite(req)) return res.status(403).json({ error: 'Origin not allowed' })
  const raw = readCookie(req)
  if (!raw) return res.status(401).json({ error: 'not_signed_in' })
  let refresh
  try { refresh = unseal(raw) } catch { clearCookie(res); return res.status(401).json({ error: 'not_signed_in' }) }
  const { id, secret } = ids()
  if (!id || !secret) return res.status(500).json({ error: 'Server env var missing: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET' })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refresh, client_id: id, client_secret: secret, grant_type: 'refresh_token' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (j.error === 'invalid_grant') { clearCookie(res); return res.status(401).json({ error: 'not_signed_in' }) }   // revoked in Google Account
    return res.status(502).json({ error: j.error_description || j.error || 'Google is not answering' })
  }
  setCookie(res, seal(refresh))   // slide the 180 days forward
  return res.status(200).json({ access_token: j.access_token, expires_in: j.expires_in })
}
