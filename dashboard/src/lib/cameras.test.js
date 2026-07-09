import { describe, expect, it } from "vitest";
import { STALE_MS, cameraHealth, isLive, snapshotPaths } from "./cameras";

const now = Date.parse("2026-01-01T12:00:00Z");
const secsAgo = (s) => new Date(now - s * 1000).toISOString();

describe("cameraHealth", () => {
  it("is online when status is online and last_seen is recent", () => {
    expect(cameraHealth({ status: "online", last_seen: secsAgo(5) }, now)).toBe("online");
    expect(isLive({ status: "online", last_seen: secsAgo(5) }, now)).toBe(true);
  });

  it("is stale when last_seen is older than 30 s, even if status says online", () => {
    expect(STALE_MS).toBe(30_000);
    expect(cameraHealth({ status: "online", last_seen: secsAgo(31) }, now)).toBe("stale");
    expect(cameraHealth({ status: "online", last_seen: secsAgo(29) }, now)).toBe("online");
    expect(isLive({ status: "online", last_seen: secsAgo(120) }, now)).toBe(false);
  });

  it("is stale when last_seen is missing or invalid", () => {
    expect(cameraHealth({ status: "online" }, now)).toBe("stale");
    expect(cameraHealth({ status: "online", last_seen: "nope" }, now)).toBe("stale");
  });

  it("keeps offline and tamper as reported", () => {
    expect(cameraHealth({ status: "offline", last_seen: secsAgo(1) }, now)).toBe("offline");
    expect(cameraHealth({ status: "tamper", last_seen: secsAgo(300) }, now)).toBe("tamper");
  });

  it("treats a missing status as offline", () => {
    expect(cameraHealth({}, now)).toBe("offline");
    expect(cameraHealth(null, now)).toBe("offline");
  });

  it("accepts a custom threshold", () => {
    expect(cameraHealth({ status: "online", last_seen: secsAgo(10) }, now, 5_000)).toBe("stale");
  });
});

describe("snapshotPaths", () => {
  it("tries snapshot_path, then node/camera, then the v1 path", () => {
    expect(snapshotPaths({ id: "cam-01", node_id: "pi-01", snapshot_path: "pi-01/cam-01-v2.jpg" }))
      .toEqual(["pi-01/cam-01-v2.jpg", "pi-01/cam-01.jpg", "cam-01.jpg"]);
  });

  it("drops duplicates and missing parts", () => {
    expect(snapshotPaths({ id: "cam-01", node_id: "pi-01", snapshot_path: "pi-01/cam-01.jpg" }))
      .toEqual(["pi-01/cam-01.jpg", "cam-01.jpg"]);
    expect(snapshotPaths({ id: "cam-02" })).toEqual(["cam-02.jpg"]);
    expect(snapshotPaths(null)).toEqual([]);
  });
});
