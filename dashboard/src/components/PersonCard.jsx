import { useSignedUrl } from "../hooks/useSignedUrl";
import { ago, hhmmss, personLabel, personState, qualityPct, dwellSeconds, dwellLabel } from "../lib/format";

/* One tracked person. The best-frame photo loads through a signed URL from
   the private `best-frames` bucket; a glyph shows until it does. */
export default function PersonCard({ p, nowMs }) {
  const photo = useSignedUrl(p.best_frame);
  const st = personState(p, nowMs);
  const q = qualityPct(p.quality);
  const dwell = dwellSeconds(p);

  const cls = st === "FLAGGED" ? "flag" : st === "LOST" ? "" : "ok";
  const col = st === "FLAGGED" ? "var(--red)" : st === "LOST" ? "var(--dim)" : "var(--cyan)";

  return (
    <div className="person">
      <div className="hd">
        <div className={`avatar ${cls}`}>
          {photo ? (
            <img src={photo} alt={`${personLabel(p)} best frame`} />
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke={col} strokeWidth="1.4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke={col} strokeWidth="1.4" />
            </svg>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--fd)", letterSpacing: 1 }} title={p.id || undefined}>{personLabel(p)}</div>
          <div style={{ fontSize: 10, color: col, letterSpacing: 1.4, fontFamily: "var(--fd)" }}>{st}</div>
          <div className="qbar" role="meter" aria-label="Photo quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={q}><i style={{ width: `${q}%` }} /></div>
        </div>
      </div>
      <div className="prow"><span className="dim">CAMERA</span><span>{(p.camera || "-").toUpperCase()}</span></div>
      <div className="prow"><span className="dim">FIRST SEEN</span><span>{p.first_seen ? hhmmss(p.first_seen) : "-"}</span></div>
      <div className="prow"><span className="dim">LAST SEEN</span><span>{p.last_seen ? ago(p.last_seen, nowMs) : "-"}</span></div>
      <div className="prow"><span className="dim">ZONE</span><span>{p.zone || "-"}</span></div>
      <div className="prow"><span className="dim">DWELL</span>
        <span style={{ color: dwell > 300 ? "var(--amber)" : "var(--txt)" }}>{dwellLabel(dwell)}</span>
      </div>
      <div className="prow"><span className="dim">QUALITY</span><span className="cyan">{q}%</span></div>
    </div>
  );
}
