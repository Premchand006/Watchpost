import { Crosshair, Camera } from "lucide-react";
import CameraTile from "../components/CameraTile";
import { Empty, ErrorState, Loading } from "../components/states";
import { useData } from "../context/DataContext";
import { personKey, personState, personLabel, qualityPct } from "../lib/format";

/* Live wall: the main detection camera large, a list of people in frame next
   to it, then the other cameras. V1 shows annotated snapshots; full-motion
   video is a V2 item. */
export default function LiveWallView() {
  const { cameras, camerasLoading, camerasError, people, nowMs } = useData();

  if (camerasLoading || camerasError || !cameras.length) {
    return (
      <div className="panel">
        <div className="ph"><Camera size={14} className="cyan" /><span className="t">Live Wall</span></div>
        {camerasLoading ? <Loading label="Loading cameras…" />
          : camerasError ? <ErrorState message={camerasError} />
          : <Empty title="No cameras yet" hint="Start the edge service and it registers its cameras here." icon={Camera} />}
      </div>
    );
  }

  const primaryIdx = Math.max(0, cameras.findIndex((c) => c.role === "detect"));
  const primary = cameras[primaryIdx];
  const others = cameras.filter((_, i) => i !== primaryIdx);
  const tracking = people.filter((p) => personState(p, nowMs) === "TRACKING");

  return (
    <>
      <div className="cmd-mid">
        <CameraTile cam={primary} idx={primaryIdx} now={nowMs} />
        <div className="panel">
          <div className="ph"><Crosshair size={14} className="cyan" /><span className="t">In Frame Now</span>
            <span className="r">{tracking.length} tracks</span></div>
          <div className="trackside">
            {tracking.length ? tracking.map((p) => (
              <div className="tk" key={personKey(p)}>
                <span className="tkid">{personLabel(p)}</span>
                <span className="dim">{(p.camera || "-").toUpperCase()}</span>
                {p.zone && <span className="dim">{p.zone}</span>}
                <span className="spacer" />
                <span style={{ color: "var(--cyan)" }}>{qualityPct(p.quality)}%</span>
              </div>
            )) : <Empty title="Nobody in frame" hint="People tracked in the last 45 seconds are listed here." />}
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <div className="wall">
          {others.map((c) => {
            const idx = cameras.findIndex((x) => x.id === c.id);
            return <CameraTile key={c.id} cam={c} idx={idx} now={nowMs} />;
          })}
        </div>
      )}
    </>
  );
}
