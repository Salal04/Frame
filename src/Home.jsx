import { useState, useEffect, useRef } from 'react'
import Robot from './Robot.jsx'
import { loadDraft, saveDraft, hasDraft } from './draft.js'

// The public home page: explains Frame AI, lets anyone try a playlist plan with NO login, and asks for
// Google only at the moment they press "Save to my Drive". Returning people are let straight in (see App.jsx).

const TIPS = ['Hi! I’m Frame. Tell me your playlist and I’ll get it ready.', 'No login needed to start planning.', 'Google only asks when you press Save.', 'Everything lives in your own Drive.', 'Log in once. I’ll remember you next time.']
const STEPS = [
  ['1', 'Name a playlist', 'Give your series a name. Frame makes it a folder in your Drive.', '#8aa0ff'],
  ['2', 'Drop in video ideas', 'Type one idea per video. Rough is fine, you can polish later.', '#ffb59a'],
  ['3', 'Pick voice and look', 'Choose a narrator, a thumbnail style and your brand colours.', '#7fe6c8'],
  ['4', 'Frame builds it', 'Videos get made, scheduled and posted. You stay in control.', '#ffd466'],
]
const FEATURES = [
  ['📚', 'Playlists', 'Each series gets its own folder, narrator, thumbnail style and a sheet of videos to make.', '#8aa0ff'],
  ['🎬', 'Singles', 'One-off videos with no playlist. Each stands on its own.', '#ffb59a'],
  ['🏭', 'Production', 'One plan for everything: who goes first, who pauses, how long to wait between videos.', '#7fe6c8'],
  ['✂️', 'Editor', 'Edit a finished video with tracks for video, text, logos and sound. Drag and drop.', '#ffd466'],
  ['📅', 'Social', 'Choose finished videos, the days and how each is cut into reels. Frame picks the time.', '#8aa0ff'],
  ['🎨', 'Brand kit', 'Upload your logo once. It lands on every video and every platform.', '#ffb59a'],
  ['🎞️', 'Scenes', 'Keep clips or YouTube links, and tick off the scenes each video still needs.', '#7fe6c8'],
  ['🎛️', 'Control room', 'Settings that apply to every playlist, kept private in your Drive.', '#ffd466'],
]
const STARTERS = ['AI for Beginners', 'Daily Duas', 'Bedtime Stories']
const SAMPLE_IDEAS = ['Intro: what this series is about', 'Five beginner mistakes', 'Your questions answered']

// fades each block in the first time it scrolls into view
function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null), [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return setOn(true)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.18 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={`rv ${on ? 'in' : ''} ${className}`.trim()} style={{ '--d': delay + 'ms' }}>{children}</Tag>
}

const Sparkle = ({ style }) => <i className="spark" aria-hidden="true" style={style} />

function Playground({ linked, busy, onSave }) {
  const [d, setD] = useState(loadDraft), [idea, setIdea] = useState(''), [last, setLast] = useState(-1)
  useEffect(() => { saveDraft(d) }, [d])
  const addIdea = t => { const v = (t ?? idea).trim(); if (!v) return; setD(x => ({ ...x, videos: [...x.videos, v] })); setLast(d.videos.length); setIdea('') }
  const drop = i => setD(x => ({ ...x, videos: x.videos.filter((_, j) => j !== i) }))
  const ready = d.name.trim().length > 0
  return <div className="pg">
    <div className="pg-left">
      <label>Playlist name
        <input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="e.g. AI for Beginners" maxLength={80} />
      </label>
      {!d.name && <div className="chips">{STARTERS.map(s => <button key={s} className="chip" onClick={() => setD({ ...d, name: s })}>{s}</button>)}</div>}
      <label>Video ideas
        <div className="row tight"><input value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIdea()} placeholder="Type an idea, press Enter" maxLength={140} /><button className="cta sm" onClick={() => addIdea()}>Add</button></div>
      </label>
      {!d.videos.length && <div className="chips">{SAMPLE_IDEAS.map(s => <button key={s} className="chip" onClick={() => addIdea(s)}>+ {s}</button>)}</div>}
      <button className="cta" disabled={!ready || !!busy} onClick={() => onSave(d)}>{busy || 'Save to my Google Drive'}</button>
      <small className="pg-note">{linked ? 'You are already connected, so this is one click.' : 'Google asks you to log in once, right now. After that Frame remembers you.'}{!ready && ' Name your playlist first.'}</small>
    </div>
    <div className="pg-right" aria-live="polite">
      <div className={'tape' + (ready ? ' on' : '')}>
        <span className="reel" /><span className="reel r2" />
        <b>{d.name || 'Your playlist'}</b>
        <small>{d.videos.length} {d.videos.length === 1 ? 'video' : 'videos'} · saved on this device</small>
      </div>
      <ol className="ideas">
        {d.videos.map((v, i) => <li key={i + v} className={i === last ? 'pop' : ''}><span className="num">{i + 1}</span><span>{v}</span><button className="x" aria-label={`Remove ${v}`} onClick={() => drop(i)}>×</button></li>)}
        {!d.videos.length && <li className="empty">Your ideas will pile up here.</li>}
      </ol>
      {hasDraft(d) && <button className="ghost sm" onClick={() => { setD({ name: '', videos: [] }); setLast(-1) }}>Clear</button>}
    </div>
  </div>
}

