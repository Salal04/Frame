import { useState, useEffect, useMemo } from 'react'
import * as G from './drive.js'
import * as S from './social.js'
import * as X from './socialPlan.js'
import { Confirm } from './Classic.jsx'
import Review, { ReviewRow, IssueChip, headline } from './SocialReview.jsx'

// Social: decide WHICH finished video goes out on WHICH day, in WHAT order, and how it is cut into reels.
// The backend reads the day file (Frame AI/Social/Days/<date>.json), picks the time of day and uploads.
const isoNow = () => new Date().toISOString()
const ready = (cfg, id) => id === 'youtube' ? !!cfg.accounts.youtube.refresh_token : !!X.bufferAccount(cfg, id).api_key && !!cfg.platforms[id].channel_id
const kindLabel = (pf, it) => it.kind === 'video' ? 'Complete video' : `${pf.reelName} ${it.reel?.part}/${it.reel?.of}`

export default function Social({ w, run, pick }) {
  const [tab, setTab] = useState('videos'), [pool, setPool] = useState(null), [days, setDays] = useState({}), [soc, setSoc] = useState(null), [needs, setNeeds] = useState([])
  const load = () => run('Reading your videos and the schedule…', async () => {
    const s = await S.loadSocial(w), [d, n, p] = await Promise.all([S.loadDays(w), S.loadNeeds(w), S.loadPool(w)])
    setSoc(s); setDays(d); setNeeds(n); setPool(p)
  })
  const reload = async () => { const [d, n] = await Promise.all([S.loadDays(w), S.loadNeeds(w)]); setDays(d); setNeeds(n) }
  const saveCfg = async cfg => { await S.saveSocial(w, soc, cfg); setSoc({ ...soc }) }
  const clear = platforms => run('Clearing the request…', async () => { await S.clearNeeds(w, needs.filter(n => platforms.includes(n.platform) || !n.platform).map(n => n.id)); setNeeds(await S.loadNeeds(w)) })
  useEffect(() => { load() }, [])
  const vids = useMemo(() => pool ? S.poolVideos(pool) : [], [pool])
  if (!soc || !pool) return <main className="page"><h2>Social</h2><p className="muted">Reading your videos and the schedule…</p></main>

  const late = id => X.itemsOf(days, id).filter(e => e.eff === 'Missed' || e.eff === 'Failed').length
  return <main className="page"><h2>Social</h2>
    <p className="muted">Pick finished videos, the order, the days and how each one is cut into reels. You choose the <b>day</b>; the backend chooses the <b>time</b>. Every day gets its own file in <b>Frame AI / Social / Days</b>, and the backend uploads whatever is planned for that date.</p>
    {needs.length > 0 && <div className="note"><b>The backend is asking for something:</b>
      {needs.map(n => <div key={n.id || n.message}>{n.platform ? `${n.platform}: ` : ''}{n.message}</div>)}
      <div className="row tight"><button className="ghost sm" onClick={() => setTab('setup')}>Open Setup</button><button className="ghost sm" onClick={() => clear(needs.map(n => n.platform))}>Dismiss</button></div></div>}
    <div className="seg tabs">{[['videos', 'Videos'], ...X.PLATFORMS.map(p => [p.id, p.name + (late(p.id) ? ` (${late(p.id)})` : '')]), ['setup', 'Setup']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'videos' && <Videos w={w} run={run} pool={pool} days={days} soc={soc} reload={reload} pick={pick} />}
    {X.PLATFORMS.map(p => tab === p.id && <Platform key={p.id} pf={p} w={w} run={run} soc={soc} days={days} reload={reload} saveCfg={saveCfg} vids={vids} goSetup={() => setTab('setup')} />)}
    {tab === 'setup' && <Setup w={w} run={run} soc={soc} saveCfg={saveCfg} clear={clear} />}
    <div className="row"><button className="ghost" onClick={() => run('Refreshing…', reload)}>Refresh schedule</button>
      <a className="ghost" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${w.social.folderId}`}>Open Social folder</a></div>
  </main>
}

// ====================================================================== VIDEOS: finished videos + planner
export function Videos({ w, run, pool, days, soc, reload, pick }) {
  const vids = useMemo(() => S.poolVideos(pool), [pool]), by = useMemo(() => X.byVideoKey(days), [days])
  const found = !!pick && vids.some(v => v.key === pick)   // a video that was just saved in the Editor arrives already ticked
  const [order, setOrder] = useState(found ? [pick] : []), [only, setOnly] = useState('open')
  const shown = vids.filter(v => only === 'all' || !(by[v.key] || []).length)
  const toggle = k => setOrder(order.includes(k) ? order.filter(x => x !== k) : [...order, k])
  const pickable = shown.filter(X.isReady)
  return <section>
    <div className="stats"><b>{vids.length}</b> finished videos <b>{vids.filter(v => (by[v.key] || []).length).length}</b> already planned <b>{vids.filter(v => !(by[v.key] || []).length).length}</b> not planned yet</div>
    <div className="row tight"><div className="seg tabs" style={{ margin: 0 }}>{[['open', 'Not planned yet'], ['all', 'All finished']].map(([k, l]) => <button key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}</div>
      <button className="ghost sm" disabled={!pickable.length} onClick={() => setOrder([...order, ...pickable.map(v => v.key).filter(k => !order.includes(k))])}>Select all shown</button>
      <button className="ghost sm" disabled={!order.length} onClick={() => setOrder([])}>Clear ({order.length})</button></div>
    {pick && found && <p className="note">Your edited video is ticked below. Choose where and when it goes out, then review the text and thumbnail before adding it to the schedule.</p>}
    {pick && !found && <p className="note">Your edited video was saved, but it is not in the list yet. Press “Refresh schedule” at the bottom, or check that it is marked Completed in its playlist.</p>}
    <p className="hint">Tick videos in the order you want them to go out. The number on each video is its place in that order.</p>
    {order.length > 0 && <Planner w={w} run={run} vids={vids} order={order} setOrder={setOrder} soc={soc} days={days} done={reload} />}
    <div className="cards one">
      {!vids.length && <p className="muted">No finished video yet. A video appears here when its status is Completed in its playlist.</p>}
      {vids.length > 0 && !shown.length && <p className="muted">Every finished video is already planned. Switch to “All finished” to see them.</p>}
      {shown.map(v => { const n = order.indexOf(v.key), list = by[v.key] || [], sum = X.summarize(list)
        return <div className="panel sv" key={v.key}>
          <input type="checkbox" aria-label={`Select ${v.title}`} checked={n >= 0} disabled={!X.isReady(v)} onChange={() => toggle(v.key)} />
          <span className="num">{n >= 0 ? n + 1 : ''}</span>
          <div className="grow"><b>{v.title}</b><br /><small className="muted">{v.single ? 'Singles' : v.project}{v.minutes ? ` · ${v.minutes} min` : ''}{v.status === 'Uploaded' ? ' · marked Uploaded' : ''}{!X.isReady(v) ? ' · no output file yet, so it cannot be planned' : ''}</small>
            {sum.length > 0 && <div className="chips-s">{sum.map(s => <span key={s.key} className={'chip-s' + (s.late ? ' late' : s.done ? ' ok' : '')}>{s.text}{s.late ? ` · ${s.late} need a new day` : ''}</span>)}</div>}</div>
        </div> })}
    </div>
  </section>
}

export function Planner({ w, run, vids, order, setOrder, soc, days, done }) {
  const cfg = soc.cfg
  const [start, setStart] = useState(X.addDays(X.todayISO(), 1)), [gap, setGap] = useState(1)
  // one target per (platform, kind): "youtube:video", "youtube:reel", "facebook:video", "facebook:reel", "tiktok:reel", "instagram:reel"
  const targetList = X.PLATFORMS.flatMap(P => [...(P.hasVideo ? [[X.tkey(P.id, 'video'), X.targetLabel(P, 'video'), false, P.id]] : []), [X.tkey(P.id, 'reel'), X.targetLabel(P, 'reel'), true, P.id]])
  const [t, setT] = useState(Object.fromEntries(targetList.map(([k, , reel]) => [k, reel ? { on: true, offset: 0, perDay: 1 } : { on: true, offset: 0 }])))
  const [rl, setRl] = useState({ ...cfg.reels, manual: '' }), [edits, setEdits] = useState({}), [rev, setRev] = useState(null), [showAll, setShowAll] = useState(false)
  const chosen = order.map(k => vids.find(v => v.key === k)).filter(Boolean)
  const res = useMemo(() => { try { return X.buildEntries({ videos: chosen, start, gap, targets: t, reels: rl, cfg, existing: X.existingKeys(days), days }) } catch (e) { return { error: e.message } } }, [order.join('|'), start, gap, t, rl, days])
  // what the user changed in the review window, kept per upload so it survives a change of the planner settings
  const final = useMemo(() => (res.entries || []).map(e => { const k = X.dupKey(e.item); return edits[k] ? { ...e, item: X.applyPatch(e.item, edits[k]) } : e }), [res, edits])
  const set = (k, patch) => setT({ ...t, [k]: { ...t[k], ...patch } })
  const move = (i, d) => { const a = [...order], j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; setOrder(a) }
  const anyReel = targetList.some(([k, , reel]) => reel && t[k].on), anyVideo = targetList.some(([k, , reel]) => !reel && t[k].on)
  const rows = targetList

  const byDay = {}; (res.entries || []).forEach(e => (byDay[e.date] ||= []).push(e.item))
  const dayList = Object.entries(byDay).sort(), warn = []
  dayList.forEach(([d, items]) => { const have = (days[d]?.items || []).filter(i => i.platform === 'youtube').length + items.filter(i => i.platform === 'youtube').length; if (have > X.YT_DAILY) warn.push(`${X.shortDay(d)} has ${have} YouTube uploads. The default YouTube API quota covers about ${X.YT_DAILY} a day, so some may fail.`) })
  ;[...new Set((res.entries || []).map(e => e.item.platform))].forEach(p => { if (!ready(cfg, p)) warn.push(`${X.platformOf(p).name} is not connected yet (see Setup). These items wait until it is.`) })
  const est = chosen[0]?.minutes && rl.cut !== 'manual' && anyReel ? Math.round(chosen[0].minutes * 60 / Math.max(1, +rl.count || 1)) : 0
  if (est > 90) warn.push(`With ${rl.count} reels, a ${chosen[0].minutes}-minute video gives about ${est} seconds each. That is long for a reel; add more parts.`)
  const tag = items => { const g = {}; items.forEach(i => { const P = X.platformOf(i.platform), k = i.kind === 'video' ? `${P.name} video` : `${P.name} ${P.reelName.toLowerCase()}`; g[k] = (g[k] || 0) + 1 }); return Object.entries(g).map(([k, n]) => `${k} ×${n}`).join(' · ') }
  const go = () => run('Writing the day files…', async () => { await S.addEntries(w, final); setOrder([]); await done() })

  return <div className="panel plan">
    <h3>Plan {chosen.length} video{chosen.length > 1 ? 's' : ''}</h3>
    <ol className="queue">{chosen.map((v, i) => <li key={v.key}><b>{v.title}</b> <span className="muted">{v.single ? 'Singles' : v.project}</span>
      <button className="ghost sm" aria-label="Move earlier" disabled={!i} onClick={() => move(i, -1)}>↑</button><button className="ghost sm" aria-label="Move later" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>↓</button>
      <button className="ghost sm" aria-label="Remove from selection" onClick={() => setOrder(order.filter(k => k !== v.key))}>×</button></li>)}</ol>

    <div className="cols"><label>First video goes out on<input type="date" value={start} min={X.todayISO()} onChange={e => setStart(e.target.value)} /></label>
      {anyVideo && <label>Days between one complete video and the next<input type="number" min="0" value={gap} onChange={e => setGap(e.target.value)} /><small className="hint">0 = all on the same day, 1 = one a day, 2 = every other day.</small></label>}</div>

    <h4>Where it goes</h4>
    {rows.map(([k, label, reel, pf]) => <div className="target" key={k}>
      <label className="chk"><input type="checkbox" checked={t[k].on} onChange={e => set(k, { on: e.target.checked })} />{label}</label>
      <span className="inl">starts +<input className="mini" type="number" min="0" value={t[k].offset} onChange={e => set(k, { offset: e.target.value })} /> day(s)</span>
      {reel && <span className="inl"><input className="mini" type="number" min="1" value={t[k].perDay} onChange={e => set(k, { perDay: e.target.value })} /> reel(s) a day</span>}
      {t[k].on && !ready(cfg, pf) && <small className="bad">not connected</small>}</div>)}
    <p className="hint">“+ days” delays that target after the start day. Reels go out in the order you chose: every reel of video 1, then video 2, and so on, the number a day that you set for each platform. Days that already hold that many are skipped. YouTube and Facebook can get the complete video and the reels; TikTok and Instagram only get reels.</p>

    {anyReel && <><h4>How to divide each video into reels</h4>
      <div className="cols">
        {rl.cut !== 'manual' && <label>Number of reels per video<input type="number" min="1" max="60" value={rl.count} onChange={e => setRl({ ...rl, count: e.target.value })} />{est > 0 && <small className="hint">About {est} seconds each for the first video.</small>}</label>}
        <label>How to cut<select value={rl.cut} onChange={e => setRl({ ...rl, cut: e.target.value })}>{X.CUTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><small className="hint">{X.CUTS.find(c => c[0] === rl.cut)[2]}</small></label>
        <label>Vertical format<select value={rl.fit} onChange={e => setRl({ ...rl, fit: e.target.value })}><option value="blur">Whole picture on a blurred background</option><option value="crop">Centre crop to fill the screen</option></select></label>
        <label className="chk"><input type="checkbox" checked={rl.partLabel} onChange={e => setRl({ ...rl, partLabel: e.target.checked })} />Show “Part 1/5” on the reel</label></div>
      {rl.cut === 'manual' && <label>Time ranges, one reel per line<textarea rows={4} spellCheck="false" value={rl.manual} placeholder={'0:00-0:45\n0:45-1:30\n1:30-2:20'} onChange={e => setRl({ ...rl, manual: e.target.value })} /><small className="hint">Minutes:seconds. The same ranges are used for every selected video, so use this for one video at a time.</small></label>}
      <p className="hint">The same cuts are used for YouTube Shorts, Facebook Reels, TikTok and Instagram. The backend reads these settings and cuts the reels itself.</p></>}

    <h4>Preview</h4>
    {res.error ? <p className="bad">{res.error}</p> : <>
      <p>{res.entries.length} upload{res.entries.length === 1 ? '' : 's'} over {dayList.length} day{dayList.length === 1 ? '' : 's'}{res.skipped.length > 0 && <span className="muted"> · {res.skipped.length} skipped because they are already planned</span>}</p>
      <div className="preview">{dayList.slice(0, 14).map(([d, items]) => <div key={d} className="prow"><b>{X.niceDay(d)}</b><span>{tag(items)}<small className="muted"> · {[...new Set(items.map(i => i.video.title))].join(', ').slice(0, 90)}</small></span></div>)}
        {dayList.length > 14 && <small className="muted">… and {dayList.length - 14} more days</small>}</div>
      {warn.map((x, i) => <p className="note" key={i}>{x}</p>)}

      <h4>Review before adding</h4>
      <p className="hint">Open an upload to read or change its title, description, tags, caption and thumbnail, and to see how it looks in every shape. Anything you change applies to that upload only.</p>
      <div className="panel">{final.slice(0, showAll ? final.length : 6).map((e, i) => <ReviewRow key={X.dupKey(e.item)} e={e} connected={ready(cfg, e.item.platform)} onOpen={() => setRev(i)} />)}
        {final.length > 6 && <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${final.length} uploads`}</button>}</div></>}
    {rev !== null && final[rev] && (() => { const e = final[rev], k = X.dupKey(e.item)
      return <Review key={k} w={w} item={e.item} date={e.date} cfg={cfg} vids={vids} connected={ready(cfg, e.item.platform)} mode="draft" nav={{ i: rev, n: final.length, go: setRev }}
        onClose={() => setRev(null)} onSave={async (patch, _day, next) => { setEdits(o => ({ ...o, [k]: patch })); setRev(next && rev < final.length - 1 ? rev + 1 : null); return '' }}
        onReset={() => { setEdits(o => { const n = { ...o }; delete n[k]; return n }); setRev(null) }} /> })()}
    <div className="row"><button className="cta sm" disabled={!!res.error || !res.entries?.length} onClick={go}>Add to schedule</button><button className="ghost" onClick={() => setOrder([])}>Cancel</button></div>
  </div>
}

