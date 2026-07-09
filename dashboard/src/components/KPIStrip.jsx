import { Users, Crosshair, Bell, Zap, Thermometer } from "lucide-react";
import Sparkline from "./Sparkline";
import { NODE_ID } from "../lib/constants";

/* KPI strip on the Command view. CommandView computes the values; `hist`
   holds short rolling series for the sparklines. */
export default function KPIStrip({ present, tracks, alerts, infer, temp, hist }) {
  const trend = (a) => (!a || a.length < 2 ? 0 : a[a.length - 1] - a[a.length - 2]);
  const arrow = (t) => (t > 0 ? ["▲", "up"] : t < 0 ? ["▼", "down"] : ["▬", "neutral"]);

  const cards = [
    { k: "PEOPLE PRESENT", I: Users,      v: present, s: hist.people, c: "var(--cyan)",   sub: "tracking now" },
    { k: "ACTIVE TRACKS",  I: Crosshair,  v: tracks,  s: hist.tracks, c: "var(--violet)", sub: "bytetrack ids" },
    { k: "ALERTS · 24H",   I: Bell,       v: alerts,  s: hist.alerts, c: "var(--amber)",  sub: "warning + critical" },
    { k: "INFERENCE",      I: Zap,        v: infer,   s: hist.infer,  c: "var(--green)",  sub: "latest · yolo26n ncnn", unit: "ms" },
    { k: "NODE TEMP",      I: Thermometer,v: temp,    s: hist.temp,   c: "var(--red)",    sub: `${NODE_ID} soc`, unit: "°C" },
  ];

  return (
    <div className="kpis">
      {cards.map((c) => {
        const [ar, cl] = arrow(trend(c.s));
        return (
          <div className="kpi" key={c.k}>
            <div className="k"><c.I size={12} />{c.k}</div>
            <div className="v">{c.v ?? 0}{c.unit && <span style={{ fontSize: 14, color: "var(--dim)" }}> {c.unit}</span>}</div>
            <div className={`s ${cl}`}><span>{ar}</span><span className="dim">{c.sub}</span></div>
            <Sparkline data={c.s} color={c.c} />
          </div>
        );
      })}
    </div>
  );
}
