import { ENGINES, engineHint, engineLabel, estimateRender } from './config.js'

// Engine choice for a playlist (project) or for one video row.
// `inherit` (rows only) = the label of the project's choice; an empty value then means "use the project's choice".
// `fixed` is true / false for the project, and '' | 'yes' | 'no' for a row ('' = follow the project).
export function EnginePicker({ engine, fixed, onEngine, onFixed, inherit, est }) {
  const row = inherit !== undefined
  const options = row ? [['', `Project default (${inherit})`], ...ENGINES.map(e => [e[0], e[1]])] : ENGINES.map(e => [e[0], e[1]])
  const shown = engine || (row ? '' : 'auto')
  const isFixed = row ? fixed === 'yes' : !!fixed
  const e = estimateRender({ ...est, engine: engine || est.engine })
  return <div className="panel engine">
    <h3>Video engine</h3>
    <p className="muted">Frame now has two engines. You decide which one builds the video, or let the AI decide.</p>
    <div className="chips" role="radiogroup" aria-label="Video engine">
      {options.map(([k, l]) => <button key={k} role="radio" aria-checked={shown === k} className={'chip' + (shown === k ? ' on' : '')} onClick={() => onEngine(k)}>{l}</button>)}
    </div>
    <small className="hint">{engineHint(engine || est.engine)}</small>
    {row
      ? <label>Fixed or flexible<select value={fixed || ''} onChange={ev => onFixed(ev.target.value)}>
          <option value="">Same as the project</option><option value="yes">Fixed: never switch engine</option><option value="no">Flexible: backend may switch if a scene fails</option></select></label>
      : <label className="chk"><input type="checkbox" checked={isFixed} onChange={ev => onFixed(ev.target.checked)} />Keep my choice fixed</label>}
    <small className="hint">{isFixed
      ? 'Fixed: the backend uses exactly this choice. If a scene cannot be made, the video is marked Failed and nothing is swapped silently.'
      : (engine || est.engine) === 'auto'
        ? 'Flexible: the AI decides scene by scene.'
        : 'Flexible: if a scene keeps failing, the backend may redo it with the other engine so the video still finishes.'}</small>
    <p className="est"><b>Estimated time:</b> {e.scenes} scenes, {e.label} to build at {est.quality} quality. <small className="muted">Rough guide; the real time depends on your render machine.</small></p>
  </div>
}

export const enginePhrase = (engine, fixed, projEngine, projFixed) => {
  const k = engine || projEngine || 'auto', f = fixed ? fixed === 'yes' : !!projFixed
  return `${engineLabel(k)}${k === 'auto' ? '' : f ? ', fixed' : ', flexible'}${engine ? ' (own)' : ' (project)'}`
}
