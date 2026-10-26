// POST   {code}  → turns the one-time Google code into a long-lived login (encrypted cookie) + the first access token.
// DELETE         → signs out (removes the cookie).
import { seal, setCookie, clearCookie, sameSite, ids, body } from './_session.js'
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!sameSite(req)) return res.status(403).json({ error: 'Origin not allowed' })
  if (req.method === 'DELETE') { clearCookie(res); return res.status(204).end() }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST or DELETE only' })
  const code = body(req).code
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Missing code' })
  const { id, secret } = ids()
  if (!id || !secret) return res.status(500).json({ error: 'Server env var missing: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (set for Production in Vercel, then redeploy)' })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return res.status(400).json({ error: j.error_description || j.error || 'Google rejected the code' })
  // Google only hands out a refresh token the first time (or on a fresh consent). The page then asks again with prompt=consent.
  if (!j.refresh_token) return res.status(409).json({ error: 'no_refresh' })
  try { setCookie(res, seal(j.refresh_token)) } catch (e) { return res.status(500).json({ error: e.message }) }
  return res.status(200).json({ access_token: j.access_token, expires_in: j.expires_in })
}
