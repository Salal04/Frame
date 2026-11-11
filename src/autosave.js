import { useEffect, useRef, useState } from 'react'

const DB = 'frame-guided', STORE = 'sessions'
const db = () => new Promise((ok, bad) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
export const readLocal = async id => { const d = await db(); return new Promise(ok => { const r = d.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null) }) }
const writeLocal = async (id, value) => { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, id) }
export function useAutosave(session, save, id) {
  const [state, setState] = useState('Saved'), dirty = useRef(false), latest = useRef(session), busy = useRef(false); latest.current = session
  const flush = async (force = false, snapshot = null) => { if ((!dirty.current && !force) || busy.current) return; busy.current = true; setState('Saving…'); try { const next = await save(snapshot || latest.current); dirty.current = false; latest.current = next; setState('Saved'); return next } catch (e) { setState('Offline, kept on this device'); throw e } finally { busy.current = false } }
  useEffect(() => { const t = setTimeout(() => writeLocal(id, session).catch(() => {}), 300); dirty.current = true; setState('Unsaved changes'); return () => clearTimeout(t) }, [session, id])
  useEffect(() => { const t = setInterval(() => flush().catch(() => {}), 60000), hidden = () => { if (document.hidden) flush().catch(() => {}) }; addEventListener('visibilitychange', hidden); addEventListener('pagehide', hidden); const warn = e => { if (dirty.current) { e.preventDefault(); e.returnValue = '' } }; addEventListener('beforeunload', warn); return () => { clearInterval(t); removeEventListener('visibilitychange', hidden); removeEventListener('pagehide', hidden); removeEventListener('beforeunload', warn) } }, [])
  return { state, flush, markDirty: () => { dirty.current = true; setState('Unsaved changes') } }
}
