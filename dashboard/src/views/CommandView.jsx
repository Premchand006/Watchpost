import { useEffect, useRef, useState } from "react";
import { Camera, Radio, Users } from "lucide-react";
import KPIStrip from "../components/KPIStrip";
import CameraTile from "../components/CameraTile";
import EventRow from "../components/EventRow";
import PersonCard from "../components/PersonCard";
import TelemetryPanel from "../components/TelemetryPanel";
import { Loading, Empty, ErrorState } from "../components/states";
import { useData } from "../context/DataContext";
import { severityOf } from "../lib/constants";
import { personKey, personState } from "../lib/format";

const push = (arr, v, n = 14) => [...(arr || []).slice(-(n - 1)), v];

export default function CommandView() {
  const {
    events, loading, error, acknowledge, canAck,
    people, peopleLoading, peopleError,
    cameras, camerasLoading, camerasError,
    telemetry, nowMs,
  } = useData();

  const present = people.filter((p) => personState(p, nowMs) === "TRACKING").length;
  const tracks = people.length;
  const dayAgo = nowMs - 24 * 3600 * 1000;
  const alerts = events.filter((e) => severityOf(e) !== "info" && new Date(e.created_at).getTime() > dayAgo).length;
  const infer = Math.round(telemetry.latest?.latency || 0);
  const temp = Math.round(telemetry.latest?.temp || 0);

  // Short rolling history for the sparklines, sampled every other second.
  const [hist, setHist] = useState({ people: [], tracks: [], alerts: [], infer: [], temp: [] });
  const tickRef = useRef(0);
  const latestRef = useRef({ present, tracks, alerts, infer, temp });
  latestRef.current = { present, tracks, alerts, infer, temp };
  useEffect(() => {
    if (tickRef.current++ % 2 !== 0) return;
    const v = latestRef.current;
    setHist((h) => ({
      people: push(h.people, v.present),
      tracks: push(h.tracks, v.tracks),
      alerts: push(h.alerts, v.alerts),
      infer: push(h.infer, v.infer),
      temp: push(h.temp, v.temp),
    }));
  }, [nowMs]);

  const liveCams = cameras.slice(0, 3);
  const streamEvents = events.slice(0, 16);

  return (
    <>
      <KPIStrip present={present} tracks={tracks} alerts={alerts} infer={infer} temp={temp} hist={hist} />

      <div className="cmd-mid">
        <div className="panel">
          <div className="ph"><Camera size={14} className="cyan" /><span className="t">Live Monitoring</span>
            <span className="r">{cameras.length} cameras · annotated snapshots</span></div>
          <div className="pb">
            {camerasLoading ? <Loading label="Loading cameras…" />
              : camerasError ? <ErrorState message={camerasError} />
              : liveCams.length ? (
                <div className="cams">
                  {liveCams.map((c, i) => <CameraTile key={c.id} cam={c} idx={i} now={nowMs} />)}
                </div>
              ) : (
                <Empty title="No cameras yet" hint="Start the edge service and it registers its cameras here, or run cloud/seed.sql for demo rows." icon={Camera} />
              )}
          </div>
        </div>

        <div className="panel">
          <div className="ph"><Radio size={14} className="cyan" /><span className="t">Event Stream</span>
            <span className="r" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span className="livedot" />LIVE</span>
          </div>
          <div className="scroll">
            {loading ? <Loading label="Loading events…" />
              : error ? <ErrorState message={error} />
              : streamEvents.length ? streamEvents.map((e) => (
                <EventRow key={e.id} e={e} onAck={acknowledge} canAck={canAck} nowMs={nowMs} />
              )) : <Empty title="No events yet" hint="Walk in front of a camera. The event shows up here within a couple of seconds." icon={Radio} />}
          </div>
        </div>
      </div>

      <TelemetryPanel latest={telemetry.latest} latHistory={telemetry.latHistory} cameras={cameras}
        loading={telemetry.loading} error={telemetry.error} />

      <div className="panel">
        <div className="ph"><Users size={14} className="cyan" /><span className="t">People</span>
          <span className="r">most recent · best frame</span></div>
        <div className="pb">
          {peopleLoading ? <Loading label="Loading people…" />
            : peopleError ? <ErrorState message={peopleError} />
            : people.length ? (
              <div className="roster">{people.slice(0, 4).map((p) => <PersonCard key={personKey(p)} p={p} nowMs={nowMs} />)}</div>
            ) : (
              <Empty title="No people seen yet" hint="Each tracked person gets one best-frame photo here." icon={Users} />
            )}
        </div>
      </div>
    </>
  );
}
