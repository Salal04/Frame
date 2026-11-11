const SETUP = '/Frame-AI-Setup-Guide.pdf'
const USAGE = '/Frame_AI_Usage_Guide_EN.pdf'

const DOCS = [
  ['Setup Guide', 'First time here? Gemini keys, GitHub copy, secrets, Buffer and troubleshooting.', SETUP],
  ['Usage Guide', 'Every screen, option, sheet column and Extra Config field, plus fixes for common problems.', USAGE],
]

const QUICK = [
  ['Make my first video', USAGE + '#page=35'],
  ['Sheet columns', USAGE + '#page=19'],
  ['Extra Config (JSON)', USAGE + '#page=31'],
  ['Common problems', USAGE + '#page=33'],
  ['Connect Buffer', SETUP + '#page=7'],
  ['Setup troubleshooting', SETUP + '#page=8'],
]

export default function Guide() {
  return <main className="page">
    <h2>Guides</h2>
    <p className="muted">New here? Read the Setup Guide first, then keep the Usage Guide open while you work.</p>
    <section id="guided"><h3>Guided builder</h3><p className="muted">Auto mode sends a prompt, script, or source to the backend. Guided mode builds the script, voice, and scene draft in your browser for review. When every scene is approved, Finish sends a Render Map and Drive asset links to the backend; the backend renders the final video and updates the row to Completed or Failed.</p><p className="muted">Use a recent Chrome or Edge for the sandboxed draft preview. Keep the tab in the foreground while reviewing animations. The final-quality render runs on the backend and does not depend on the browser staying open.</p></section>
    <div className="cards">
      {DOCS.map(([title, text, url]) => <div className="card" key={url}>
        <h3>{title}</h3>
        <p className="muted">{text}</p>
        <div className="row">
          <a className="cta sm" href={url} target="_blank" rel="noreferrer">Open</a>
          <a className="ghost" href={url} download>Download</a>
        </div>
      </div>)}
    </div>
    <h3>Jump straight to</h3>
    <div className="row">
      {QUICK.map(([label, url]) => <a key={label} className="ghost" href={url} target="_blank" rel="noreferrer">{label}</a>)}
    </div>
  </main>
}
