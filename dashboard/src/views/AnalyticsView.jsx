import { useMemo } from "react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { MapPin, BarChart3 } from "lucide-react";
import TelemetryPanel from "../components/TelemetryPanel";
import { Empty, ErrorState, Loading } from "../components/states";
import { useData } from "../context/DataContext";
import { severityOf } from "../lib/constants";
import { personState } from "../lib/format";

/* Analytics (PRD FR-W6): latency and per-camera FPS (TelemetryPanel), zone
   occupancy for people in frame now, and events per hour over the last 24 hours. */
export default function AnalyticsView() {
  const { events, loading, error, people, cameras, telemetry, nowMs } = useData();

  // People currently tracked, counted per zone.
  const zoneCounts = useMemo(() => {
    const map = new Map();
    for (const p of people) {
      if (personState(p, nowMs) !== "TRACKING") continue;
      const z = p.zone || "Unzoned";
      map.set(z, (map.get(z) || 0) + 1);
    }
    return [...map.entries()].map(([z, n]) => ({ z, n })).sort((a, b) => b.n - a.n);
  }, [people, nowMs]);
  const maxN = Math.max(1, ...zoneCounts.map((c) => c.n));

  // Events per hour for the last 24 hours, oldest hour first.
  const hourKey = new Date(nowMs).setMinutes(0, 0, 0); // start of the current local hour
  const perHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => {
      const start = hourKey - (23 - i) * 3_600_000;
      return { start, label: `${String(new Date(start).getHours()).padStart(2, "0")}h`, n: 0, crit: 0 };
    });
    const first = buckets[0].start;
    for (const e of events) {
      const idx = Math.floor((new Date(e.created_at).getTime() - first) / 3_600_000);
      if (idx < 0 || idx > 23) continue;
      buckets[idx].n += 1;
      if (severityOf(e) === "critical") buckets[idx].crit += 1;
    }
    return buckets;
  }, [events, hourKey]);
  const hasEvents = perHour.some((b) => b.n > 0);

  return (
    <>
      <TelemetryPanel latest={telemetry.latest} latHistory={telemetry.latHistory} cameras={cameras}
        loading={telemetry.loading} error={telemetry.error} />

      <div className="panel">
        <div className="ph"><BarChart3 size={14} className="cyan" /><span className="t">Events / Hour</span>
          <span className="r">last 24h · critical in red</span></div>
        <div className="pb" style={{ height: 220 }}>
          {loading ? <Loading label="Loading events…" />
            : error ? <ErrorState message={error} />
            : hasEvents ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perHour} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="rgba(126,162,226,.10)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5b6f90", fontSize: 9, fontFamily: "JetBrains Mono" }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fill: "#5b6f90", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <Tooltip cursor={{ fill: "rgba(126,162,226,.06)" }}
                  contentStyle={{ background: "#0c1322", border: "1px solid rgba(126,162,226,.24)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11, color: "#e8eefb" }}
                  formatter={(v, _n, p) => [`${v} events (${p.payload.crit} critical)`, p.payload.label]} labelStyle={{ display: "none" }} />
                <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                  {perHour.map((b, i) => <Cell key={i} fill={b.crit > 0 ? "#ff476f" : "#3ae7d6"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty title="No events in the last 24 hours" hint="Hourly counts appear once the Pi sends events." icon={BarChart3} />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="ph"><MapPin size={14} className="cyan" /><span className="t">Zone Occupancy</span>
          <span className="r">in frame now</span></div>
        <div className="pb fps">
          {zoneCounts.length ? zoneCounts.map((c) => (
            <div className="fpsrow zonerow" key={c.z}>
              <span className="dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.z}</span>
              <div className="fpsbar"><i style={{ width: `${(c.n / maxN) * 100}%`, background: "linear-gradient(90deg,#6d5bd0,var(--violet))" }} /></div>
              <span style={{ textAlign: "right", color: "var(--violet)" }}>{c.n}</span>
            </div>
          )) : <Empty title="Nobody in a zone" hint="People in frame are counted here by zone." icon={MapPin} />}
        </div>
      </div>
    </>
  );
}
