import { VIS_SOURCES, VIS_EFFECTS, parseVisuals, stringifyVisuals, visualMix } from './config.js'

// What the backend should SHOW in the summary video. Pictures and clips both come out of the source video (nothing is taken from the web).
// Turn on one or more sources; with two or more you choose the ratio between them. Saved as "Visuals (JSON)", sent as config.visuals.
export default function Visuals({ e, setE }) {
  const v = parseVisuals(e.visuals), mix = visualMix(v), on = VIS_SOURCES.filter(([k]) => v[k].enabled), name = Object.fromEntries(VIS_SOURCES)
  const set = (k, patch) => setE(c => { const x = parseVisuals(c.visuals); return { ...c, visuals: stringifyVisuals({ ...x, [k]: { ...x[k], ...patch } }) } })
  const toggleFx = t => set('effects', { types: v.effects.types.includes(t) ? v.effects.types.filter(x => x !== t) : [...v.effects.types, t] })
  const two = on.length === 2 ? on.map(x => x[0]) : null
  const short = { clips: 'Clips', images: 'Images', remotion: 'Remotion' }
  return <div className="vis wide"><h4>What should the summary show?</h4>
    <fieldset className="trimbox">
      <label className="chk"><input type="checkbox" checked={v.clips.enabled} onChange={ev => set('clips', { enabled: ev.target.checked })} /><b>{name.clips}</b></label>
      {v.clips.enabled && <div className="cols">
        <label>Shortest clip (seconds)<input type="number" min="0.5" max="120" step="0.5" value={v.clips.min_sec} onChange={ev => set('clips', { min_sec: ev.target.value })} /></label>
        <label>Longest clip (seconds)<input type="number" min="0.5" max="120" step="0.5" value={v.clips.max_sec} onChange={ev => set('clips', { max_sec: ev.target.value })} /></label>
        <label>How many clips (0 = Frame decides)<input type="number" min="0" max="500" value={v.clips.count} onChange={ev => set('clips', { count: ev.target.value })} /></label>
        <small className="hint">Cut from the chosen part of the video, each between {v.clips.min_sec} and {v.clips.max_sec} seconds. Any length from 0.5 to 120 seconds works.</small></div>}
      <label className="chk"><input type="checkbox" checked={v.images.enabled} onChange={ev => set('images', { enabled: ev.target.checked })} /><b>{name.images}</b></label>
      {v.images.enabled && <div className="cols">
        <label>How many pictures (0 = Frame decides)<input type="number" min="0" max="500" value={v.images.count} onChange={ev => set('images', { count: ev.target.value })} /></label>
        <label>Show each picture for (seconds)<input type="number" min="1" max="30" step="0.5" value={v.images.seconds} onChange={ev => set('images', { seconds: ev.target.value })} /></label>
        <small className="hint wide">The backend takes the best still frames out of the video itself. Nothing is downloaded from the web.</small></div>}
      <label className="chk"><input type="checkbox" checked={v.remotion.enabled} onChange={ev => set('remotion', { enabled: ev.target.checked })} /><b>{name.remotion}</b></label>
      {v.remotion.enabled && <small className="hint">Frame draws extra scenes itself (titles, diagrams, animated text) and mixes them in. Off by default.</small>}

      {on.length === 0 && <small className="hint">Nothing is ticked: the chosen part of the video is only shortened to fit the summary length{v.effects.enabled ? ', with the effects you ticked' : ''}.</small>}
      {on.length >= 2 && <div className="mix"><h4>Ratio</h4>
        <div className="mixbar" role="img" aria-label={on.map(([k]) => `${short[k]} ${mix[k]}%`).join(', ')}>{on.map(([k]) => <span key={k} className={'m-' + k} style={{ flex: Math.max(mix[k], 0.0001) }}>{mix[k] >= 12 ? `${short[k]} ${mix[k]}%` : ''}</span>)}</div>
        {two
          ? <label>{short[two[0]]} {mix[two[0]]}% ↔ {mix[two[1]]}% {short[two[1]]}<input type="range" min="0" max="100" step="5" value={mix[two[0]]} onChange={ev => { const p = +ev.target.value; set(two[0], { weight: p }); set(two[1], { weight: 100 - p }) }} aria-label="Ratio between the two sources" /></label>
          : on.map(([k]) => <label key={k}>{short[k]} <b>{mix[k]}%</b><input type="range" min="0" max="100" step="5" value={v[k].weight} onChange={ev => set(k, { weight: +ev.target.value })} /></label>)}
        <small className="hint">Share of the summary given to each source: {on.map(([k]) => `${short[k]} ${mix[k]}%`).join(' · ')}.</small></div>}

      <label className="chk"><input type="checkbox" checked={v.effects.enabled} onChange={ev => set('effects', { enabled: ev.target.checked })} /><b>Add effects</b></label>
      {v.effects.enabled && <div className="chips">{VIS_EFFECTS.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={v.effects.types.includes(k)} onChange={() => toggleFx(k)} />{l}</label>)}</div>}
    </fieldset></div>
}
