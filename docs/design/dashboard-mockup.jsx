import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Shield, ShieldAlert, Camera, Activity, Users, Bell, BarChart3, ScrollText,
  Cpu, Thermometer, Radio, AlertTriangle, Eye, Wifi, Search, Crosshair,
  MapPin, Clock, CheckCircle2, Zap, ChevronRight, LayoutGrid,
} from "lucide-react";

/* ===========================================================================
   Watchpost command console (design reference, simulated data)
   Self-contained React component. Simulated data only (no backend, no storage).
   The real app in dashboard/ rebuilds this against Supabase data. See docs/build-plan.md M5.
   =========================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root{
  --bg0:#05070e;--bg1:#0a0f1d;--bg2:#0c1322;--panel:#0d1424;--panel2:#101a2e;
  --line:rgba(126,162,226,.12);--line2:rgba(126,162,226,.24);
  --txt:#e8eefb;--mid:#8ba1c6;--dim:#5b6f90;
  --cyan:#3ae7d6;--cyan-d:#159fb1;--violet:#a78bfa;--amber:#f6b545;--red:#ff476f;--green:#52e08c;
  --fd:'Chakra Petch','Eurostile',system-ui,sans-serif;
  --fm:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;
}
*{box-sizing:border-box}
.se{font-family:var(--fm);color:var(--txt);letter-spacing:.2px;min-height:100vh;background:
  radial-gradient(1200px 700px at 80% -10%,rgba(58,231,214,.07),transparent 60%),
  radial-gradient(900px 600px at -10% 110%,rgba(167,139,250,.07),transparent 55%),var(--bg0)}
.se ::selection{background:var(--cyan);color:#04121a}
.app{display:grid;grid-template-columns:62px 1fr;min-height:100vh}
.main{display:flex;flex-direction:column;min-width:0}
.content{padding:14px 18px 26px;display:flex;flex-direction:column;gap:14px}
.lbl{font-family:var(--fd);text-transform:uppercase;letter-spacing:2.4px;font-size:11px;color:var(--dim);font-weight:600}
.dim{color:var(--dim)}.mid{color:var(--mid)}.cyan{color:var(--cyan)}
.rail{background:linear-gradient(180deg,var(--bg2),var(--bg1));border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:6px;position:sticky;top:0;height:100vh}
.brand{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;margin-bottom:10px;background:linear-gradient(135deg,var(--cyan),var(--cyan-d));color:#04121a;box-shadow:0 0 18px rgba(58,231,214,.45)}
.nav{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;color:var(--dim);cursor:pointer;border:1px solid transparent;transition:.18s;position:relative}
.nav:hover{color:var(--mid);background:rgba(126,162,226,.06)}
.nav.on{color:var(--cyan);background:rgba(58,231,214,.10);border-color:rgba(58,231,214,.30)}
.nav.on::before{content:"";position:absolute;left:-12px;top:9px;bottom:9px;width:3px;border-radius:3px;background:var(--cyan);box-shadow:0 0 10px var(--cyan)}
.top{display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(12,19,34,.92),rgba(10,15,29,.6));backdrop-filter:blur(6px);position:sticky;top:0;z-index:5}
.wordmark{font-family:var(--fd);font-weight:700;font-size:16px;letter-spacing:3px}
.wordmark b{color:var(--cyan)}
.tag{font-size:10px;letter-spacing:2px;color:var(--dim);border:1px solid var(--line2);padding:2px 7px;border-radius:5px}
.spacer{flex:1}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid var(--line2);color:var(--mid)}
.pill .d{width:7px;height:7px;border-radius:50%}
.usr{display:flex;align-items:center;gap:9px;padding:3px 4px 3px 11px;border:1px solid var(--line2);border-radius:9px}
.usr .av{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--violet),#6d5bd0);display:grid;place-items:center;color:#0b0820;font-weight:700;font-size:12px}
.panel{background:linear-gradient(180deg,var(--panel),rgba(10,15,29,.7));border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ph{display:flex;align-items:center;gap:8px;padding:10px 13px;border-bottom:1px solid var(--line)}
.ph .t{font-family:var(--fd);text-transform:uppercase;letter-spacing:2px;font-size:12px;font-weight:600;color:var(--mid)}
.ph .r{margin-left:auto;font-size:10px;color:var(--dim);letter-spacing:1.5px}
.pb{padding:13px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.kpi{background:linear-gradient(180deg,var(--panel2),rgba(10,15,29,.6));border:1px solid var(--line);border-radius:13px;padding:12px 13px;position:relative;overflow:hidden}
.kpi .k{font-family:var(--fd);text-transform:uppercase;letter-spacing:1.8px;font-size:10px;color:var(--dim);display:flex;align-items:center;gap:6px}
.kpi .v{font-size:30px;font-weight:700;margin-top:6px;line-height:1;font-family:var(--fd)}
.kpi .s{font-size:11px;margin-top:6px;display:flex;align-items:center;gap:5px}
.kpi .spark{position:absolute;right:10px;top:12px;width:74px;height:26px;opacity:.95}
.up{color:var(--green)}.down{color:var(--red)}.neutral{color:var(--mid)}
.cams{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.wall{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.cam{border:1px solid var(--line);border-radius:13px;overflow:hidden;background:var(--bg1)}
.feed{position:relative;aspect-ratio:16/10;overflow:hidden;background:radial-gradient(120% 120% at 50% 0%,rgba(58,231,214,.05),transparent 55%),linear-gradient(160deg,#0a1422,#060a12)}
.feed.c2{background:radial-gradient(120% 120% at 50% 0%,rgba(58,231,214,.12),transparent 55%),linear-gradient(160deg,#08161f,#050c14)}
.feed.c3{background:radial-gradient(120% 120% at 50% 0%,rgba(82,224,140,.10),transparent 55%),linear-gradient(160deg,#0a1810,#05100a)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(126,162,226,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(126,162,226,.10) 1px,transparent 1px);background-size:30px 30px;animation:drift 8s linear infinite;opacity:.5}
.scan{position:absolute;left:0;right:0;height:42%;top:-42%;background:linear-gradient(180deg,transparent,rgba(58,231,214,.10) 70%,rgba(58,231,214,.22));animation:scan 4.2s linear infinite;mix-blend-mode:screen}
.sweep{position:absolute;left:50%;top:50%;width:150%;height:150%;transform:translate(-50%,-50%);background:conic-gradient(from 0deg,rgba(58,231,214,.16),transparent 22%);animation:sweep 5.5s linear infinite;opacity:.45}
.vig{position:absolute;inset:0;box-shadow:inset 0 0 90px rgba(0,0,0,.65);pointer-events:none}
.box{position:absolute;border:1.5px solid var(--cyan);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 14px rgba(58,231,214,.25);transition:left .22s linear,top .22s linear}
.box.flag{border-color:var(--red);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 16px rgba(255,71,111,.45);animation:flagp 1s ease-in-out infinite}
.box .ct{position:absolute;top:-19px;left:-1px;background:var(--cyan);color:#04121a;font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;letter-spacing:.4px}
.box.flag .ct{background:var(--red);color:#1a0309}
.reticle{position:absolute;left:50%;top:50%;width:38px;height:38px;transform:translate(-50%,-50%);opacity:.35;pointer-events:none}
.reticle::before,.reticle::after{content:"";position:absolute;background:var(--cyan)}
.reticle::before{left:50%;top:0;bottom:0;width:1px;transform:translateX(-.5px)}
.reticle::after{top:50%;left:0;right:0;height:1px;transform:translateY(-.5px)}
.burn{position:absolute;font-size:9.5px;letter-spacing:1px;color:rgba(220,235,255,.78);text-shadow:0 1px 3px rgba(0,0,0,.85)}
.rec{display:inline-flex;align-items:center;gap:5px;color:#ffd2dc}
.rec .d{width:7px;height:7px;border-radius:50%;background:var(--red);animation:blink 1.1s steps(2,start) infinite}
.cam .meta{display:flex;align-items:center;gap:8px;padding:8px 11px;border-top:1px solid var(--line);font-size:11px}
.chip{font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;padding:2px 7px;border-radius:5px;border:1px solid var(--line2);color:var(--mid);font-family:var(--fd)}
.chip.cy{color:var(--cyan);border-color:rgba(58,231,214,.35)}
.chip.vi{color:var(--violet);border-color:rgba(167,139,250,.35)}
.chip.gr{color:var(--green);border-color:rgba(82,224,140,.35)}
.evt{display:flex;gap:9px;padding:9px 11px;border-bottom:1px solid var(--line);align-items:flex-start;animation:slidein .3s ease}
.evt .ic{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none;margin-top:1px}
.evt .bd{flex:1;min-width:0}
.evt .ttl{font-size:12.5px;display:flex;align-items:center;gap:7px}
.evt .sub{font-size:10.5px;color:var(--dim);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap}
.evt .tm{font-size:10px;color:var(--dim);font-variant-numeric:tabular-nums;flex:none}
.ack{font-family:var(--fd);font-size:9.5px;letter-spacing:1px;text-transform:uppercase;padding:3px 8px;border-radius:6px;cursor:pointer;border:1px solid var(--line2);color:var(--mid);background:transparent;transition:.15s}
.ack:hover{border-color:var(--cyan);color:var(--cyan)}
.ack.done{color:var(--green);border-color:rgba(82,224,140,.4);cursor:default}
.bg-info{background:rgba(58,231,214,.12);color:var(--cyan)}
.bg-warning{background:rgba(246,181,69,.14);color:var(--amber)}
.bg-critical{background:rgba(255,71,111,.14);color:var(--red)}
.tagdot{font-size:9px;letter-spacing:1.2px;padding:1px 6px;border-radius:4px;text-transform:uppercase;font-family:var(--fd)}
.tel{display:grid;grid-template-columns:1.05fr 1.5fr;gap:14px}
.gauges{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.gauge{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0}
.gauge .gl{font-family:var(--fd);text-transform:uppercase;letter-spacing:1.6px;font-size:10px;color:var(--dim)}
.gauge .gv{font-family:var(--fd);font-weight:700;font-size:15px}
.fps{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.fpsrow{display:grid;grid-template-columns:84px 1fr 50px;align-items:center;gap:9px;font-size:11px}
.fpsbar{height:8px;border-radius:6px;background:rgba(126,162,226,.10);overflow:hidden}
.fpsbar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--cyan-d),var(--cyan));transition:width .5s ease}
.roster{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.person{border:1px solid var(--line);border-radius:13px;overflow:hidden;background:linear-gradient(180deg,var(--panel2),rgba(10,15,29,.6))}
.person .hd{display:flex;gap:10px;padding:12px;align-items:center}
.avatar{width:46px;height:46px;border-radius:11px;flex:none;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#1a2740,#0b1322);border:1px solid var(--line2);position:relative}
.avatar.ok{box-shadow:0 0 0 1px rgba(58,231,214,.4),0 0 14px rgba(58,231,214,.2)}
.avatar.flag{box-shadow:0 0 0 1px rgba(255,71,111,.5),0 0 14px rgba(255,71,111,.25)}
.qbar{height:6px;border-radius:5px;background:rgba(126,162,226,.10);overflow:hidden;margin-top:6px}
.qbar i{display:block;height:100%;background:linear-gradient(90deg,var(--violet),var(--cyan))}
.prow{display:flex;justify-content:space-between;font-size:11px;padding:3px 12px}
.prow:last-child{padding-bottom:11px}
.filters{display:flex;gap:8px;flex-wrap:wrap}
.fbtn{font-family:var(--fd);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;padding:5px 11px;border-radius:7px;border:1px solid var(--line2);color:var(--mid);background:transparent;cursor:pointer}
.fbtn.on{color:var(--cyan);border-color:rgba(58,231,214,.4);background:rgba(58,231,214,.08)}
.trackside{display:flex;flex-direction:column}
.tk{display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:11.5px}
.tkid{font-weight:700;color:var(--cyan)}
.scroll{max-height:430px;overflow:auto}
.scroll::-webkit-scrollbar{width:7px}.scroll::-webkit-scrollbar-thumb{background:rgba(126,162,226,.22);border-radius:6px}
@keyframes drift{from{background-position:0 0}to{background-position:30px 30px}}
@keyframes scan{0%{top:-42%}100%{top:100%}}
@keyframes sweep{to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes flagp{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes slidein{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
@media (max-width:1080px){
  .kpis{grid-template-columns:repeat(2,1fr)}.cams{grid-template-columns:1fr}.tel{grid-template-columns:1fr}
  .roster{grid-template-columns:repeat(2,1fr)}.wall{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

/* ----------------------------- helpers ----------------------------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hhmmss = (d) => d.toTimeString().slice(0, 8);

const CAMERAS = [
  { id: "CAM-01", name: "MX BRIO 4K", role: "IDENTITY", cls: "", chip: "vi", res: "3840×2160" },
  { id: "CAM-02", name: "AR0234 GS", role: "PRIMARY DETECT", cls: "c2", chip: "cy", res: "1280×720", restricted: true },
  { id: "CAM-03", name: "IMX678 LL", role: "PERIMETER", cls: "c3", chip: "gr", res: "1280×720" },
];

const INIT_BOXES = [
  [{ id: "T-204", x: 36, y: 26, w: 20, h: 48, conf: 92 }],
  [{ id: "T-198", x: 16, y: 30, w: 17, h: 46, conf: 88 }, { id: "T-211", x: 70, y: 34, w: 18, h: 50, conf: 81, flag: true }],
  [{ id: "T-176", x: 44, y: 24, w: 19, h: 50, conf: 79 }],
];

const EVENT_POOL = [
  { type: "Zone entry", sev: "info", icon: Eye },
  { type: "Person detected", sev: "info", icon: Activity },
  { type: "Loitering detected", sev: "warning", icon: Clock },
  { type: "Restricted intrusion", sev: "critical", icon: ShieldAlert },
  { type: "Best frame captured", sev: "info", icon: Camera },
  { type: "Camera tamper", sev: "critical", icon: AlertTriangle },
  { type: "Zone exit", sev: "info", icon: ChevronRight },
];
const ZONES = ["Lobby", "Perimeter East", "Restricted A", "Corridor", "Entry Gate"];

const SEED_PEOPLE = [
  { id: "P-1042", cam: "CAM-02", zone: "Lobby", dwell: 184, q: 92, st: "TRACKING" },
  { id: "P-1039", cam: "CAM-01", zone: "Entry Gate", dwell: 76, q: 88, st: "TRACKING" },
  { id: "P-1037", cam: "CAM-02", zone: "Restricted A", dwell: 312, q: 71, st: "FLAGGED" },
  { id: "P-1035", cam: "CAM-03", zone: "Perimeter East", dwell: 49, q: 64, st: "TRACKING" },
  { id: "P-1031", cam: "CAM-01", zone: "Corridor", dwell: 521, q: 95, st: "TRACKING" },
  { id: "P-1028", cam: "CAM-03", zone: "Perimeter East", dwell: 12, q: 58, st: "LOST" },
  { id: "P-1024", cam: "CAM-02", zone: "Lobby", dwell: 240, q: 83, st: "TRACKING" },
  { id: "P-1019", cam: "CAM-01", zone: "Entry Gate", dwell: 95, q: 77, st: "TRACKING" },
];

/* ----------------------------- atoms ----------------------------- */
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * 100},${28 - ((v - min) / span) * 24 - 2}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6"
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Gauge({ label, value, unit, max, color }) {
  const r = 34, c = 2 * Math.PI * r, frac = clamp(value / max, 0, 1);
  return (
    <div className="gauge">
      <svg width="86" height="86" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={r} fill="none" stroke="rgba(126,162,226,.12)" strokeWidth="7" />
        <circle cx="43" cy="43" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 43 43)"
          style={{ transition: "stroke-dashoffset .6s ease", filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="43" y="40" textAnchor="middle" fill="#e8eefb" fontSize="17"
          fontFamily="Chakra Petch, sans-serif" fontWeight="700">{Math.round(value)}</text>
        <text x="43" y="54" textAnchor="middle" fill="#5b6f90" fontSize="9"
          fontFamily="JetBrains Mono, monospace">{unit}</text>
      </svg>
      <div className="gl">{label}</div>
    </div>
  );
}

function CameraTile({ cam, boxes, idx }) {
  return (
    <div className="cam">
      <div className={`feed ${cam.cls}`}>
        <div className="grid" />
        {(idx > 0) && <div className="sweep" />}
        <div className="scan" />
        <div className="reticle" />
        <div className="vig" />
        {cam.restricted && (
          <svg className="vig" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ boxShadow: "none" }}>
            <polygon points="66,10 97,10 97,93 66,93" fill="rgba(255,71,111,.07)"
              stroke="var(--red)" strokeWidth="0.5" strokeDasharray="2 2" />
            <text x="81" y="50" textAnchor="middle" fill="rgba(255,71,111,.85)" fontSize="3"
              fontFamily="Chakra Petch, sans-serif" letterSpacing="0.5">RESTRICTED</text>
          </svg>
        )}
        {/* corner brackets */}
        {[["6px", "6px", "ltb"], ["6px", "6px", "rtb", 1], ["6px", "6px", "lbb", 2], ["6px", "6px", "rbb", 3]].map((_, i) => {
          const s = { position: "absolute", width: 16, height: 16, borderColor: "var(--cyan)", opacity: .85 };
          const pos = [
            { top: 7, left: 7, borderTop: "2px solid", borderLeft: "2px solid" },
            { top: 7, right: 7, borderTop: "2px solid", borderRight: "2px solid" },
            { bottom: 7, left: 7, borderBottom: "2px solid", borderLeft: "2px solid" },
            { bottom: 7, right: 7, borderBottom: "2px solid", borderRight: "2px solid" },
          ][i];
          return <div key={i} style={{ ...s, ...pos }} />;
        })}
        {boxes.map((b) => (
          <div key={b.id} className={`box ${b.flag ? "flag" : ""}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
            <span className="ct">{b.id} · {Math.round(b.conf)}%</span>
          </div>
        ))}
        <div className="burn" style={{ top: 8, left: 30 }}>{cam.id} · {cam.role}</div>
        <div className="burn" style={{ top: 8, right: 30, textAlign: "right" }}>{hhmmss(new Date())}</div>
        <div className="burn rec" style={{ bottom: 8, left: 30 }}><span className="d" />REC</div>
        <div className="burn" style={{ bottom: 8, right: 30 }}>{cam.res}</div>
      </div>
      <div className="meta">
        <span className={`chip ${cam.chip}`}>{cam.role}</span>
        <span className="dim" style={{ fontSize: 11 }}>{cam.name}</span>
        <span className="spacer" />
        <span style={{ color: "var(--green)", display: "inline-flex", gap: 5, alignItems: "center" }}>
          <Wifi size={12} /> LIVE
        </span>
      </div>
    </div>
  );
}

function EventRow({ e, onAck }) {
  const Icon = e.icon || Activity;
  return (
    <div className="evt">
      <div className={`ic bg-${e.sev}`}><Icon size={14} /></div>
      <div className="bd">
        <div className="ttl">
          <span>{e.type}</span>
          <span className={`tagdot bg-${e.sev}`}>{e.sev}</span>
        </div>
        <div className="sub">
          <span>{e.cam}</span><span>·</span><span>{e.zone}</span>
          {e.track && <><span>·</span><span style={{ color: "var(--cyan)" }}>{e.track}</span></>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className="tm">{e.time}</span>
        {e.sev !== "info" && (
          <button className={`ack ${e.ack ? "done" : ""}`} onClick={() => !e.ack && onAck(e.id)}>
            {e.ack ? "ACK ✓" : "ACK"}
          </button>
        )}
      </div>
    </div>
  );
}

function PersonCard({ p }) {
  const cls = p.st === "FLAGGED" ? "flag" : p.st === "LOST" ? "" : "ok";
  const col = p.st === "FLAGGED" ? "var(--red)" : p.st === "LOST" ? "var(--dim)" : "var(--cyan)";
  return (
    <div className="person">
      <div className="hd">
        <div className={`avatar ${cls}`}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke={col} strokeWidth="1.4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke={col} strokeWidth="1.4" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--fd)", letterSpacing: 1 }}>{p.id}</div>
          <div style={{ fontSize: 10, color: col, letterSpacing: 1.4, fontFamily: "var(--fd)" }}>{p.st}</div>
          <div className="qbar"><i style={{ width: `${p.q}%` }} /></div>
        </div>
      </div>
      <div className="prow"><span className="dim">LAST SEEN</span><span>{p.cam}</span></div>
      <div className="prow"><span className="dim">ZONE</span><span>{p.zone}</span></div>
      <div className="prow"><span className="dim">DWELL</span>
        <span style={{ color: p.dwell > 300 ? "var(--amber)" : "var(--txt)" }}>
          {Math.floor(p.dwell / 60)}m {Math.round(p.dwell % 60)}s
        </span>
      </div>
      <div className="prow"><span className="dim">QUALITY</span><span className="cyan">{Math.round(p.q)}%</span></div>
    </div>
  );
}

/* ----------------------------- views ----------------------------- */
function KPIStrip({ people, boxCount, alerts, lat, temp, hist }) {
  const trend = (a) => (a.length < 2 ? 0 : a[a.length - 1] - a[a.length - 2]);
  const arrow = (t) => (t > 0 ? ["▲", "up"] : t < 0 ? ["▼", "down"] : ["▬", "neutral"]);
  const present = people.filter((p) => p.st === "TRACKING").length;
  const cards = [
    { k: "PEOPLE PRESENT", I: Users, v: present, s: hist.people, c: "var(--cyan)", sub: "in active zones" },
    { k: "ACTIVE TRACKS", I: Crosshair, v: boxCount, s: hist.tracks, c: "var(--violet)", sub: "bytetrack ids" },
    { k: "ALERTS · 24H", I: Bell, v: alerts, s: hist.alerts, c: "var(--amber)", sub: "warning + critical" },
    { k: "AVG INFER", I: Zap, v: Math.round(lat), s: hist.infer, c: "var(--green)", sub: "ms · yolo26n ncnn", unit: "ms" },
    { k: "NODE TEMP", I: Thermometer, v: Math.round(temp), s: hist.temp, c: "var(--red)", sub: "pi-01 soc", unit: "°C" },
  ];
  return (
    <div className="kpis">
      {cards.map((c) => {
        const [ar, cl] = arrow(trend(c.s));
        return (
          <div className="kpi" key={c.k}>
            <div className="k"><c.I size={12} />{c.k}</div>
            <div className="v">{c.v}{c.unit && <span style={{ fontSize: 14, color: "var(--dim)" }}> {c.unit}</span>}</div>
            <div className={`s ${cl}`}><span>{ar}</span><span className="dim">{c.sub}</span></div>
            <Sparkline data={c.s} color={c.c} />
          </div>
        );
      })}
    </div>
  );
}

function TelemetryPanel({ tel }) {
  return (
    <div className="tel">
      <div className="panel">
        <div className="ph"><Cpu size={14} className="cyan" /><span className="t">Edge Telemetry</span><span className="r">pi-01 · cpu mode</span></div>
        <div className="pb">
          <div className="gauges">
            <Gauge label="CPU" value={tel.cpu} unit="%" max={100} color="var(--cyan)" />
            <Gauge label="MEMORY" value={tel.mem} unit="%" max={100} color="var(--violet)" />
            <Gauge label="THERMAL" value={tel.temp} unit="°C" max={90} color="var(--amber)" />
          </div>
          <div className="fps">
            {[["CAM-01", tel.fps[0], 8], ["CAM-02", tel.fps[1], 12], ["CAM-03", tel.fps[2], 10]].map(([n, f, mx]) => (
              <div className="fpsrow" key={n}>
                <span className="dim">{n}</span>
                <div className="fpsbar"><i style={{ width: `${clamp((f / mx) * 100, 4, 100)}%` }} /></div>
                <span style={{ textAlign: "right", color: "var(--cyan)" }}>{f.toFixed(1)} fps</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="ph"><Activity size={14} className="cyan" /><span className="t">Inference Latency</span><span className="r">ms · last 24 samples</span></div>
        <div className="pb" style={{ height: 232 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={tel.lat} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3ae7d6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3ae7d6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(126,162,226,.10)" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis tick={{ fill: "#5b6f90", fontSize: 10, fontFamily: "JetBrains Mono" }} domain={[40, 160]} />
              <Tooltip contentStyle={{ background: "#0c1322", border: "1px solid rgba(126,162,226,.24)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11, color: "#e8eefb" }} labelStyle={{ display: "none" }} formatter={(v) => [`${Math.round(v)} ms`, "latency"]} />
              <Area type="monotone" dataKey="ms" stroke="#3ae7d6" strokeWidth={1.8} fill="url(#lat)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CommandView({ events, people, tel, boxes, ackEvent, hist }) {
  const boxCount = boxes.reduce((n, b) => n + b.length, 0);
  const alerts = Math.min(events.filter((e) => e.sev !== "info").length + 9, 99);
  return (
    <>
      <KPIStrip people={people} boxCount={boxCount} alerts={alerts} lat={tel.lat[tel.lat.length - 1]?.ms || 0} temp={tel.temp} hist={hist} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }} className="cmd-mid">
        <div className="panel">
          <div className="ph"><Camera size={14} className="cyan" /><span className="t">Live Monitoring</span><span className="r">3 nodes · annotated stream</span></div>
          <div className="pb"><div className="cams">
            {CAMERAS.map((c, i) => <CameraTile key={c.id} cam={c} boxes={boxes[i]} idx={i} />)}
          </div></div>
        </div>
        <div className="panel">
          <div className="ph"><Radio size={14} className="cyan" /><span className="t">Event Stream</span>
            <span className="r" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />LIVE</span>
          </div>
          <div className="scroll">{events.slice(0, 16).map((e) => <EventRow key={e.id} e={e} onAck={ackEvent} />)}</div>
        </div>
      </div>
      <TelemetryPanel tel={tel} />
      <div className="panel">
        <div className="ph"><Users size={14} className="cyan" /><span className="t">Identity Database</span><span className="r">most recent · best-frame capture</span></div>
        <div className="pb"><div className="roster">{people.slice(0, 4).map((p) => <PersonCard key={p.id} p={p} />)}</div></div>
      </div>
    </>
  );
}

function LiveWallView({ boxes, people }) {
  const inFrame = boxes.flatMap((arr, i) => arr.map((b) => ({ ...b, cam: CAMERAS[i].id })));
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }} className="cmd-mid">
        <CameraTile cam={CAMERAS[1]} boxes={boxes[1]} idx={1} />
        <div className="panel">
          <div className="ph"><Crosshair size={14} className="cyan" /><span className="t">In Frame Now</span><span className="r">{inFrame.length} tracks</span></div>
          <div className="trackside">
            {inFrame.map((b) => (
              <div className="tk" key={b.cam + b.id}>
                <span className="tkid">{b.id}</span>
                <span className="dim">{b.cam}</span>
                <span className="spacer" />
                {b.flag && <span className="tagdot bg-critical">FLAGGED</span>}
                <span style={{ color: "var(--cyan)" }}>{Math.round(b.conf)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="wall">
        <CameraTile cam={CAMERAS[0]} boxes={boxes[0]} idx={0} />
        <CameraTile cam={CAMERAS[2]} boxes={boxes[2]} idx={2} />
      </div>
    </>
  );
}

function RosterView({ people }) {
  const [f, setF] = useState("ALL");
  const list = f === "ALL" ? people : people.filter((p) => p.st === f);
  return (
    <div className="panel">
      <div className="ph"><Users size={14} className="cyan" /><span className="t">Identity Roster</span>
        <span className="r">{people.length} identities tracked</span></div>
      <div className="pb">
        <div className="filters" style={{ marginBottom: 14 }}>
          <span className="pill" style={{ flex: 1, justifyContent: "flex-start" }}><Search size={13} /> query identity, zone, camera…</span>
          {["ALL", "TRACKING", "FLAGGED", "LOST"].map((x) =>
            <button key={x} className={`fbtn ${f === x ? "on" : ""}`} onClick={() => setF(x)}>{x}</button>)}
        </div>
        <div className="roster">{list.map((p) => <PersonCard key={p.id} p={p} />)}</div>
      </div>
    </div>
  );
}

function AlertsView({ events, ackEvent }) {
  const [f, setF] = useState("ALL");
  const list = events.filter((e) => f === "ALL" ? true : e.sev === f.toLowerCase());
  return (
    <div className="panel">
      <div className="ph"><Bell size={14} className="cyan" /><span className="t">Alert Center</span>
        <span className="r">{events.filter((e) => e.sev !== "info" && !e.ack).length} unacknowledged</span></div>
      <div className="pb" style={{ paddingBottom: 0 }}>
        <div className="filters" style={{ marginBottom: 12 }}>
          {["ALL", "CRITICAL", "WARNING", "INFO"].map((x) =>
            <button key={x} className={`fbtn ${f === x ? "on" : ""}`} onClick={() => setF(x)}>{x}</button>)}
        </div>
      </div>
      <div className="scroll" style={{ maxHeight: 560 }}>{list.map((e) => <EventRow key={e.id} e={e} onAck={ackEvent} />)}</div>
    </div>
  );
}

function AnalyticsView({ tel, people }) {
  const zoneCounts = ZONES.map((z) => ({ z, n: people.filter((p) => p.zone === z).length }));
  const maxN = Math.max(1, ...zoneCounts.map((c) => c.n));
  return (
    <>
      <TelemetryPanel tel={tel} />
      <div className="panel">
        <div className="ph"><MapPin size={14} className="cyan" /><span className="t">Zone Occupancy</span><span className="r">live headcount</span></div>
        <div className="pb fps">
          {zoneCounts.map((c) => (
            <div className="fpsrow" key={c.z} style={{ gridTemplateColumns: "120px 1fr 36px" }}>
              <span className="dim">{c.z}</span>
              <div className="fpsbar"><i style={{ width: `${(c.n / maxN) * 100}%`, background: "linear-gradient(90deg,#6d5bd0,var(--violet))" }} /></div>
              <span style={{ textAlign: "right", color: "var(--violet)" }}>{c.n}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AuditView({ events }) {
  const rows = [
    { t: "10:42:18", u: "admin@watchpost", a: "ALERT ACKNOWLEDGED", d: "intrusion · CAM-02 · T-211" },
    { t: "10:41:55", u: "officer@watchpost", a: "LOGIN", d: "session opened · role officer" },
    { t: "10:38:02", u: "admin@watchpost", a: "CONFIG CHANGED", d: "CAM-02 restricted zone updated" },
    { t: "10:35:47", u: "admin@watchpost", a: "USER ROLE CHANGED", d: "viewer → officer · k.rao" },
    { t: "10:30:11", u: "system", a: "NODE ONLINE", d: "pi-01 · 3 cameras registered" },
    { t: "10:29:50", u: "admin@watchpost", a: "LOGIN", d: "session opened · role admin" },
  ];
  return (
    <div className="panel">
      <div className="ph"><ScrollText size={14} className="cyan" /><span className="t">Audit Log</span><span className="r">admin only · RLS enforced</span></div>
      <div className="trackside">
        {rows.map((r, i) => (
          <div className="tk" key={i} style={{ gap: 12 }}>
            <span className="tm" style={{ color: "var(--mid)" }}>{r.t}</span>
            <span style={{ color: "var(--cyan)", minWidth: 130, fontSize: 11, fontFamily: "var(--fd)", letterSpacing: 1 }}>{r.a}</span>
            <span className="dim" style={{ fontSize: 11 }}>{r.u}</span>
            <span className="spacer" />
            <span style={{ fontSize: 11 }}>{r.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  { key: "command", I: LayoutGrid, t: "Command" },
  { key: "live", I: Camera, t: "Live wall" },
  { key: "people", I: Users, t: "Roster" },
  { key: "alerts", I: Bell, t: "Alerts" },
  { key: "analytics", I: BarChart3, t: "Analytics" },
  { key: "audit", I: ScrollText, t: "Audit" },
];

const seedSeries = (b, a, n = 12) => Array.from({ length: n }, () => Math.round(b + rnd(-a, a)));
const push = (arr, v) => [...arr.slice(-13), v];

export default function WatchpostMockup() {
  const [view, setView] = useState("command");
  const [now, setNow] = useState(new Date());
  const [boxes, setBoxes] = useState(() => INIT_BOXES.map((a) => a.map((b) => ({ ...b }))));
  const [people, setPeople] = useState(SEED_PEOPLE);
  const [tel, setTel] = useState(() => ({
    cpu: 61, mem: 58, temp: 64, fps: [2.1, 7.4, 5.2],
    lat: Array.from({ length: 24 }, (_, i) => ({ i, ms: Math.round(85 + rnd(-18, 18)) })),
  }));
  const [hist, setHist] = useState(() => ({
    people: seedSeries(5, 2), tracks: seedSeries(4, 1), alerts: seedSeries(11, 4),
    infer: seedSeries(85, 15), temp: seedSeries(64, 5),
  }));
  const [events, setEvents] = useState(() => {
    const base = Date.now();
    return Array.from({ length: 10 }, (_, k) => {
      const p = EVENT_POOL[k % EVENT_POOL.length];
      return {
        id: base - k, type: p.type, sev: p.sev, icon: p.icon,
        cam: pick(["CAM-01", "CAM-02", "CAM-03"]), zone: pick(ZONES),
        track: Math.random() > 0.3 ? "T-" + Math.floor(rnd(150, 260)) : null,
        time: hhmmss(new Date(base - k * 31000)), ack: false,
      };
    });
  });

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // tracking boxes — gentle random walk within the tile
  useEffect(() => {
    const t = setInterval(() => {
      setBoxes((prev) => prev.map((arr) => arr.map((b) => {
        const nx = clamp(b.x + rnd(-2.2, 2.2), 4, 100 - b.w - 2);
        const ny = clamp(b.y + rnd(-1.4, 1.4), 8, 100 - b.h - 2);
        return { ...b, x: nx, y: ny, conf: clamp(b.conf + rnd(-3, 3), 62, 98) };
      })));
    }, 220);
    return () => clearInterval(t);
  }, []);

  // telemetry + latency + sparkline histories
  useEffect(() => {
    const t = setInterval(() => {
      setTel((p) => {
        const last = p.lat[p.lat.length - 1].ms;
        const spike = Math.random() < 0.12 ? rnd(20, 38) : 0;
        const ms = Math.round(clamp(last + rnd(-12, 12) + spike, 56, 150));
        return {
          cpu: Math.round(clamp(p.cpu + rnd(-6, 6), 34, 86)),
          mem: Math.round(clamp(p.mem + rnd(-4, 4), 42, 78)),
          temp: Math.round(clamp(p.temp + rnd(-2, 2), 54, 79)),
          fps: [clamp(p.fps[0] + rnd(-.4, .4), 1.4, 3.2), clamp(p.fps[1] + rnd(-.8, .8), 4, 9), clamp(p.fps[2] + rnd(-.6, .6), 3, 7)],
          lat: [...p.lat.slice(1), { i: p.lat[p.lat.length - 1].i + 1, ms }],
        };
      });
      setHist((h) => ({
        people: push(h.people, clamp(h.people.at(-1) + Math.round(rnd(-1, 1)), 3, 9)),
        tracks: push(h.tracks, clamp(h.tracks.at(-1) + Math.round(rnd(-1, 1)), 2, 7)),
        alerts: push(h.alerts, clamp(h.alerts.at(-1) + Math.round(rnd(0, 1.4)), 5, 34)),
        infer: push(h.infer, Math.round(clamp(h.infer.at(-1) + rnd(-10, 10), 56, 150))),
        temp: push(h.temp, clamp(h.temp.at(-1) + Math.round(rnd(-2, 2)), 54, 79)),
      }));
      setPeople((ppl) => ppl.map((p) => p.st === "TRACKING" ? { ...p, dwell: p.dwell + 1.5 } : p));
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // event stream
  useEffect(() => {
    const t = setInterval(() => {
      setEvents((prev) => {
        const p = pick(EVENT_POOL);
        const e = {
          id: Date.now(), type: p.type, sev: p.sev, icon: p.icon,
          cam: pick(["CAM-01", "CAM-02", "CAM-03"]), zone: pick(ZONES),
          track: Math.random() > 0.3 ? "T-" + Math.floor(rnd(150, 260)) : null,
          time: hhmmss(new Date()), ack: false,
        };
        return [e, ...prev].slice(0, 60);
      });
    }, 2600);
    return () => clearInterval(t);
  }, []);

  const ackEvent = (id) => setEvents((prev) => prev.map((e) => e.id === id ? { ...e, ack: true } : e));

  return (
    <div className="se">
      <style>{CSS}</style>
      <div className="app">
        <nav className="rail">
          <div className="brand"><Shield size={18} /></div>
          {NAV.map((n) => (
            <div key={n.key} className={`nav ${view === n.key ? "on" : ""}`} title={n.t} onClick={() => setView(n.key)}>
              <n.I size={19} />
            </div>
          ))}
        </nav>
        <div className="main">
          <header className="top">
            <span className="wordmark">WATCH<b>POST</b></span>
            <span className="tag">EDGE-AI · YOLO26</span>
            <span className="spacer" />
            <span className="pill"><span className="d" style={{ background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />PI-01 ONLINE</span>
            <span className="pill"><Camera size={12} /> 3 CAMERAS</span>
            <span className="pill" style={{ fontVariantNumeric: "tabular-nums", color: "var(--txt)" }}>
              <Clock size={12} className="dim" /> {hhmmss(now)} <span className="dim">UTC</span>
            </span>
            <div className="usr">
              <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                <div style={{ fontSize: 11 }}>admin@watchpost</div>
                <div className="lbl" style={{ fontSize: 8.5, color: "var(--cyan)" }}>ADMIN</div>
              </div>
              <div className="av">AD</div>
            </div>
          </header>
          <main className="content">
            {view === "command" && <CommandView events={events} people={people} tel={tel} boxes={boxes} ackEvent={ackEvent} hist={hist} />}
            {view === "live" && <LiveWallView boxes={boxes} people={people} />}
            {view === "people" && <RosterView people={people} />}
            {view === "alerts" && <AlertsView events={events} ackEvent={ackEvent} />}
            {view === "analytics" && <AnalyticsView tel={tel} people={people} />}
            {view === "audit" && <AuditView events={events} />}
          </main>
        </div>
      </div>
    </div>
  );
}
