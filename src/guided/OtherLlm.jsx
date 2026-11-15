import { useMemo, useState } from 'react'
import { buildCodePrompt, validateTsx } from '../engine/visual.js'
import { extractCode } from '../engine/gemini.js'
import { CopyButton, FocusModal } from './Focus.jsx'
import { FPS, tailOf, voiceSec } from './model.js'

// "Create this visual with another AI": one complete, copy-and-paste brief for ChatGPT, Claude, Gemini or any other chat AI,
// then a place to paste its reply back, check it, and use it. The rules are the SAME ones the built-in generator uses.
const AIS = [
  ['ChatGPT', 'https://chatgpt.com', 'Do NOT use Canvas, a file or a download. Reply with the code in a normal ```tsx code block in the chat.'],
  ['Claude', 'https://claude.ai', 'Do NOT create an artifact or a file. Reply with the code in a normal ```tsx code block in the chat.'],
  ['Gemini', 'https://gemini.google.com', 'Do NOT use Canvas or a file. Reply with the code in a normal ```tsx code block in the chat.'],
  ['Any other AI', '', 'Reply with the code in a normal ```tsx code block in the chat.'],
]
const SKELETON = `import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

export default function Scene() {
  const frame = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const unit = Math.min(width, height) / 100            // size everything from this, never in fixed pixels
  const at = (sec: number) => Math.round(sec * fps)     // seconds -> frames
  const pop = (sec: number) => spring({ frame: frame - at(sec), fps, config: { damping: 14 } })   // 0 -> 1 when "sec" arrives
  const fade = (sec: number) => interpolate(frame, [at(sec), at(sec) + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const drift = Math.sin(frame / 25) * unit * 0.6       // ambient motion so the picture never freezes

  return (
    <AbsoluteFill style={{ background: '#0e1024', fontFamily: 'system-ui, sans-serif' }}>
      {/* 1) draw the ONE main picture with <svg> shapes, 2) reveal each part with pop(at_sec) / fade(at_sec) */}
      <svg width={width} height={height} viewBox={\`0 0 \${width} \${height}\`}>
        <circle cx={width / 2} cy={height * 0.42 + drift} r={unit * 10 * pop(0.4)} fill="#5873f2" />
      </svg>
      {/* keep the bottom 18% of the frame EMPTY: captions are added there */}
    </AbsoluteFill>
  )
}`
const clock = n => `${(+n || 0).toFixed(1)}s`
const text = x => (typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x))

export const cleanSpec = (scene, secs) => ({
  heading: scene.heading, idea: scene.idea, kind: scene.visual?.kind || scene.kind || undefined, narration: scene.narration, seconds: +secs.toFixed(2),
  sentences: (scene.voice?.timeline || []).map(t => ({ i: t.i, start: +(+t.start).toFixed(2), end: +(+t.end).toFixed(2), text: t.text })),
  big_idea: scene.visual?.bigIdea || undefined, metaphor: scene.visual?.metaphor || undefined, visuals: scene.visual?.visuals?.length ? scene.visual.visuals : undefined,
  steps: scene.visual?.steps?.length ? scene.visual.steps.map(x => ({ sentence: x.sentence, at_sec: x.at_sec, max_run: x.max_run, action: x.action })) : undefined,
})

