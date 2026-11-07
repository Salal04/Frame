import { VIS_EFFECTS, parseVisuals, stringifyVisuals } from './config.js'

// What the backend should SHOW in the summary video: clips cut from the source (any length range), images fetched from the web, effects.
// Saved with the row (column "Visuals (JSON)") and sent as config.visuals.
export default function Visuals({ e, setE }) {
  const v = parseVisuals(e.visuals), set = (k, patch) => setE(c => { const x = parseVisuals(c.visuals); return { ...c, visuals: stringifyVisuals({ ...x, [k]: { ...x[k], ...patch } }) } })
  const toggleFx = t => set('effects', { types: v.effects.types.includes(t) ? v.effects.types.filter(x => x !== t) : [...v.effects.types, t] })
  return <div className="vis wide"><h4>What should the summary show?</h4>
    <fieldset className="trimbox">
      <label className="chk"><input type="checkbox" checked={v.clips.enabled} onChange={ev => set('clips', { enabled: ev.target.checked })} /><b>Use short clips from the video</b></label>
      {v.clips.enabled && <div className="cols">
        <label>Shortest clip (seconds)<input type="number" min="0.5" max="120" step="0.5" value={v.clips.min_sec} onChange={ev => set('clips', { min_sec: ev.target.value })} /></label>
        <label>Longest clip (seconds)<input type="number" min="0.5" max="120" step="0.5" value={v.clips.max_sec} onChange={ev => set('clips', { max_sec: ev.target.value })} /></label>
        <label>How many clips (0 = Frame decides)<input type="number" min="0" max="500" value={v.clips.count} onChange={ev => set('clips', { count: ev.target.value })} /></label>
        <small className="hint">Each clip is cut from the chosen part of the video and is between {v.clips.min_sec} and {v.clips.max_sec} seconds long. Any length from 0.5 to 120 seconds works.</small></div>}
      <label className="chk"><input type="checkbox" checked={v.images.enabled} onChange={ev => set('images', { enabled: ev.target.checked })} /><b>Fetch images from the web and use them</b></label>
      {v.images.enabled && <div className="cols">
        <label>How many images (0 = Frame decides)<input type="number" min="0" max="500" value={v.images.count} onChange={ev => set('images', { count: ev.target.value })} /></label>
        <label>Show each image for (seconds)<input type="number" min="1" max="30" step="0.5" value={v.images.seconds} onChange={ev => set('images', { seconds: ev.target.value })} /></label>
        <label className="chk wide"><input type="checkbox" checked={v.images.free_license_only} onChange={ev => set('images', { free_license_only: ev.target.checked })} />Only free-to-use images (public domain / Creative Commons)</label></div>}
      <label className="chk"><input type="checkbox" checked={v.effects.enabled} onChange={ev => set('effects', { enabled: ev.target.checked })} /><b>Add effects</b></label>
      {v.effects.enabled && <div className="chips">{VIS_EFFECTS.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={v.effects.types.includes(k)} onChange={() => toggleFx(k)} />{l}</label>)}</div>}
      {!v.clips.enabled && !v.images.enabled && <small className="hint">Clips and images are both off: the chosen part of the video is only shortened to fit the summary length{v.effects.enabled ? ', with the effects you ticked' : ''}.</small>}
    </fieldset></div>
}
