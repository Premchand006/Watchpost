import { useState, useMemo } from "react";
import { Bell, ShieldCheck } from "lucide-react";
import EventRow from "../components/EventRow";
import { Loading, Empty, ErrorState } from "../components/states";
import { useData } from "../context/DataContext";
import { severityOf } from "../lib/constants";

const FILTERS = ["OPEN", "CRITICAL", "WARNING", "ALL"];

/* Alert Center (PRD FR-W5). Admins and officers can acknowledge; the server
   rejects viewers and the toast says so. */
export default function AlertsView() {
  const { events, loading, error, acknowledge, canAck, nowMs } = useData();
  const [filter, setFilter] = useState("OPEN");

  const alerts = useMemo(() => events.filter((e) => severityOf(e) !== "info"), [events]);

  const list = useMemo(() => {
    if (filter === "ALL") return events;
    if (filter === "OPEN") return alerts.filter((e) => !e.acknowledged);
    return alerts.filter((e) => severityOf(e) === filter.toLowerCase());
  }, [events, alerts, filter]);

  const open = alerts.filter((e) => !e.acknowledged).length;

  const emptyText = {
    OPEN: ["No open alerts", "Every warning and critical alert has been acknowledged."],
    CRITICAL: ["No critical alerts", "Intrusion, offline and tamper alerts show up here."],
    WARNING: ["No warnings", "Loitering alerts show up here."],
    ALL: ["No events yet", "Events from the Pi show up here as they happen."],
  }[filter];

  return (
    <div className="panel">
      <div className="ph"><Bell size={14} className="cyan" /><span className="t">Alert Center</span>
        <span className="r">{open} open</span></div>
      <div className="pb" style={{ paddingBottom: 0 }}>
        <div className="filters" style={{ marginBottom: 12 }}>
          {FILTERS.map((x) => (
            <button key={x} type="button" className={`fbtn ${filter === x ? "on" : ""}`}
              aria-pressed={filter === x} onClick={() => setFilter(x)}>{x}</button>
          ))}
          {!canAck && (
            <span className="dim" style={{ fontSize: 10.5, marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <ShieldCheck size={12} aria-hidden="true" /> read-only role
            </span>
          )}
        </div>
      </div>
      <div className="scroll" style={{ maxHeight: 560 }}>
        {loading ? <Loading label="Loading alerts…" />
          : error ? <ErrorState message={error} />
          : list.length ? list.map((e) => (
            <EventRow key={e.id} e={e} onAck={acknowledge} canAck={canAck} nowMs={nowMs} />
          )) : <Empty title={emptyText[0]} hint={emptyText[1]} icon={Bell} />}
      </div>
    </div>
  );
}