export function buildBrief(session, scene, { ai = AIS[0], note = '' } = {}) {
  const st = session.settings, cfg = { ...st, look: session.blueprint?.plan?.look }, secs = voiceSec(scene, st), tail = tailOf(scene), total = secs + tail, frames = Math.max(FPS, Math.round(total * FPS)), spec = cleanSpec(scene, secs)
  const rtl = st.screen_language === 'ur', v = scene.visual || {}
  const lines = (scene.voice?.timeline || []).map(t => ` #${t.i}  ${clock(t.start)} → ${clock(t.end)}  (frames ${Math.round(t.start * FPS)}–${Math.round(t.end * FPS)})  "${t.text}"`).join('\n') || ' (no timeline yet: spread the reveals evenly over the length)'
  const steps = (v.steps || []).map((x, i) => ` ${i + 1}. at ${clock(x.at_sec)} (frame ${Math.round((+x.at_sec || 0) * FPS)}, sentence #${x.sentence ?? '?'}): ${text(x.action)}`).join('\n')
  const visuals = (v.visuals || []).map(x => ` • ${x?.type ? `${x.type}: ` : ''}${text(x?.description ?? x)}`).join('\n')
  return `You are a senior motion-graphics engineer who writes Remotion (React) scenes for narrated explainer videos.

██ YOUR TASK
Write ONE complete Remotion scene as a SINGLE TSX file for the scene described below. I will paste your code straight into my video tool and it must run WITHOUT ANY EDITS. If you are unsure about something, choose the simplest safe option instead of asking me questions.

██ HOW YOUR CODE IS USED
• It is previewed in a sandbox and later rendered to video at ${FPS} fps. It plays while a narrator reads the script below, so the animation must be TIMED to the narration.
• The sandbox has NO internet, NO images, NO audio, NO extra packages. Anything outside the rules below will be rejected.

██ THIS SCENE
Title: ${scene.heading || '(untitled)'}
Idea: ${scene.idea || '(none given, derive it from the narration)'}${v.kind || scene.kind ? `\nType of picture: ${v.kind || scene.kind}` : ''}
Aspect ratio: ${st.aspect || '16:9'}  (the real size comes from useVideoConfig(), so the scene must adapt to 16:9, 9:16, 1:1 and 4:5)
Length: ${total.toFixed(2)} s = ${frames} frames  (voice ${secs.toFixed(2)} s + ${tail.toFixed(1)} s of calm ending)
On-screen text language: ${rtl ? 'Urdu (right-to-left)' : 'English'}
Narration, word for word:
"""
${scene.narration}
"""
Spoken sentences and WHEN they are spoken (reveal each idea exactly when the narrator says it, never earlier):
${lines}
${v.bigIdea ? `\nThe ONE thing the viewer must remember: ${v.bigIdea}` : ''}${v.metaphor ? `\nPicture / metaphor to draw: ${v.metaphor}` : ''}${visuals ? `\nThings to show:\n${visuals}` : ''}${steps ? `\nPlanned animation steps (follow them):\n${steps}` : ''}${session.blueprint?.plan?.look ? `\nShared look (use EXACTLY these colours so all scenes match): ${JSON.stringify(session.blueprint.plan.look)}` : ''}

██ THE RULES (same rules my own generator uses)
${buildCodePrompt(cfg, spec, { note })}

██ HARD "DO NOT" LIST (the sandbox rejects the file if any of these appear)
× any import other than: react, remotion, @remotion/shapes, @remotion/paths     × props or a default parameter on Scene
× <Img>, <Audio>, <Video>, <OffthreadVideo>, staticFile()                        × fetch, XMLHttpRequest, WebSocket, Workers
× http:// or https:// anywhere (even in comments or SVG xmlns)                    × require(), import(), eval(), new Function
× localStorage, sessionStorage, document.cookie, window.open, location           × <script>, <iframe>, dangerouslySetInnerHTML
× @import or url(...) in CSS, external fonts                                      × Math.random() (use frame-based maths so every render is identical)
The file MUST contain: \`export default function Scene()\` and \`useCurrentFrame()\`.

██ A VALID STARTING POINT (replace the drawing, keep the structure)
\`\`\`tsx
${SKELETON}
\`\`\`

██ CHECK YOURSELF BEFORE ANSWERING
☐ Imports only from the allowed list     ☐ export default function Scene() with no props
☐ Every reveal happens at the time its sentence is spoken (frame = seconds × ${FPS})
☐ Bottom 18% of the frame is empty        ☐ Text is short (max 12 words visible at once) and large
☐ The picture keeps moving gently until the last frame, nothing freezes
☐ Works in 16:9 AND 9:16 (sizes come from useVideoConfig, nothing hard-coded in px)

██ HOW TO ANSWER
${ai[2]}
Give ONLY the code: no explanation before or after, no second version, no placeholders like "..." or "// rest of code".
${note ? `\n██ EXTRA INSTRUCTION FROM ME\n${note}\n` : ''}`
}

