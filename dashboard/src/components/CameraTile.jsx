import { Wifi, WifiOff, AlertTriangle, Clock } from "lucide-react";
import { ROLE_CHIP, FEED_CLASS } from "../lib/constants";
import { cameraHealth } from "../lib/cameras";
import { ago, hhmmss } from "../lib/format";
import { useSnapshot } from "../hooks/useSnapshot";

/* One camera on the wall. Shows the latest annotated snapshot from the Pi
   (private `snapshots` bucket, signed URL) with the HUD drawn over it. Until a
   snapshot exists the animated placeholder stands in. `boxes` (optional) draws
   bbox + track id overlays when the data includes them. */
export default function CameraTile({ cam, boxes = [], idx = 0, restricted = false, now }) {
  const nowMs = now || Date.now();
  const health = cameraHealth(cam, nowMs);
  const live = health === "online";
  const tamper = health === "tamper";
  const stale = health === "stale";
  const snapshotUrl = useSnapshot(cam, { live });
  const chip = ROLE_CHIP[cam?.role] || "cy";
  const feedCls = FEED_CLASS[idx % FEED_CLASS.length];
  const fps = cam?.fps != null && Number.isFinite(Number(cam.fps)) ? Number(cam.fps).toFixed(1) : null;
  const showImage = snapshotUrl && (live || stale);

  return (
    <div className="cam">
      <div className={`feed ${feedCls} ${live ? "" : "offline"}`}>
        {showImage && <img className="snap" src={snapshotUrl} alt={`${cam.id} snapshot`} />}
        {!showImage && <div className="grid" />}
        {live && idx > 0 && <div className="sweep" />}
        {live && <div className="scan" />}
        {!showImage && live && <div className="reticle" />}
        <div className="vig" />

        {restricted && (
          <svg className="vig" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ boxShadow: "none" }} aria-hidden="true">
            <polygon points="66,10 97,10 97,93 66,93" fill="rgba(255,71,111,.07)"
              stroke="var(--red)" strokeWidth="0.5" strokeDasharray="2 2" />
            <text x="81" y="50" textAnchor="middle" fill="rgba(255,71,111,.85)" fontSize="3"
              fontFamily="Chakra Petch, sans-serif" letterSpacing="0.5">RESTRICTED</text>
          </svg>
        )}

        {[0, 1, 2, 3].map((i) => {
          const base = { position: "absolute", width: 16, height: 16, borderColor: "var(--cyan)", opacity: 0.85 };
          const pos = [
            { top: 7, left: 7, borderTop: "2px solid", borderLeft: "2px solid" },
            { top: 7, right: 7, borderTop: "2px solid", borderRight: "2px solid" },
            { bottom: 7, left: 7, borderBottom: "2px solid", borderLeft: "2px solid" },
            { bottom: 7, right: 7, borderBottom: "2px solid", borderRight: "2px solid" },
          ][i];
          return <div key={i} style={{ ...base, ...pos }} />;
        })}

        {live && boxes.map((b) => (
          <div key={b.id} className={`box ${b.flag ? "flag" : ""}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
            <span className="ct">{b.id}{b.conf != null ? ` · ${Math.round(b.conf)}%` : ""}</span>
          </div>
        ))}

        {(health === "offline" || tamper) && (
          <div className="state" style={{ position: "absolute", inset: 0, padding: 0 }}>
            <div className="si" style={{ color: tamper ? "var(--red)" : "var(--dim)", borderColor: "var(--line2)" }}>
              {tamper ? <AlertTriangle size={20} /> : <WifiOff size={20} />}
            </div>
            <div className="st" style={{ color: tamper ? "var(--red)" : "var(--mid)" }}>
              {tamper ? "Tamper detected" : "Camera offline"}
            </div>
          </div>
        )}

        {stale && (
          <div className="burn stalebadge" style={{ top: 28, left: 30 }}>
            NO UPDATE {cam?.last_seen ? ago(cam.last_seen, nowMs).toUpperCase() : ""}
          </div>
        )}

        <div className="burn" style={{ top: 8, left: 30 }}>{cam?.id?.toUpperCase()} · {(cam?.role || "").toUpperCase()}</div>
        <div className="burn" style={{ top: 8, right: 30, textAlign: "right" }}>{hhmmss(nowMs)}</div>
        {live && <div className="burn rec" style={{ bottom: 8, left: 30 }}><span className="d" />REC</div>}
        <div className="burn" style={{ bottom: 8, right: 30, textAlign: "right" }}>
          {[fps && `${fps} FPS`, cam?.resolution, cam?.node_id].filter(Boolean).join(" · ")}
        </div>
      </div>

      <div className="meta">
        <span className={`chip ${chip}`}>{cam?.role || "camera"}</span>
        <span className="dim camname">{cam?.name || cam?.id}</span>
        <span className="spacer" />
        <HealthLabel health={health} />
      </div>
    </div>
  );
}

function HealthLabel({ health }) {
  const style = { display: "inline-flex", gap: 5, alignItems: "center", flex: "none" };
  if (health === "online") return <span style={{ ...style, color: "var(--green)" }}><Wifi size={12} /> LIVE</span>;
  if (health === "tamper") return <span style={{ ...style, color: "var(--red)" }}><AlertTriangle size={12} /> TAMPER</span>;
  if (health === "stale") return <span style={{ ...style, color: "var(--amber)" }}><Clock size={12} /> STALE</span>;
  return <span style={{ ...style, color: "var(--dim)" }}><WifiOff size={12} /> OFFLINE</span>;
}
