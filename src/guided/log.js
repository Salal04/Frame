// Plain-language helpers for the Activity log.
// hintFor(): turns a raw error text into "what happened and what to do". Empty string = no advice.
export const hintFor = msg => {
  const m = String(msg || '')
  if (/failed to fetch|networkerror|network request|load failed|err_internet|offline|econn/i.test(m)) return 'Network problem: check your internet. Nothing is lost. Press Resume (or retry the step) when it is back.'
  if (/quota|429|resource.?exhaust|rate.?limit/i.test(m)) return 'Gemini limit reached (too many requests). Wait a few minutes, or add another key in Control room, then press Resume.'
  if (/api key|key not valid|no .* model is configured|add a gemini/i.test(m)) return 'The Gemini key or model is missing or wrong. Open Control room and check it.'
  if (/401|403|unauthori|permission|sign.?in|token|expired/i.test(m)) return 'Google sign-in or key problem: sign in again, or check the key in Control room.'
  if (/50[0-4]|overload|unavailable|internal error/i.test(m)) return 'Gemini is busy on its side. Frame tries again; if it keeps failing, wait a little.'
  if (/timeout|timed out/i.test(m)) return 'The request took too long. Try again.'
  if (/syntax error|rejected|forbidden import|export default|usecurrentframe/i.test(m)) return 'The AI wrote code the preview cannot run. Press Retry visual, or Fix with AI.'
  if (/drive|session asset|could not save|not saved|missing or unavailable/i.test(m)) return 'Google Drive problem. Your work is also kept in this browser. Check the connection, then press Save to Drive.'
  return ''
}
export const clock = t => new Date(t).toLocaleTimeString([], { hour12: false })
export const logText = (logs, num) => logs.map(l => `${clock(l.t)}  ${l.level.toUpperCase().padEnd(5)} ${l.scene != null && num(l.scene) ? `[scene ${num(l.scene)}] ` : ''}${l.msg}`).join('\n')