// ====================================================================== ONE PLATFORM
export function Platform({ pf, w, run, soc, days, reload, saveCfg, goSetup, vids }) {
  const today = X.todayISO(), all = useMemo(() => X.itemsOf(days, pf.id), [days])
  const late = all.filter(e => e.eff === 'Missed' || e.eff === 'Failed'), up = all.filter(e => e.eff === 'Planned' || e.eff === 'Uploading'), done = all.filter(e => e.eff === 'Uploaded')
  const [bulk, setBulk] = useState({ start: today, per: 1 }), [del, setDel] = useState(null), [open, setOpen] = useState(false), [rev, setRev] = useState(null)
  const act = (msg, fn) => run(msg, async () => { await fn(); await reload() })
  const groups = {}; up.forEach(e => (groups[e.date] ||= []).push(e))
  const queue = [...late, ...up].filter(e => e.item.status !== 'Uploading'), conn = ready(soc.cfg, pf.id)   // what the review window steps through
  const review = e => setRev(queue.findIndex(x => x.item.id === e.item.id))
  return <section>
    <div className="stats"><b>{(groups[today] || []).length}</b> today <b>{up.length}</b> planned <b>{done.length}</b> uploaded <b>{late.length}</b> need a new day</div>
    {!ready(soc.cfg, pf.id) && <p className="note">{pf.name} is not connected yet, so nothing can be uploaded. Planned items wait. <button className="link" onClick={goSetup}>Connect it in Setup</button></p>}

    {late.length > 0 && <div className="panel late-box"><h3>Needs a new day ({late.length})</h3>
      <p className="muted">These were planned for a day that has passed, or the backend could not upload them. Give each one a new day, or move them all at once.</p>
      <div className="row tight"><label className="inl">New start day<input type="date" min={today} value={bulk.start} onChange={e => setBulk({ ...bulk, start: e.target.value })} /></label>
        <label className="inl"><input className="mini" type="number" min="1" value={bulk.per} onChange={e => setBulk({ ...bulk, per: e.target.value })} /> per day</label>
        <button className="cta sm" disabled={!X.validDay(bulk.start) || bulk.start < today} onClick={() => act('Rescheduling…', () => S.moveMany(w, late, days, pf.id, bulk.start, bulk.per))}>Reschedule all</button></div>
      {late.map(e => <ItemRow key={e.item.id} e={e} pf={pf} act={act} w={w} ask={setDel} review={review} conn={conn} />)}</div>}

    <h3>Coming up</h3>
    {!up.length && <p className="muted">Nothing planned. Choose finished videos in the Videos tab.</p>}
    {Object.entries(groups).sort().map(([d, list]) => <div className="panel day" key={d}>
      <div className="dayhead"><b>{X.niceDay(d)}</b><span className="chip-s">{list.length} upload{list.length > 1 ? 's' : ''}</span>{pf.id === 'youtube' && list.length > X.YT_DAILY && <span className="chip-s late">over the usual YouTube limit</span>}</div>
      {list.map((e, i) => <ItemRow key={e.item.id} e={e} pf={pf} act={act} w={w} ask={setDel} review={review} conn={conn} first={!i} last={i === list.length - 1} />)}</div>)}

    {done.length > 0 && <><h3>Uploaded</h3><div className="panel">{done.slice(-20).reverse().map(e => <small className="line" key={e.item.id}>✓ {X.shortDay(e.date)} · {kindLabel(pf, e.item)} · {e.item.video.title}{e.item.result?.link && <> · <a href={e.item.result.link} target="_blank" rel="noreferrer">open</a></>}</small>)}</div></>}

    <div className="row"><button className="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} {pf.name} settings</button></div>
    {open && <PlatformSettings pf={pf} soc={soc} run={run} saveCfg={saveCfg} />}
    {rev !== null && queue[rev] && (() => { const e = queue[rev]
      return <Review key={e.item.id} w={w} item={e.item} date={e.date} cfg={soc.cfg} vids={vids} connected={conn} mode="saved" nav={{ i: rev, n: queue.length, go: setRev }} onClose={() => setRev(null)}
        onSave={async (patch, day, next) => {
          try { await S.updateItem(w, e.date, e.item.id, patch); if (day && day !== e.date) await S.moveItem(w, e.date, e.item.id, day); await reload(); setRev(next && rev < queue.length - 1 ? rev + 1 : null); return '' } catch (er) { return er.message }
        }} /> })()}
    {del && <Confirm title={`Remove “${del.item.video.title}”?`} text={`It is taken off ${X.niceDay(del.date)} and will not be uploaded. The finished video itself stays untouched, and you can plan it again.`} yes="Remove" onYes={() => act('Removing…', async () => { await S.removeItem(w, del.date, del.item.id); setDel(null) })} onNo={() => setDel(null)} />}
  </section>
}

