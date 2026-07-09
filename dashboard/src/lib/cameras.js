/* Camera status as the dashboard shows it. The Pi upserts each camera about
   every 10 s. If last_seen is older than STALE_MS the row is out of date (Pi
   down or offline), so an "online" status is shown as stale. */

export const STALE_MS = 30_000;

export function cameraHealth(cam, nowMs = Date.now(), staleMs = STALE_MS) {
  const status = cam?.status || "offline";
  if (status === "tamper" || status === "offline") return status;
  const seen = cam?.last_seen ? new Date(cam.last_seen).getTime() : NaN;
  if (!Number.isFinite(seen) || nowMs - seen > staleMs) return "stale";
  return status === "online" ? "online" : "stale";
}

export const isLive = (cam, nowMs) => cameraHealth(cam, nowMs) === "online";

/* Storage paths to try for a camera's snapshot, in order: the path the Pi
   reports, the current layout, then the v1 layout. */
export function snapshotPaths(cam) {
  if (!cam?.id) return [];
  const list = [
    cam.snapshot_path,
    cam.node_id ? `${cam.node_id}/${cam.id}.jpg` : null,
    `${cam.id}.jpg`,
  ].filter(Boolean);
  return [...new Set(list)];
}
