from __future__ import annotations

from typing import Any

import numpy as np
from conftest import FakeClock, checkerboard

from watchpost.cameras import Frame
from watchpost.config import parse_config
from watchpost.detector import Detection
from watchpost.engine import Engine

H, W = 240, 320
DT = 0.1


class FakeSource:
    def __init__(self, index: int, clock: FakeClock, person_x: int) -> None:
        self.index, self.clock, self.person_x = index, clock, person_x
        self.person = False
        self.frozen = False
        self.seq = 0
        self.frame: Frame | None = None
        grad = np.tile(np.linspace(40, 160, W, dtype=np.uint8), (H, 1))
        self.bg = np.dstack([grad] * 3)

    def box(self) -> tuple[float, float, float, float]:
        x = self.person_x + (self.seq % 2) * 2  # small sway keeps the motion gate awake
        return (x, 100.0, x + 40.0, 200.0)

    def advance(self) -> None:
        if self.frozen:
            return
        img = self.bg.copy()
        if self.person:
            x1, y1, x2, y2 = (int(v) for v in self.box())
            img[y1:y2, x1:x2] = checkerboard(y2 - y1, x2 - x1)
        img[0, 0] = self.index  # lets the fake detector tell cameras apart
        self.seq += 1
        self.frame = Frame(self.seq, self.clock(), img)

    def latest(self) -> Frame | None:
        return self.frame


class FakeDetector:
    def __init__(self, sources: list[FakeSource]) -> None:
        self.sources = sources
        self.step = 0
        self.calls: list[tuple[int, int]] = []  # (step, camera index)

    def detect(self, frame: np.ndarray) -> list[Detection]:
        src = self.sources[int(frame[0, 0, 0])]
        self.calls.append((self.step, src.index))
        return [Detection(src.box(), 0.88)] if src.person else []


class FakeTracker:
    """Every detection belongs to track 7: enough for rule tests."""

    def update(self, detections: list[Detection]) -> list[Detection]:
        return [Detection(d.xyxy, d.conf, 7) for d in detections]


class Outbox:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any]] = []

    def insert(self, table, row):
        self.calls.append(("insert", table, row))

    def upsert(self, table, row, on_conflict="id"):
        self.calls.append(("upsert", table, row))

    def upload(self, bucket, path, data, durable=True):
        self.calls.append(("upload", f"{bucket}/{path}", durable))

    def rpc(self, fn, params):
        self.calls.append(("rpc", fn, params))

    def events(self, cam=None):
        return [r for m, t, r in self.calls
                if t == "events" and (cam is None or r["camera"] == cam)]


class FakeStats:
    def cpu(self):
        return 12.5

    def mem(self):
        return 40.0

    def temp(self):
        return 51.2


def build(tmp_path, stagger=True):
    cfg = parse_config({
        "node_id": "pi-01",
        "model": {"path": "m"},
        "schedule": {"stride": 3, "stagger": stagger},
        "tracking": {"exit_after_s": 1.0, "people_refresh_s": 10},
        "bestframe": {"upload_cooldown_s": 1.0},
        "telemetry": {"interval_s": 1.0},
        "cameras": [
            {"id": "cam-a", "device": 0, "width": W, "height": H, "loiter_seconds": 2,
             "zones": [{"name": "door", "restricted": True,
                        "polygon": [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]}]},
            {"id": "cam-b", "device": 1, "width": W, "height": H, "loiter_seconds": 60},
        ],
    }, tmp_path)
    clock = FakeClock()
    sources = [FakeSource(0, clock, person_x=220), FakeSource(1, clock, person_x=60)]
    det = FakeDetector(sources)
    out = Outbox()
    eng = Engine(cfg, {"cam-a": sources[0], "cam-b": sources[1]}, det, out,
                 FakeTracker, clock=clock, stats=FakeStats())
    return eng, sources, det, out, clock


def run(eng, sources, det, clock, steps, start):
    for i in range(start, start + steps):
        det.step = i
        for s in sources:
            s.advance()
        eng.step()
        clock.advance(DT)
    return start + steps


