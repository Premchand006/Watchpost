import { clamp } from "../lib/format";

/* Radial gauge for CPU / memory / thermal (ported from the design reference). */
export default function Gauge({ label, value, unit, max, color }) {
  const r = 34, c = 2 * Math.PI * r, frac = clamp((value || 0) / max, 0, 1);
  return (
    <div className="gauge">
      <svg width="86" height="86" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={r} fill="none" stroke="rgba(126,162,226,.12)" strokeWidth="7" />
        <circle cx="43" cy="43" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 43 43)"
          style={{ transition: "stroke-dashoffset .6s ease", filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="43" y="40" textAnchor="middle" fill="#e8eefb" fontSize="17"
          fontFamily="Chakra Petch, sans-serif" fontWeight="700">{Math.round(value || 0)}</text>
        <text x="43" y="54" textAnchor="middle" fill="#5b6f90" fontSize="9"
          fontFamily="JetBrains Mono, monospace">{unit}</text>
      </svg>
      <div className="gl">{label}</div>
    </div>
  );
}
