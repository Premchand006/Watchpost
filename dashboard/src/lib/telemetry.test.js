import { describe, expect, it } from "vitest";
import { fpsFor, parseFps, parseTelemetry } from "./telemetry";

describe("parseTelemetry", () => {
  it("reads a telemetry table row", () => {
    const t = parseTelemetry({
      node_id: "pi-01", cpu: 31.5, mem: 40, temp: 56.2, latency_ms: 77,
      fps: { "cam-01": 9.8, "cam-02": 10 }, created_at: "2026-01-01T00:00:00Z",
    });
    expect(t).toEqual({
      nodeId: "pi-01", cpu: 31.5, mem: 40, temp: 56.2, latency: 77,
      fps: { "cam-01": 9.8, "cam-02": 10 }, at: "2026-01-01T00:00:00Z",
    });
  });

  it("tolerates nulls, strings and alternate names", () => {
    const t = parseTelemetry({ cpu: null, mem_pct: "12", temp_c: "55.5", infer_ms: 80, fps: null });
    expect(t.cpu).toBe(0);
    expect(t.mem).toBe(12);
    expect(t.temp).toBe(55.5);
    expect(t.latency).toBe(80);
    expect(t.fps).toEqual({});
  });

  it("reads legacy v1 rows that kept values in meta", () => {
    const t = parseTelemetry({ meta: { cpu_temp: 61, engine_fps: 12 }, created_at: "x" });
    expect(t.temp).toBe(61);
    expect(t.cpu).toBe(0);
  });

  it("handles a missing row", () => {
    expect(parseTelemetry(undefined).cpu).toBe(0);
  });
});

describe("parseFps", () => {
  it("keeps numeric values by camera id", () => {
    expect(parseFps({ "cam-02": 7.5, "cam-01": "9", bad: "x", seed: true })).toEqual({ "cam-02": 7.5, "cam-01": 9 });
  });

  it("maps legacy arrays to cam-01, cam-02, ...", () => {
    expect(parseFps([9.8, 10, 7])).toEqual({ "cam-01": 9.8, "cam-02": 10, "cam-03": 7 });
  });

  it("returns an empty map for junk", () => {
    expect(parseFps("9")).toEqual({});
    expect(parseFps(undefined)).toEqual({});
  });
});

describe("fpsFor", () => {
  const fps = { "cam-01": 9.8, "CAM-03": 4 };

  it("looks up by id, not position", () => {
    expect(fpsFor(fps, "cam-01")).toBe(9.8);
    expect(fpsFor(fps, "cam-02")).toBeNull();
  });

  it("ignores case", () => {
    expect(fpsFor(fps, "cam-03")).toBe(4);
  });

  it("handles missing input", () => {
    expect(fpsFor(null, "cam-01")).toBeNull();
    expect(fpsFor(fps, undefined)).toBeNull();
  });
});