def test_end_to_end_event_sequence_and_schedule(tmp_path):
    eng, sources, det, out, clock = build(tmp_path)
    step = run(eng, sources, det, clock, 30, 0)
    assert det.calls == []  # empty scene: motion gate keeps YOLO off

    for s in sources:
        s.person = True
    step = run(eng, sources, det, clock, 50, step)  # 5 s in view
    for s in sources:
        s.person = False
    step = run(eng, sources, det, clock, 50, step)

    a = out.events("cam-a")
    assert [e["type"] for e in a] == ["enter", "intrusion", "loiter", "exit"]
    assert a[0]["meta"]["zone"] == "door" and a[1]["severity"] == "critical"
    assert a[2]["severity"] == "warning" and a[2]["meta"]["dwell_s"] > 2
    assert a[3]["meta"]["final"] is True
    pid = f"pi-01:cam-a:{eng.session}:7"
    assert all(e["person_id"] == pid and e["node_id"] == "pi-01" for e in a)
    assert [e["type"] for e in out.events("cam-b")] == ["enter", "exit"]
    assert not any(e["type"] == "telemetry" for e in out.events())

    # YOLO only on stride ticks while there is motion or an open track, never both cameras
    # in the same pass, and nothing once the scene is empty again.
    steps = [s for s, _ in det.calls]
    assert len(steps) == len(set(steps))
    assert all(30 <= s < 110 for s in steps)
    for cam in (0, 1):
        n = sum(1 for s, c in det.calls if c == cam and s < 80)
        assert 12 <= n <= 18  # 50 frames / stride 3
    a_steps = {s for s, c in det.calls if c == 0}
    b_steps = {s for s, c in det.calls if c == 1}
    assert {s % 3 for s in a_steps} != {s % 3 for s in b_steps}

    people = [r for m, t, r in out.calls if t == "people" and r["id"] == pid]
    assert people and people[-1]["zone"] is None
    assert people[-1]["best_frame"] == f"pi-01/cam-a/pi-01_cam-a_{eng.session}_7.jpg"
    assert people[-1]["first_seen"].endswith("+00:00")
    uploads = {p: d for m, p, d in out.calls if m == "upload"}
    assert uploads[f"best-frames/pi-01/cam-a/pi-01_cam-a_{eng.session}_7.jpg"] is True
    assert uploads["snapshots/pi-01/cam-a.jpg"] is False

    tele = [r for m, t, r in out.calls if t == "telemetry"]
    assert len(tele) >= 10
    assert set(tele[-1]["fps"]) == {"cam-a", "cam-b"} and tele[-1]["temp"] == 51.2
    assert tele[-1]["fps"]["cam-a"] > 5
    assert any(r["latency_ms"] is not None for r in tele)

    cams = [r for m, t, r in out.calls if t == "cameras" and r["id"] == "cam-a"]
    assert cams[-1]["status"] == "online" and cams[-1]["resolution"] == f"{W}x{H}"
    assert cams[-1]["snapshot_path"] == "pi-01/cam-a.jpg"


def test_without_stagger_cameras_still_take_turns(tmp_path):
    eng, sources, det, out, clock = build(tmp_path, stagger=False)
    step = run(eng, sources, det, clock, 30, 0)
    for s in sources:
        s.person = True
    run(eng, sources, det, clock, 30, step)
    steps = [s for s, _ in det.calls]
    assert steps and len(steps) == len(set(steps))
    assert {c for _, c in det.calls} == {0, 1}


def test_exit_and_offline_fire_when_frames_stop(tmp_path):
    eng, sources, det, out, clock = build(tmp_path)
    step = run(eng, sources, det, clock, 30, 0)
    sources[0].person = True
    step = run(eng, sources, det, clock, 10, step)
    assert [e["type"] for e in out.events("cam-a")] == ["enter", "intrusion"]
    calls = len(det.calls)

    sources[0].frozen = True  # camera stops delivering: no frames, no motion, no YOLO
    run(eng, sources, det, clock, 70, step)
    assert all(c != 0 for _, c in det.calls[calls:])
    types = [e["type"] for e in out.events("cam-a")]
    assert types == ["enter", "intrusion", "exit", "offline"]
    cams = [r for m, t, r in out.calls if t == "cameras" and r["id"] == "cam-a"]
    assert cams[-1]["status"] == "offline"


def test_finish_closes_tracks_and_marks_cameras_offline(tmp_path):
    eng, sources, det, out, clock = build(tmp_path)
    step = run(eng, sources, det, clock, 30, 0)
    sources[1].person = True
    run(eng, sources, det, clock, 10, step)
    eng.finish()
    assert out.events("cam-b")[-1]["type"] == "exit"
    last = {r["id"]: r["status"] for m, t, r in out.calls if t == "cameras"}
    assert last == {"cam-a": "offline", "cam-b": "offline"}
