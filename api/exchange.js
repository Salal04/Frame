// Vercel serverless function. Turns the one-time code from the browser into a refresh token.
// Holds the Google client secret (env var) so it never reaches a browser or a client's repository.
// Nothing is stored or logged. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, optional ALLOWED_ORIGINS (comma separated).
export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allowed.length && !allowed.includes(origin)) return res.status(403).json({ error: 'Origin not allowed' })
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = req.body && typeof req.body === 'object' ? req.body : (() => { try { return JSON.parse(req.body) || {} } catch { return {} } })()
  const code = body.code
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Missing code' })
  const id = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET
  const missing = [!id && 'GOOGLE_CLIENT_ID', !secret && 'GOOGLE_CLIENT_SECRET'].filter(Boolean)
  if (missing.length) return res.status(500).json({ error: `Server env var missing: ${missing.join(', ')} (set it for Production in Vercel, then redeploy)` })

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return res.status(400).json({ error: j.error_description || j.error || 'Google rejected the code' })
  if (!j.refresh_token) return res.status(400).json({ error: 'Google did not return a refresh token. Remove Frame AI at myaccount.google.com/permissions and connect again.' })
  // YouTube connect only: look up which channel the login belongs to, here, so the access token never reaches the browser
  let channel = null
  if (body.profile === 'youtube' && j.access_token) {
    const c = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${j.access_token}` } }).then(x => x.json()).catch(() => null)
    const it = c?.items?.[0]
    if (it) channel = { id: it.id, title: it.snippet?.title || '' }
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ refresh_token: j.refresh_token, ...(body.profile === 'youtube' ? { channel } : {}) })   // access token and client secret are never returned
}
