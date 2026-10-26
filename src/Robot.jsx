// The Frame bot. mood: idle (blinks) | wave (waves hello, used on the home page) | think (eyes scan, used while Drive works) | talk (mouth moves, used in voice preview)
export default function Robot({ mood = 'idle', size = 160 }) {
  return <svg className={`robot ${mood}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Frame AI robot">
    <defs>
      <linearGradient id="rbH" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8aa0ff" /><stop offset="1" stopColor="#4560e6" /></linearGradient>
      <linearGradient id="rbB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffc9b3" /><stop offset="1" stopColor="#ff9172" /></linearGradient>
    </defs>
    <g className="rb-shadow">
      <line x1="100" y1="34" x2="100" y2="17" stroke="#8c86ba" strokeWidth="5" strokeLinecap="round" />
      <circle className="led" cx="100" cy="12" r="8" fill="#ffd466" />
      <rect x="52" y="148" width="96" height="44" rx="22" fill="url(#rbB)" />
      <circle cx="100" cy="170" r="8" fill="#ffd466" />
      <rect className="arm l" x="12" y="74" width="24" height="44" rx="12" fill="#ffc9b3" /><rect className="arm r" x="164" y="74" width="24" height="44" rx="12" fill="#ffc9b3" />
      <rect x="28" y="34" width="144" height="116" rx="46" fill="url(#rbH)" />
    </g>
    <ellipse cx="62" cy="52" rx="26" ry="9" fill="#fff" opacity=".34" transform="rotate(-18 62 52)" />
    <rect x="46" y="56" width="108" height="68" rx="28" fill="#2a2550" />
    <rect className="eye" x="70" y="74" width="20" height="26" rx="10" fill="#2fd9ab" />
    <rect className="eye" x="110" y="74" width="20" height="26" rx="10" fill="#2fd9ab" />
    <rect className="mouth" x="88" y="108" width="24" height="6" rx="3" fill="#2fd9ab" />
  </svg>
}
