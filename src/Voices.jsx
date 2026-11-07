import VoiceLab from './VoiceLab.jsx'

// Application-level page: your own voices are made here ONCE and then chosen in any playlist (Narrator tab) or on any single video.
export default function Voices({ w, run }) {
  return <main className="page"><h2>My voices</h2>
    <p className="muted">Make a voice of your own once. It then shows up in every playlist's Narrator tab, where you only choose it.</p>
    <VoiceLab gl={w.g} run={run} />
  </main>
}