function ItemRow({ e, pf, act, w, ask, first, last, review, conn }) {
  const it = e.item, today = X.todayISO(), [to, setTo] = useState(e.date < today ? today : e.date), locked = it.status === 'Uploading'
  const own = it.thumbnail?.source === 'video', chk = X.checkItem(it, { connected: conn, date: e.date })
  return <div className="irow">
    <div className="grow"><span className="chip-s">{kindLabel(pf, it)}</span> <b>{it.video.title}</b>
      <br /><small className="muted">Posts as: {headline(it)}{it.edited ? ' (edited)' : ''}</small>
      <br /><small className="muted">{it.video.single ? 'Singles' : it.video.project}{it.kind === 'video' && it.thumbnail ? ` · ${own ? 'own thumbnail' : 'thumbnail made from the project template'}` : ''}{it.reel?.cut ? ` · cut: ${it.reel.cut}` : ''}</small>
      {(e.eff === 'Missed' || e.eff === 'Failed') && <small className="bad"><br />{e.eff === 'Missed' ? `Was planned for ${X.shortDay(e.date)} and did not go out.` : 'The backend could not upload this.'}{it.result?.error ? ` ${it.result.error}` : ''}</small>}
      {locked && <small className="muted"><br />Uploading now…</small>}</div>
    {!locked && <div className="acts">
      <IssueChip list={chk} /><button className="ghost sm" onClick={() => review(e)}>Review</button>
      {first !== undefined && <><button className="ghost sm" aria-label="Earlier in the day" disabled={first} onClick={() => act('Reordering…', () => S.nudge(w, e.date, it.id, -1))}>↑</button><button className="ghost sm" aria-label="Later in the day" disabled={last} onClick={() => act('Reordering…', () => S.nudge(w, e.date, it.id, 1))}>↓</button></>}
      <input type="date" min={today} value={to} onChange={ev => setTo(ev.target.value)} />
      <button className="ghost sm" disabled={!X.validDay(to) || to < today || to === e.date} onClick={() => act('Moving…', () => S.moveItem(w, e.date, it.id, to))}>Move</button>
      <button className="ghost sm danger" onClick={() => ask(e)}>Remove</button></div>}
  </div>
}

