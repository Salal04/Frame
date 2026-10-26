// A playlist plan that lives only in this browser until the person presses "Save to my Drive".
// No login is needed to build it; the login happens at the moment of saving, and only the very first time.
import * as P from './playlist.js'
const KEY = 'frame.draft'
export const EMPTY = { name: '', videos: [] }
export function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d.name === 'string' && Array.isArray(d.videos)) return d } catch { /* ignore */ }
  return EMPTY
}
export function saveDraft(d) { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* private mode: draft just lasts for this visit */ } }
export function clearDraft() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
export const hasDraft = d => !!(d.name.trim() || d.videos.length)

// Writes the draft into Drive: one playlist folder + sheet, and one Hold row per idea. Returns the playlist.
export async function pushDraft(w, d) {
  const p = await P.createPlaylist(w, d.name.trim() || 'My first playlist')
  await P.loadVideos(p)   // makes sure the sheet header is known before rows are added
  let n = 0
  for (const v of d.videos) { n++; await P.saveVideo(p, { order: n, title: v.trim(), topic: v.trim(), inputType: 'Prompt', status: 'Hold' }) }
  return p
}
