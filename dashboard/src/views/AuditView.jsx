import { ScrollText } from "lucide-react";
import { Loading, Empty, ErrorState } from "../components/states";
import { useAuditLog } from "../hooks/useAuditLog";
import { hhmmss } from "../lib/format";

/* Audit log (PRD FR-W7, admins only). The route is admin-gated and the
   audit_admin_read policy enforces it on the server. Logins and logouts are
   written by the dashboard; acks, role changes and camera or zone edits by
   database triggers. */
const ACTION_LABEL = {
  login: "SIGNED IN",
  logout: "SIGNED OUT",
  ack_alert: "ALERT ACKNOWLEDGED",
  config_change: "CONFIG CHANGED",
};

function describe(r) {
  const d = r.detail || {};
  if (typeof d === "string") return d;
  if (r.action === "ack_alert") {
    return [d.type, d.camera, d.event_id != null && `event ${d.event_id}`].filter(Boolean).join(" · ");
  }
  if (r.action === "config_change" && d.change === "role") {
    return `${d.target || "user"}: ${d.from} → ${d.to}`;
  }
  if (r.action === "config_change") {
    const fields = d.fields && typeof d.fields === "object" ? Object.keys(d.fields).join(", ") : "";
    return [d.change, d.op, d.id, fields && `(${fields})`].filter(Boolean).join(" ");
  }
  return Object.entries(d)
    .filter(([k, v]) => k !== "email" && v != null && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

function when(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? hhmmss(d) : `${d.toLocaleDateString()} ${hhmmss(d)}`;
}

export default function AuditView() {
  const { rows, loading, error } = useAuditLog({ limit: 100 });

  return (
    <div className="panel">
      <div className="ph"><ScrollText size={14} className="cyan" /><span className="t">Audit Log</span>
        <span className="r">admins only · last 100</span></div>
      <div className="trackside">
        {loading ? <Loading label="Loading audit log…" />
          : error ? <ErrorState message={error} />
          : rows.length ? rows.map((r) => (
            <div className="tk auditrow" key={r.id}>
              <span className="tm" style={{ color: "var(--mid)" }}>{when(r.created_at)}</span>
              <span className="auditact">{ACTION_LABEL[r.action] || (r.action || "ACTION").toUpperCase()}</span>
              <span className="dim" style={{ fontSize: 11 }}>{r.detail?.email || (r.user_id ? r.user_id.slice(0, 8) : "system")}</span>
              <span className="spacer" />
              <span style={{ fontSize: 11 }}>{describe(r)}</span>
            </div>
          )) : <Empty title="No audit entries yet" hint="Sign-ins, acknowledgements and config changes are recorded here." icon={ScrollText} />}
      </div>
    </div>
  );
}