function PlatformSettings({ pf, soc, run, saveCfg }) {
  const cur = soc.cfg.platforms[pf.id], [d, setD] = useState(cur), [ok, setOk] = useState(false)
  const up = k => e => { setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setOk(false) }
  const yt = pf.id === 'youtube'
  return <div className="panel"><h3>{pf.name} settings</h3>
    <p className="hint">Words you can use: {'{title}'} {'{description}'} {'{project}'} {'{part}'} {'{parts}'} {'{hashtags}'}. Changes apply to videos you plan from now on; already planned items keep their text.</p>
    {yt ? <>
      <div className="cols"><label>Who can watch<select value={d.privacy} onChange={up('privacy')}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
        <label>Category<select value={d.category} onChange={up('category')}>{X.YT_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Tags (comma separated)<input value={d.tags} onChange={up('tags')} /></label>
        <label>Default hashtags<input value={d.hashtags} onChange={up('hashtags')} /></label></div>
      <label className="chk"><input type="checkbox" checked={!!d.madeForKids} onChange={up('madeForKids')} />These videos are made for kids (YouTube requires this to be declared)</label>
      <label>Complete video: title<input value={d.videoTitle} onChange={up('videoTitle')} /></label>
      <label>Complete video: description<textarea rows={3} value={d.videoDescription} onChange={up('videoDescription')} /></label>
      <label>Shorts: title<input value={d.reelTitle} onChange={up('reelTitle')} /></label>
      <label>Shorts: description<textarea rows={3} value={d.reelDescription} onChange={up('reelDescription')} /></label></>
      : <>
        <p className="muted">{pf.id === 'facebook' ? 'Page' : 'Channel'}: <b>{cur.channel_name || cur.channel_id || 'not chosen'}</b> (change it in Setup)</p>
        {pf.hasVideo ? <>
          <label>Complete video: caption<textarea rows={4} value={d.videoCaption} onChange={up('videoCaption')} /></label>
          <label>{pf.reelName}: caption<textarea rows={3} value={d.reelCaption} onChange={up('reelCaption')} /></label></>
          : <label>Caption<textarea rows={4} value={d.caption} onChange={up('caption')} /></label>}
        <label>Default hashtags<input value={d.hashtags} onChange={up('hashtags')} /></label></>}
    <div className="row"><button className="cta sm" onClick={() => run('Saving…', async () => { await saveCfg({ ...soc.cfg, platforms: { ...soc.cfg.platforms, [pf.id]: { ...cur, ...d } } }); setOk(true) })}>Save {pf.name} settings</button>{ok && <span className="ok">Saved</span>}</div>
  </div>
}

// ====================================================================== SETUP: accounts + defaults
export function Setup({ w, run, soc, saveCfg, clear }) {
  const cfg = soc.cfg, yt = cfg.accounts.youtube, bf = cfg.accounts.buffer
  const [show, setShow] = useState(false), [found, setFound] = useState({}), [msg, setMsg] = useState({})
  const BP = X.BUFFER_PLATFORMS.map(p => p.id)   // facebook, tiktok, instagram: each with its own Buffer key and channel
  const [keys, setKeys] = useState(Object.fromEntries(BP.map(id => [id, bf[id]?.api_key || bf.api_key || ''])))
  const [ch, setCh] = useState(Object.fromEntries(BP.map(id => [id, { id: cfg.platforms[id].channel_id, name: cfg.platforms[id].channel_name }])))
  const [tz, setTz] = useState(cfg.timezone), [rl, setRl] = useState(cfg.reels), [ok, setOk] = useState('')
  const connectYt = () => run('Connecting YouTube…', async () => {
    const j = await G.connectYouTube()
    if (!j.channel) throw new Error('That Google account has no YouTube channel. Choose the account that owns the channel, or create the channel first.')
    await saveCfg({ ...cfg, accounts: { ...cfg.accounts, youtube: { refresh_token: j.refresh_token, channel_id: j.channel.id, channel_title: j.channel.title, connected_at: isoNow() } } })
    await clear(['youtube'])
  })
  const find = slot => run('Asking Buffer for your channels…', async () => {
    setMsg(m => ({ ...m, [slot]: '' }))
    try { const f = await S.bufferChannels(keys[slot]); setFound(o => ({ ...o, [slot]: f })) } catch (e) { setFound(o => ({ ...o, [slot]: null })); setMsg(m => ({ ...m, [slot]: e.message })) }
  })
  const saveBuffer = () => run('Saving Buffer…', async () => {
    const acc = pf => ({ api_key: keys[pf].trim(), organization_id: found[pf]?.organization_id || bf[pf]?.organization_id || bf.organization_id || '', connected_at: bf[pf]?.connected_at || isoNow() })
    const buffer = { api_key: '', organization_id: '', connected_at: '', ...Object.fromEntries(BP.map(id => [id, acc(id)])) }
    await saveCfg({ ...cfg, accounts: { ...cfg.accounts, buffer },
      platforms: { ...cfg.platforms, ...Object.fromEntries(BP.map(id => [id, { ...cfg.platforms[id], channel_id: ch[id].id.trim(), channel_name: ch[id].name }])) } })
    await clear(BP); setOk('buffer')
  })
  const pick = (pf, id) => { const c = found[pf]?.channels.find(x => x.id === id); setCh({ ...ch, [pf]: { id, name: c?.name || '' } }) }
  const opts = pf => (found[pf]?.channels || []).filter(c => c.service.includes(pf))
  const keyBlock = (slot, label) => <div key={slot}>
    <label>{label}<input className={show ? '' : 'secret'} value={keys[slot]} onChange={e => setKeys({ ...keys, [slot]: e.target.value })} placeholder="Create it in Buffer: Settings, API" autoComplete="off" /></label>
    <div className="row"><button className="ghost" disabled={!keys[slot].trim()} onClick={() => find(slot)}>Find my channels</button></div>
    {msg[slot] && <p className="bad">{msg[slot]}</p>}
    {found[slot] && <p className="ok">Found {found[slot].channels.length} channel{found[slot].channels.length === 1 ? '' : 's'} in {found[slot].organization}.</p>}</div>
  const chanRow = pf => <div className="cols" key={pf}>
    <label>{X.platformOf(pf).name} {pf === 'facebook' ? 'Page' : 'channel'}{opts(pf).length > 0 && <select value={ch[pf].id} onChange={e => pick(pf, e.target.value)}><option value="">Choose…</option>{opts(pf).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</label>
    <label>{X.platformOf(pf).name} {pf === 'facebook' ? 'Page' : 'channel'} ID<input value={ch[pf].id} onChange={e => setCh({ ...ch, [pf]: { id: e.target.value, name: ch[pf].name } })} placeholder="Found with “Find my channels”, or typed" /></label></div>
  return <section>
    <p className="muted">Everything here is saved once in <b>Frame AI / Social / social_config.json</b> in your Drive, and the backend reads it from there, so you never paste it twice. That file holds logins: keep the Social folder private.</p>

    <div className="panel"><h3>YouTube</h3>
      <p>{yt.refresh_token ? <>Connected to <b>{yt.channel_title || yt.channel_id}</b>.</> : 'Not connected.'}</p>
      <div className="row"><button className="cta sm" onClick={connectYt}>{yt.refresh_token ? 'Connect a different channel' : 'Connect YouTube'}</button>
        {yt.refresh_token && <button className="ghost danger" onClick={() => run('Disconnecting…', () => saveCfg({ ...cfg, accounts: { ...cfg.accounts, youtube: { refresh_token: '', channel_id: '', channel_title: '', connected_at: '' } } }))}>Disconnect</button>}</div>
      <p className="hint">Uses YouTube’s own upload API. Before it works: turn on <b>YouTube Data API v3</b> in the same Google Cloud project and add the YouTube upload scope to the consent screen. Videos uploaded through a project that Google has not audited are forced to Private, so for public uploads apply for the YouTube API audit.</p></div>

    <div className="panel"><h3>Buffer (Facebook, TikTok and Instagram)</h3>
      <p className="hint">Each platform has its own Buffer API key. If they are all in the same Buffer account, paste the same key in each field.</p>
      {BP.map(pf => <div key={pf}><h4>{X.platformOf(pf).name}</h4>{keyBlock(pf, `${X.platformOf(pf).name} Buffer API key`)}{chanRow(pf)}</div>)}
      <label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show keys</label>
      <div className="row"><a className="ghost" target="_blank" rel="noreferrer" href="https://publish.buffer.com/settings/api">Open Buffer API settings</a>
        <button className="cta sm" disabled={!BP.some(id => keys[id].trim())} onClick={saveBuffer}>Save Buffer</button>{ok === 'buffer' && <span className="ok">Saved</span>}</div>
      <p className="hint">If “Find my channels” is blocked by the browser, open the Explorer on developers.buffer.com, list your channels there and paste the IDs. If they are different accounts, log in to each Buffer account to create its own key.</p></div>

    <div className="panel"><h3>Defaults</h3>
      <div className="cols"><label>Time zone for “day”<input value={tz} onChange={e => setTz(e.target.value)} /><small className="hint">A day file means that calendar date in this time zone, for example Asia/Karachi.</small></label>
        <label>Reels per video<input type="number" min="1" max="60" value={rl.count} onChange={e => setRl({ ...rl, count: +e.target.value || 1 })} /></label>
        <label>How to cut<select value={rl.cut === 'manual' ? 'equal' : rl.cut} onChange={e => setRl({ ...rl, cut: e.target.value })}>{X.CUTS.filter(c => c[0] !== 'manual').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Vertical format<select value={rl.fit} onChange={e => setRl({ ...rl, fit: e.target.value })}><option value="blur">Whole picture on a blurred background</option><option value="crop">Centre crop</option></select></label></div>
      <label className="chk"><input type="checkbox" checked={rl.partLabel} onChange={e => setRl({ ...rl, partLabel: e.target.checked })} />Show “Part 1/5” on reels</label>
      <div className="row"><button className="cta sm" onClick={() => run('Saving…', async () => { await saveCfg({ ...cfg, timezone: tz.trim() || cfg.timezone, reels: rl }); setOk('def') })}>Save defaults</button>{ok === 'def' && <span className="ok">Saved</span>}</div></div>
  </section>
}