export default function Home({ onConnect, onSave, busy, err, linked, LegalLinks }) {
  const [tip, setTip] = useState(0)
  useEffect(() => { const t = setInterval(() => setTip(i => (i + 1) % TIPS.length), 3600); return () => clearInterval(t) }, [])
  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return <div className="hm">
    <header className="hm-top">
      <b className="logo"><Robot mood="idle" size={36} />Frame AI</b>
      <nav aria-label="Sections" className="hm-links"><a href="#how" onClick={go('how')}>How it works</a><a href="#inside" onClick={go('inside')}>What’s inside</a><a href="#try" onClick={go('try')}>Try it</a></nav>
      <button className="ghost sm" onClick={onConnect} disabled={!!busy}>{linked ? 'Open my studio' : 'Sign in'}</button>
    </header>

    <main>
      <section className="hm-hero">
        <div className="blobs" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" /></div>
        <Sparkle style={{ top: '14%', left: '12%' }} /><Sparkle style={{ top: '28%', right: '10%', animationDelay: '.8s' }} /><Sparkle style={{ bottom: '20%', left: '20%', animationDelay: '1.5s' }} />
        <div className="hm-bot">
          <div className="bubble" key={tip} role="status">{TIPS[tip]}</div>
          <div className="bob"><Robot mood={busy ? 'think' : 'wave'} size={210} /></div>
          <div className="shadow" aria-hidden="true" />
        </div>
        <h1>Plan a playlist. <span>Frame builds the videos.</span></h1>
        <p>Frame AI is a cosy planning studio for video creators. Write your ideas, pick a voice and a look, and everything is kept in your own Google Drive.</p>
        {linked && busy
          ? <p className="hm-welcome">Welcome back! Opening your studio…</p>
          : <div className="hm-cta"><button className="cta" onClick={go('try')}>Try it, no login</button>{linked && <button className="ghost" onClick={onConnect} disabled={!!busy}>Open my studio</button>}</div>}
        {err && <div className="err" role="alert">{err}</div>}
        <ul className="hm-trust"><li>No login to start</li><li>Log in once, never again</li><li>Your Drive, your files</li></ul>
      </section>

      <section id="how" className="hm-sec">
        <Reveal as="h2">How it works</Reveal>
        <Reveal as="p" className="hm-lead">Four small steps from a rough idea to a finished video.</Reveal>
        <div className="steps">
          {STEPS.map(([n, t, x, c], i) => <Reveal key={n} delay={i * 120} className="step"><span className="num big" style={{ '--tint': c }}>{n}</span><h3>{t}</h3><p>{x}</p></Reveal>)}
        </div>
      </section>

      <section id="inside" className="hm-sec">
        <Reveal as="h2">What’s inside</Reveal>
        <Reveal as="p" className="hm-lead">Everything a small channel needs, in one soft little studio.</Reveal>
        <div className="feats">
          {FEATURES.map(([e, t, x, c], i) => <Reveal key={t} delay={(i % 4) * 90} className="feat"><span className="ico" style={{ '--tint': c }}>{e}</span><h3>{t}</h3><p>{x}</p></Reveal>)}
        </div>
      </section>

      <section id="try" className="hm-sec">
        <Reveal as="h2">Try it right here</Reveal>
        <Reveal as="p" className="hm-lead">Build a playlist plan below. It stays in this browser. Google only comes in when you choose to save it to Drive.</Reveal>
        <Reveal><Playground linked={linked} busy={busy} onSave={onSave} /></Reveal>
        {err && <div className="err" role="alert">{err}</div>}
      </section>

      <section className="hm-sec about" aria-label="How Frame AI uses your data">
        <Reveal as="h2">What Frame AI does</Reveal>
        <p>Frame AI is a planning studio for video creators. You build playlists, write video plans, design thumbnails, keep a brand kit and schedule posts. Everything is stored in your own Google Drive and published only when you ask.</p>
        <h3>How we use your Google data</h3>
        <ul>
          <li><b>Google Drive (drive.file):</b> the app creates and edits only its own “Frame AI” folder and the files inside it. It cannot see any other file in your Drive.</li>
          <li><b>Staying signed in:</b> after you connect once, an encrypted sign-in token is kept in a private cookie in your own browser so you are not asked again. “Sign out” in the menu removes it, and so does revoking access in your Google Account.</li>
          <li><b>YouTube (optional):</b> if you press Connect YouTube, we upload the videos you scheduled to your channel and read just your channel name and ID to show which channel is linked.</li>
          <li><b>Not sold, not shared, no ads:</b> your data is never sold, never used for advertising and never used to train AI models. We keep no copy on our servers.</li>
          <li><b>You are in control:</b> delete a playlist, delete the folder, or revoke access in your Google Account at any time.</li>
        </ul>
        <p className="muted">Frame AI’s use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. YouTube features are subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a> and the <a href="http://www.google.com/policies/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
      </section>
    </main>
    <footer className="foot"><small className="consent">By connecting you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</small><LegalLinks /></footer>
  </div>
}
