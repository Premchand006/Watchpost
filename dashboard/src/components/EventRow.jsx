import { eventMeta, severityOf } from "../lib/constants";
import { ago, hhmmss, trackLabel } from "../lib/format";

/* One row in the event stream or Alert Center. `canAck` reflects the user's
   role and only disables the button; the server makes the real decision. */
export default function EventRow({ e, onAck, canAck = false, nowMs }) {
  const meta = eventMeta(e.type);
  const Icon = meta.icon;
  const sev = severityOf(e);
  const zone = e.meta?.zone;
  const track = trackLabel(e.track_id);
  const isAlert = sev !== "info";
  const ackedAt = e.acknowledged_at ? `Acknowledged at ${hhmmss(e.acknowledged_at)}` : "Acknowledged";

  return (
    <div className="evt">
      <div className={`ic bg-${sev}`} aria-hidden="true"><Icon size={14} /></div>
      <div className="bd">
        <div className="ttl">
          <span>{e.type === "exit" && e.meta?.final ? "Left view" : meta.label}</span>
          <span className={`tagdot bg-${sev}`}>{sev}</span>
        </div>
        <div className="sub">
          {e.camera && <span>{e.camera.toUpperCase()}</span>}
          {zone && <><span>·</span><span>{zone}</span></>}
          {track && <><span>·</span><span style={{ color: "var(--cyan)" }} title={e.person_id || undefined}>{track}</span></>}
          {e.node_id && <><span>·</span><span className="dim">{e.node_id}</span></>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className="tm">{ago(e.created_at, nowMs)}</span>
        {isAlert && (
          <button
            type="button"
            className={`ack ${e.acknowledged ? "done" : ""}`}
            disabled={e.acknowledged || !canAck}
            aria-label={e.acknowledged ? ackedAt : "Acknowledge alert"}
            title={e.acknowledged ? ackedAt : !canAck ? "Your role cannot acknowledge alerts" : "Acknowledge"}
            onClick={() => !e.acknowledged && canAck && onAck?.(e.id)}
          >
            {e.acknowledged ? "ACKED" : "ACK"}
          </button>
        )}
      </div>
    </div>
  );
}
