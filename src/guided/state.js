export const addScene = (s, scene, at = s.scenes.length) => ({ ...s, scenes: [...s.scenes.slice(0, at), scene, ...s.scenes.slice(at)] })
export const updateScene = (s, id, patch) => ({ ...s, scenes: s.scenes.map(x => x.id === id ? { ...x, ...patch } : x) })
export const markStale = (s, id, from = 'narration') => updateScene(s, id, { narrationStatus: from === 'narration' ? 'stale' : undefined, voice: { ...(s.scenes.find(x => x.id === id)?.voice || {}), status: 'stale' }, visual: { ...(s.scenes.find(x => x.id === id)?.visual || {}), status: 'stale' } })
export const nextPending = s => s.scenes.find(x => x.voice?.status !== 'approved' || x.visual?.status !== 'approved')?.id || null
export const progress = s => ({ total: s.scenes.length, approved: s.scenes.filter(x => x.voice?.status === 'approved' && x.visual?.status === 'approved').length })