async function compileCheck(code) { try { const { transform } = await import('sucrase'); transform(code, { transforms: ['typescript', 'jsx', 'imports'], production: true }); return '' } catch (e) { return `Syntax error: ${e.message}` } }

export default function OtherLlm({ session, scene, pl, onClose }) {
  const [ai, setAi] = useState(AIS[0]), [note, setNote] = useState(''), [reply, setReply] = useState(''), [result, setResult] = useState(null), [busy, setBusy] = useState(false)
  const brief = useMemo(() => buildBrief(session, scene, { ai, note }), [session.settings, session.blueprint?.plan?.look, scene, ai, note])
  const code = useMemo(() => (reply.trim() ? extractCode(reply) : ''), [reply])
  const check = async () => { setResult(null); if (!code) return setResult({ bad: 'Paste the AI reply first.' }); const bad = validateTsx(code) || (await compileCheck(code)); setResult(bad ? { bad } : { ok: true }) }
  const fixAsk = result?.bad ? `Your code was rejected by my tool with this error:\n${result.bad}\n\nPlease fix it and send the COMPLETE corrected file again (not a diff, not a snippet). Obey every rule from my first message: allowed imports only, export default function Scene(), useCurrentFrame(), no network, no images, no Math.random(). Reply with ONE \`\`\`tsx code block and nothing else.\n\nYour previous code:\n\`\`\`tsx\n${code}\n\`\`\`` : ''
  const use = async () => { setBusy(true); try { const bad = validateTsx(code) || (await compileCheck(code)); if (bad) { setResult({ bad }); return } await pl.saveVisualCode(scene.id, code, { engine: 'own', sourceName: 'from-other-ai.tsx' }); onClose(true) } catch (e) { setResult({ bad: e.message }) } finally { setBusy(false) } }
  return <FocusModal title={`Create this visual with another AI · ${scene.heading || 'scene'}`} onClose={() => onClose(false)} actions={<CopyButton text={brief} label="Copy complete prompt" />}>
    <ol className="gs-steps">
      <li><b>1</b> Copy the prompt</li><li><b>2</b> Paste it in any AI chat</li><li><b>3</b> Paste the AI's code reply below</li><li><b>4</b> Check, then use it</li>
    </ol>
    <div className="gs-ai">
      <span className="muted">Which AI will you use?</span>
      {AIS.map(x => <button key={x[0]} className={`ghost sm${ai[0] === x[0] ? ' on' : ''}`} onClick={() => setAi(x)}>{x[0]}</button>)}
      {ai[1] && <a className="ghost sm" href={ai[1]} target="_blank" rel="noopener noreferrer">Open {ai[0]} ↗</a>}
    </div>
    <label>Anything extra you want? <small className="muted">(optional, goes into the prompt)</small><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. use a bigger diagram, add a glowing arrow, calmer colours" /></label>
    <div className="row tight"><b>The complete prompt</b><small className="muted">{brief.length.toLocaleString()} characters · it already contains your narration, timing, plan, rules and a working code skeleton</small><span className="gs-sp" /><CopyButton text={brief} label="Copy complete prompt" /></div>
    <pre className="gs-prompt">{brief}</pre>
    <hr />
    <h3>Paste the AI's reply here</h3>
    <textarea className="gs-paste" rows={8} spellCheck="false" value={reply} onChange={e => { setReply(e.target.value); setResult(null) }} placeholder="Paste the whole reply. It is fine if it has text around the code: only the code block is used." />
    <div className="row tight"><button className="cta sm" disabled={!reply.trim() || busy} onClick={check}>Check the code</button>
      <button className="cta sm" disabled={!reply.trim() || busy || result?.bad} onClick={use}>{busy ? 'Saving…' : 'Use this visual'}</button>
      {code && <small className="muted">{code.split('\n').length} lines of code found</small>}</div>
    {result?.ok && <p className="ok">✓ The code passes every check. Press “Use this visual”: it is saved to Drive and plays in the preview.</p>}
    {result?.bad && <div className="err">{result.bad}{fixAsk && <div className="row tight" style={{ marginTop: 8 }}><span>Not working? Send this back to the same AI chat:</span><CopyButton text={fixAsk} label="Copy fix request" /></div>}</div>}
  </FocusModal>
}
