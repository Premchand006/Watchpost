import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Shield, Camera, Clock, LogOut } from "lucide-react";
import { NAV, ROLE_LABEL, NODE_ID } from "../lib/constants";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { isLive } from "../lib/cameras";
import { hhmmss } from "../lib/format";

/* App chrome: left icon rail, sticky top bar, routed content. Admin-only nav
   items are hidden from other roles; RLS enforces the same rule server-side. */
export default function Shell() {
  const { profile, role, signOut } = useAuth();
  const { cameras, nowMs } = useData();
  const nav = useNavigate();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));
  const onlineCams = cameras.filter((c) => isLive(c, nowMs)).length;
  const nodeOnline = onlineCams > 0;
  const email = profile?.email || "signed in";
  const initials = (profile?.email || "?").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await signOut();
    nav("/login", { replace: true });
  }

  return (
    <div className="se">
      <a className="skip" href="#content">Skip to content</a>
      <div className="app">
        <nav className="rail" aria-label="Main">
          <div className="brand" aria-hidden="true"><Shield size={18} /></div>
          {items.map((n) => (
            <NavLink key={n.key} to={n.to} end={n.to === "/"} title={n.t} aria-label={n.t}
              className={({ isActive }) => `nav ${isActive ? "on" : ""}`}>
              <n.I size={19} aria-hidden="true" />
            </NavLink>
          ))}
          <div className="railspace" />
          <button type="button" className="nav" title="Sign out" aria-label="Sign out" onClick={handleSignOut}>
            <LogOut size={18} aria-hidden="true" />
          </button>
        </nav>

        <div className="main">
          <header className="top">
            <span className="wordmark">WATCH<b>POST</b></span>
            <span className="tag hide-sm">EDGE-AI · YOLO26</span>
            <span className="spacer" />
            <span className="pill hide-sm">
              <span className="d" style={{
                background: nodeOnline ? "var(--green)" : "var(--dim)",
                boxShadow: nodeOnline ? "0 0 8px var(--green)" : "none",
              }} />
              {NODE_ID.toUpperCase()} {nodeOnline ? "ONLINE" : "OFFLINE"}
            </span>
            <span className="pill hide-sm"><Camera size={12} aria-hidden="true" /> {onlineCams}/{cameras.length || 0} CAMERAS</span>
            <span className="pill" style={{ fontVariantNumeric: "tabular-nums", color: "var(--txt)" }}>
              <Clock size={12} className="dim" aria-hidden="true" /> {hhmmss(now)} <span className="dim">LOCAL</span>
            </span>
            <button type="button" className="usr" onClick={handleSignOut} title="Sign out" aria-label={`Sign out ${email}`}>
              <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                <div className="usremail">{email}</div>
                <div className="lbl" style={{ fontSize: 8.5, color: "var(--cyan)" }}>{ROLE_LABEL[role] || "-"}</div>
              </div>
              <div className="av" aria-hidden="true">{initials}</div>
            </button>
          </header>

          <main className="content" id="content" tabIndex={-1}>
            <Outlet context={{ now }} />
          </main>
        </div>
      </div>
    </div>
  );
}
