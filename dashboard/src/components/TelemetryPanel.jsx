import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Cpu, Activity } from "lucide-react";
import Gauge from "./Gauge";
import { Empty, ErrorState, Loading } from "./states";
import { clamp } from "../lib/format";
import { fpsFor } from "../lib/telemetry";
import { NODE_ID } from "../lib/constants";

const FPS_SCALE = 15; // bar is full at this rate

/* Edge node health: CPU, memory and temperature gauges, FPS per camera, and
   the inference latency chart. FPS is matched to cameras by id. */
export default function TelemetryPanel({ latest, latHistory, cameras = [], loading = false, error = null }) {
  const t = latest || { cpu: 0, mem: 0, temp: 0, fps: {}, latency: 0 };
  const ids = cameras.length ? cameras.map((c) => c.id) : Object.keys(t.fps || {}).sort();
  const fpsRows = ids.map((id) => {
    const cam = cameras.find((c) => c.id === id);
    const f = fpsFor(t.fps, id) ?? (cam?.fps != null ? Number(cam.fps) : null);
    return { id, f };
  });
  const hasChart = latHistory && latHistory.length >= 2;
  const node = latest?.nodeId || NODE_ID;

  return (
    <div className="tel">
      <div className="panel">
        <div className="ph"><Cpu size={14} className="cyan" /><span className="t">Edge Telemetry</span>
          <span className="r">{node} · cpu mode</span></div>
        <div className="pb">
          {error ? <ErrorState message={error} /> : (
            <>
              <div className="gauges">
                <Gauge label="CPU" value={t.cpu} unit="%" max={100} color="var(--cyan)" />
                <Gauge label="MEMORY" value={t.mem} unit="%" max={100} color="var(--violet)" />
                <Gauge label="THERMAL" value={t.temp} unit="°C" max={90} color="var(--amber)" />
              </div>
              <div className="fps">
                {fpsRows.length ? fpsRows.map(({ id, f }) => (
                  <div className="fpsrow" key={id}>
                    <span className="dim">{id.toUpperCase()}</span>
                    <div className="fpsbar"><i style={{ width: `${clamp(((f || 0) / FPS_SCALE) * 100, 2, 100)}%` }} /></div>
                    <span style={{ textAlign: "right", color: f == null ? "var(--dim)" : "var(--cyan)" }}>
                      {f == null ? "-" : `${f.toFixed(1)} fps`}
                    </span>
                  </div>
                )) : <span className="dim" style={{ fontSize: 11 }}>No per-camera FPS yet.</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="ph"><Activity size={14} className="cyan" /><span className="t">Inference Latency</span>
          <span className="r">ms · last {latHistory?.length || 0} samples</span></div>
        <div className="pb" style={{ height: 232 }}>
          {loading ? <Loading label="Loading telemetry…" />
            : error ? <ErrorState message={error} />
            : hasChart ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latHistory} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3ae7d6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3ae7d6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(126,162,226,.10)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fill: "#5b6f90", fontSize: 10, fontFamily: "JetBrains Mono" }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "#0c1322", border: "1px solid rgba(126,162,226,.24)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11, color: "#e8eefb" }}
                  labelStyle={{ display: "none" }} formatter={(v) => [`${Math.round(v)} ms`, "latency"]} />
                <Area type="monotone" dataKey="ms" stroke="#3ae7d6" strokeWidth={1.8} fill="url(#lat)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty title="No telemetry yet" hint="The Pi sends CPU, temperature, FPS and latency every 5 seconds once the edge service is running." />
          )}
        </div>
      </div>
    </div>
  );
}
