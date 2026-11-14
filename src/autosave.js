import { useEffect, useRef, useState } from 'react'

const DB = 'frame-guided', STORE = 'sessions'
const db = () => new Promise((ok, bad) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
export const readLocal = async id => { const d = await db(); return new Promise(ok => { const r = d.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null) }) }
const writeLocal = async (id, value) => { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, id) }

// Saves the session to Drive. Fixes over the old version:
//  - a change made WHILE a save is running is no longer marked as saved (it used to be lost)
//  - flush() while a save is running waits for it and then saves again, instead of silently doing nothing
//  - the browser copy is stamped, so "unsaved work from this browser" is only offered when it is really newer
export function useAutosave(session, save, id) {
  const [state, setState] = useState('Saved'), [savedAt, setSavedAt] = useState(null)
  const latest = useRef(session), version = useRef(0), savedVersion = useRef(0), running = useRef(null), base = useRef(false)
  latest.current = session
  const flush = async (force = false, snapshot = null) => {
    while (running.current) { try { await running.current } catch { /* try again below */ } }
    if (version.current === savedVersion.current && !force) return latest.current
    const v = version.current, snap = snapshot || latest.current
    setState('Saving…')
    const job = (async () => {
      try {
        const out = await save(snap)
        savedVersion.current = Math.max(savedVersion.current, v)
        setSavedAt(new Date()); setState(version.current === v ? 'Saved' : 'Unsaved changes')
        writeLocal(id, { ...snap, _localAt: new Date().toISOString(), _clean: version.current === v }).catch(() => {})
        return out
      } catch (e) { setState('Not saved, kept on this device'); throw e }
    })()
    running.current = job
    try { return await job } finally { if (running.current === job) running.current = null }
  }
  useEffect(() => {
    if (!session?.scenes) return                       // placeholder while the session is still loading
    if (!base.current) { base.current = true; return }   // the session as first opened is the saved baseline
    version.current++; setState('Unsaved changes')
    const t = setTimeout(() => writeLocal(id, { ...session, _localAt: new Date().toISOString(), _clean: false }).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [session, id])
  useEffect(() => {
    const t = setInterval(() => flush().catch(() => {}), 45000), hidden = () => { if (document.hidden) flush().catch(() => {}) }
    const warn = e => { if (version.current !== savedVersion.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('visibilitychange', hidden); addEventListener('pagehide', hidden); addEventListener('beforeunload', warn)
    return () => { clearInterval(t); removeEventListener('visibilitychange', hidden); removeEventListener('pagehide', hidden); removeEventListener('beforeunload', warn) }
  }, [])
  return { state, savedAt, flush, markDirty: () => { version.current++; setState('Unsaved changes') }, dirty: state !== 'Saved' }
}
