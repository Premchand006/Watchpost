/* Parsing for public.telemetry rows. The parser accepts a few alternate key
   names so an older or newer edge build still renders. Legacy v1 rows kept
   their numbers in `meta`; those are read too. */

const num = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (v != null && v !== "" && Number.isFinite(n)) return n;
  }
  return 0;
};

/* fps arrives as {"cam-01": 9.8, ...}. Older builds sent an array in camera
   order; map that to cam-01, cam-02, ... Non-numeric values are dropped. */
export function parseFps(fps) {
  const out = {};
  if (Array.isArray(fps)) {
    fps.forEach((v, i) => {
      const n = Number(v);
      if (Number.isFinite(n)) out[`cam-${String(i + 1).padStart(2, "0")}`] = n;
    });
    return out;
  }
  if (fps && typeof fps === "object") {
    for (const [k, v] of Object.entries(fps)) {
      const n = Number(v);
      if (v != null && v !== "" && typeof v !== "boolean" && Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

export function parseTelemetry(row) {
  const r = { ...(row?.meta || {}), ...(row || {}) };
  return {
    nodeId: r.node_id ?? null,
    cpu: num(r.cpu, r.cpu_pct),
    mem: num(r.mem, r.mem_pct, r.memory),
    temp: num(r.temp, r.temp_c, r.soc_temp, r.cpu_temp),
    latency: num(r.latency_ms, r.infer_ms, r.latency),
    fps: parseFps(r.fps),
    at: r.created_at ?? null,
  };
}

/* FPS for one camera, looked up by id (case-insensitive). */
export function fpsFor(fps, cameraId) {
  if (!fps || !cameraId) return null;
  if (cameraId in fps) return fps[cameraId];
  const want = String(cameraId).toLowerCase();
  const key = Object.keys(fps).find((k) => k.toLowerCase() === want);
  return key == null ? null : fps[key];
}
