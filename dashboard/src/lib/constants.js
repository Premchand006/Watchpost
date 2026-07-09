import {
  Eye, Activity, Clock, ShieldAlert, Camera, AlertTriangle, ChevronRight,
  WifiOff, Wifi, LayoutGrid, Users, Bell, BarChart3, ScrollText, UserCog,
} from "lucide-react";

/* Shared constants: maps database codes (cloud/schema.sql) to labels and icons. */

export const PRODUCT = "Watchpost";

export const NODE_ID = import.meta.env.VITE_NODE_ID || "pi-01";

// events.type to label, icon and fallback severity. The row's own severity wins.
export const EVENT_META = {
  enter:     { label: "Zone entry",           icon: Eye,           sev: "info" },
  exit:      { label: "Zone exit",            icon: ChevronRight,  sev: "info" },
  intrusion: { label: "Restricted intrusion", icon: ShieldAlert,   sev: "critical" },
  loiter:    { label: "Loitering",            icon: Clock,         sev: "warning" },
  offline:   { label: "Camera offline",       icon: WifiOff,       sev: "critical" },
  online:    { label: "Camera online",        icon: Wifi,          sev: "info" },
  tamper:    { label: "Camera tamper",        icon: AlertTriangle, sev: "critical" },
};

export const EVENT_TYPES = Object.keys(EVENT_META);

export function eventMeta(type) {
  return EVENT_META[type] || { label: type || "Event", icon: Activity, sev: "info" };
}

export const severityOf = (e) => e?.severity || eventMeta(e?.type).sev;

// Camera role to accent chip class.
export const ROLE_CHIP = { identity: "vi", detect: "cy", perimeter: "gr" };

// Placeholder feed background per camera index.
export const FEED_CLASS = ["", "c2", "c3"];

// Left rail. `roles` hides an item from other roles. This is a convenience:
// RLS decides what the server returns.
export const NAV = [
  { key: "command",   to: "/",          I: LayoutGrid,  t: "Command" },
  { key: "live",      to: "/live",      I: Camera,      t: "Live wall" },
  { key: "people",    to: "/people",    I: Users,       t: "People" },
  { key: "alerts",    to: "/alerts",    I: Bell,        t: "Alerts" },
  { key: "analytics", to: "/analytics", I: BarChart3,   t: "Analytics" },
  { key: "audit",     to: "/audit",     I: ScrollText,  t: "Audit log", roles: ["admin"] },
  { key: "users",     to: "/users",     I: UserCog,     t: "Users",     roles: ["admin"] },
];

export const ROLES = ["admin", "officer", "viewer"];
export const ROLE_LABEL = { admin: "ADMIN", officer: "OFFICER", viewer: "VIEWER" };

// Roles allowed to acknowledge alerts (mirrors the events_ack policy).
export const CAN_ACK = ["admin", "officer"];
