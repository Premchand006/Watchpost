import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EventRow from "./EventRow";

afterEach(cleanup);

const now = Date.parse("2026-01-01T12:00:00Z");
const alert = {
  id: 1, type: "intrusion", severity: "critical", camera: "cam-02", track_id: 4,
  meta: { zone: "Dock" }, created_at: "2026-01-01T11:59:50Z",
};

describe("EventRow", () => {
  it("shows label, zone and track", () => {
    render(<EventRow e={alert} nowMs={now} />);
    expect(screen.getByText("Restricted intrusion")).toBeTruthy();
    expect(screen.getByText("Dock")).toBeTruthy();
    expect(screen.getByText("T-4")).toBeTruthy();
    expect(screen.getByText("10s ago")).toBeTruthy();
  });

  it("disables acknowledge for roles that cannot ack", () => {
    const onAck = vi.fn();
    render(<EventRow e={alert} nowMs={now} canAck={false} onAck={onAck} />);
    const btn = screen.getByRole("button", { name: "Acknowledge alert" });
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onAck).not.toHaveBeenCalled();
  });

  it("calls onAck with the event id", () => {
    const onAck = vi.fn();
    render(<EventRow e={alert} nowMs={now} canAck onAck={onAck} />);
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge alert" }));
    expect(onAck).toHaveBeenCalledWith(1);
  });

  it("has no ack button for info events", () => {
    render(<EventRow e={{ ...alert, type: "online", severity: "info" }} nowMs={now} canAck />);
    expect(screen.getByText("Camera online")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
