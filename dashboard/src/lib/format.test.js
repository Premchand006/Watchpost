import { describe, expect, it } from "vitest";
import {
  ago, clamp, dwellLabel, dwellSeconds, personKey, personLabel, personState, qualityPct, trackLabel,
} from "./format";

describe("format", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it("formats dwell", () => {
    expect(dwellLabel(0)).toBe("0m 0s");
    expect(dwellLabel(192)).toBe("3m 12s");
    expect(dwellLabel(3900)).toBe("1h 05m");
    expect(dwellLabel(null)).toBe("0m 0s");
    expect(dwellLabel(-4)).toBe("0m 0s");
  });

  it("prefers dwell_s and falls back to first/last seen", () => {
    expect(dwellSeconds({ dwell_s: 42.5 })).toBe(42.5);
    expect(dwellSeconds({ dwell_s: 0, first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-01-01T00:10:00Z" })).toBe(0);
    expect(dwellSeconds({ first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-01-01T00:01:30Z" })).toBe(90);
    expect(dwellSeconds({})).toBe(0);
    expect(dwellSeconds(null)).toBe(0);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(ago("2026-01-01T11:59:48Z", now)).toBe("12s ago");
    expect(ago("2026-01-01T11:56:00Z", now)).toBe("4m ago");
    expect(ago("2026-01-01T09:00:00Z", now)).toBe("3h ago");
    expect(ago("2025-12-30T12:00:00Z", now)).toBe("2d ago");
    expect(ago("2026-01-01T12:00:05Z", now)).toBe("0s ago");
    expect(ago("not a date", now)).toBe("");
  });

  it("normalises quality to 0..100", () => {
    expect(qualityPct(0.82)).toBe(82);
    expect(qualityPct(64)).toBe(64);
    expect(qualityPct(140)).toBe(100);
    expect(qualityPct(null)).toBe(0);
    expect(qualityPct("x")).toBe(0);
  });

  it("derives person state from last_seen", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(personState({ last_seen: "2026-01-01T11:59:30Z" }, now)).toBe("TRACKING");
    expect(personState({ last_seen: "2026-01-01T11:58:00Z" }, now)).toBe("LOST");
    expect(personState({}, now)).toBe("LOST");
    expect(personState({ flagged: true }, now)).toBe("FLAGGED");
  });

  it("keys people by id, with the v1 fallback", () => {
    expect(personKey({ id: "pi-01:cam-01:s1:5", node_id: "pi-01", track_id: 5 })).toBe("pi-01:cam-01:s1:5");
    expect(personKey({ node_id: "pi-01", track_id: 5 })).toBe("pi-01:5");
  });

  it("labels", () => {
    expect(personLabel({ track_id: 7 })).toBe("P-7");
    expect(trackLabel(7)).toBe("T-7");
    expect(trackLabel(null)).toBeNull();
  });
});
