import { Loader2, Inbox, AlertOctagon } from "lucide-react";

/* Loading, empty and error states shared by every view. */

export function Loading({ label = "Loading…" }) {
  return (
    <div className="state" role="status">
      <div className="si"><Loader2 size={20} className="spin" /></div>
      <div className="st">Loading</div>
      <div className="ss">{label}</div>
    </div>
  );
}

export function Empty({ title = "No data yet", hint, icon: Icon = Inbox }) {
  return (
    <div className="state">
      <div className="si"><Icon size={20} /></div>
      <div className="st">{title}</div>
      {hint && <div className="ss">{hint}</div>}
    </div>
  );
}

export function ErrorState({ title = "Could not load", message = "Something went wrong." }) {
  return (
    <div className="state" role="alert">
      <div className="si" style={{ color: "var(--red)", borderColor: "rgba(255,71,111,.3)" }}>
        <AlertOctagon size={20} />
      </div>
      <div className="st" style={{ color: "var(--red)" }}>{title}</div>
      <div className="ss">{message}</div>
    </div>
  );
}
