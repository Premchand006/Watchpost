/* Small pure helpers shared across views. */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const hhmmss = (d) => new Date(d).toTimeString().slice(0, 8);

export const hhmm = (d) => new Date(d).toTimeString().slice(0, 5);

// Seconds to "3m 12s" (or "1h 04m" past an hour).
export function dwellLabel(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s >= 3600) {
    const m = Math.floor((s % 3600) / 60);
    return `${Math.floor(s / 3600)}h ${String(m).padStart(2, "0")}m`;
  }
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Dwell in seconds. The Pi sends dwell_s; older rows fall back to last - first seen.
export function dwellSeconds(person) {
  const d = Number(person?.dwell_s);
  if (person?.dwell_s != null && Number.isFinite(d)) return Math.max(0, d);
  if (!person?.first_seen || !person?.last_seen) return 0;
  return Math.max(0, (new Date(person.last_seen) - new Date(person.first_seen)) / 1000);
}

// "12s ago", "4m ago", "3h ago", "2d ago".
export function ago(iso, nowMs = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, (nowMs - t) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Quality stored as 0..1 or 0..100. Always returns 0..100.
export function qualityPct(q) {
  if (q == null) return 0;
  const n = Number(q);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.round(n <= 1 ? n * 100 : n), 0, 100);
}

// TRACKING if seen in the last 45 s, otherwise LOST. FLAGGED wins when set.
export function personState(person, nowMs = Date.now()) {
  if (person?.flagged) return "FLAGGED";
  const last = person?.last_seen ? new Date(person.last_seen).getTime() : 0;
  return nowMs - last < 45_000 ? "TRACKING" : "LOST";
}

// Stable key for a person row. v2 rows have `id`; v1 rows used (node_id, track_id).
export const personKey = (p) => p?.id ?? `${p?.node_id}:${p?.track_id}`;

export const personLabel = (p) => `P-${p?.track_id ?? "?"}`;
export const trackLabel = (id) => (id == null ? null : `T-${id}`);
