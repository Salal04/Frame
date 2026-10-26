import { useMemo, useState } from 'react'
import { STATUSES } from './config.js'

// Search + filter + sort for any list of videos. Used by the playlist, the Social video picker,
// the Production record and the Editor's "choose a video" list.
//
//   const { shown, bar } = useVideoList(items, { get: x => ({ title, status, minutes, project, text }) , ... })
//
// `get` maps one list item to the plain fields the tools understand, so the same bar works for
// playlist rows, Social snapshots and { p, r } pairs.

const SORTS = [
  ['original', 'Original order'],
  ['title', 'Title'],
  ['status', 'Status'],
  ['minutes', 'Length'],
  ['project', 'Project']
]
const num = v => (Number.isFinite(+v) ? +v : 0)
const norm = s => String(s ?? '').toLowerCase()

const defaultGet = x => x

export function useVideoList(items, opts = {}) {
  const { get = defaultGet, statuses = STATUSES, withProject = true, withStatus = true, label = 'videos' } = opts
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [project, setProject] = useState('')
  const [sort, setSort] = useState('original'), [desc, setDesc] = useState(false)

  const rows = useMemo(() => items.map((item, i) => ({ item, i, f: get(item) || {} })), [items])   // eslint-disable-line react-hooks/exhaustive-deps
  const projects = useMemo(() => [...new Set(rows.map(r => r.f.project).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows])
  const sortKeys = SORTS.filter(([k]) => k !== 'project' || (withProject && projects.length > 1) )
  const stIndex = s => { const n = statuses.indexOf(s); return n < 0 ? statuses.length : n }

  const shown = useMemo(() => {
    const needle = norm(q).trim()
    let out = rows.filter(({ f }) =>
      (!status || f.status === status) &&
      (!project || f.project === project) &&
      (!needle || norm([f.title, f.project, f.text].join(' ')).includes(needle)))
    if (sort !== 'original') {
      const cmp = {
        title: (a, b) => norm(a.f.title).localeCompare(norm(b.f.title), undefined, { numeric: true }),
        status: (a, b) => stIndex(a.f.status) - stIndex(b.f.status),
        minutes: (a, b) => num(a.f.minutes) - num(b.f.minutes),
        project: (a, b) => norm(a.f.project).localeCompare(norm(b.f.project))
      }[sort]
      out = [...out].sort((a, b) => (cmp(a, b) || a.i - b.i) * (desc ? -1 : 1))   // ties keep the original order
    } else if (desc) out = [...out].reverse()
    return out.map(r => r.item)
  }, [rows, q, status, project, sort, desc])   // eslint-disable-line react-hooks/exhaustive-deps

  const present = withStatus ? statuses.filter(s => rows.some(r => r.f.status === s)) : []
  const active = !!(q || status || project || sort !== 'original' || desc)
  const filtered = !!(q || status || project)
  const reset = () => { setQ(''); setStatus(''); setProject(''); setSort('original'); setDesc(false) }

  const bar = items.length < 2 && !active ? null : <div className="ltools" role="search" aria-label={`Filter and sort ${label}`}>
    <input type="search" className="lt-q" value={q} placeholder={`Search ${label}…`} aria-label={`Search ${label}`} onChange={e => setQ(e.target.value)} />
    {withStatus && present.length > 0 && <select value={status} aria-label="Filter by status" onChange={e => setStatus(e.target.value)}>
      <option value="">All statuses</option>{present.map(s => <option key={s} value={s}>{s}</option>)}</select>}
    {withProject && projects.length > 1 && <select value={project} aria-label="Filter by project" onChange={e => setProject(e.target.value)}>
      <option value="">All projects</option>{projects.map(s => <option key={s} value={s}>{s}</option>)}</select>}
    <select value={sort} aria-label="Sort by" onChange={e => setSort(e.target.value)}>
      {sortKeys.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
    <button type="button" className="ghost sm" aria-label={desc ? 'Descending, press for ascending' : 'Ascending, press for descending'} title={desc ? 'Descending' : 'Ascending'} onClick={() => setDesc(!desc)}>{desc ? '↓ Desc' : '↑ Asc'}</button>
    {active && <button type="button" className="ghost sm" onClick={reset}>Reset</button>}
    <small className="muted lt-n" aria-live="polite">{filtered ? `${shown.length} of ${items.length}` : `${items.length}`} {label}</small>
  </div>

  return { shown, bar, filtered, reset }
}

// shared getters ------------------------------------------------------------------------------
export const rowGet = (cfg = {}, project) => r => ({ title: r.title, status: r.status, minutes: +r.minutes || +cfg.minutes || 0, project, text: [r.topic, r.description, r.notes].join(' ') })
export const snapGet = v => ({ title: v.title, status: v.status, minutes: v.minutes, project: v.single ? 'Singles' : v.project })
export const pairGet = ({ p, r }) => ({ title: r.title, status: r.status, minutes: r.minutes, project: p.name })
