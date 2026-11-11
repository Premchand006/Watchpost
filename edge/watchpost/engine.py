"""Main loop. Wires the per-camera modules together; the logic lives in those modules."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Protocol

import numpy as np

from .bestframe import BestFrameKeeper, Upload
from .cameras import Frame, FrameSource
from .config import AppConfig
from .detector import Detection, Detector
from .events import Event
from .health import CameraHealth
from .motion import MotionGate
from .runtime import CamRuntime, Outbox, base36, iso
from .snapshot import encode_jpeg, render
from .telemetry import RollingAverage, SystemStats
from .tracker import Tracker
from .zones import TrackState, ZoneEngine

log = logging.getLogger(__name__)
class StopFlag(Protocol):
    def is_set(self) -> bool: ...


class Engine:
    def __init__(self, cfg: AppConfig, sources: Mapping[str, FrameSource],
                 detector: Detector | None, outbox: Outbox,
                 tracker_factory: Callable[[], Tracker],
                 clock: Callable[[], float] = time.time,
                 stats: SystemStats | None = None,
                 on_frame: Callable[[str, np.ndarray, Sequence[Detection]], None] | None = None,
                 ) -> None:
        self.cfg, self.detector, self.out, self.clock = cfg, detector, outbox, clock
        self.stats = stats or SystemStats()
        self.on_frame = on_frame
        now = clock()
        self.session = base36(int(now))
        self.latency = RollingAverage(50)
        self.next_telemetry = now + cfg.telemetry.interval_s
        self.next_prune = now + 60.0
        detecting = [c for c in cfg.cameras if c.detect]
        self.cams: list[CamRuntime] = []
        for c in cfg.cameras:
            stride = c.stride or cfg.schedule.stride
            # Spread detecting cameras across the stride so their YOLO ticks differ.
            idx = detecting.index(c) if c in detecting else 0
            offset = (idx * stride) // max(1, len(detecting)) if cfg.schedule.stagger else 0
            self.cams.append(CamRuntime(
                cfg=c, source=sources[c.id],
                motion=MotionGate(cfg.schedule.motion_min_area_frac),
                tracker=tracker_factory() if c.detect else None,
                zones=ZoneEngine(c.zones, c.loiter_seconds, cfg.tracking.exit_after_s),
                best=BestFrameKeeper(cfg.bestframe.upload_cooldown_s, cfg.bestframe.min_gain),
                health=CameraHealth(cfg.health, now),
                stride=stride, offset=offset,
            ))

    def person_id(self, cam: str, tid: int) -> str:
        return f"{self.cfg.node_id}:{cam}:{self.session}:{tid}"

    def run(self, stop: StopFlag) -> None:
        log.info("engine running on %d camera(s), session %s", len(self.cams), self.session)
        while not stop.is_set():
            if not self.step():
                time.sleep(0.005)
        self.finish()

    def step(self) -> bool:
        """One pass over all cameras. Returns False when no camera had a new frame."""
        now = self.clock()
        inferred = False
        any_new = False
        for rt in self.cams:
            frame = rt.source.latest()
            if frame is not None and frame.seq != rt.last_seq:
                any_new = True
                inferred = self._process(rt, frame, now, inferred) or inferred
            prev = rt.health.status
            for ev in rt.health.tick(now):
                self._emit(rt, ev)
            if rt.health.status != prev:
                self._camera_row(rt, now)
            self._age_tracks(rt, now)
            if now >= rt.next_snapshot:
                self._snapshot(rt, now)
            if now >= rt.next_heartbeat:
                self._camera_row(rt, now)
        if now >= self.next_telemetry:
            self._telemetry(now)
        return any_new

    def finish(self) -> None:
        now = self.clock()
        for rt in self.cams:
            for ev in rt.zones.close_all():
                self._emit(rt, ev)
            self._drain_ended(rt, now)
            rt.health.status = "offline"
            self._camera_row(rt, now)

    def _process(self, rt: CamRuntime, frame: Frame, now: float, busy: bool) -> bool:
        rt.last_seq, rt.image = frame.seq, frame.image
        rt.count += 1
        rt.fps.mark(now)
        prev = rt.health.status
        for ev in rt.health.on_frame(frame.image, frame.ts, now):
            self._emit(rt, ev)
        if rt.health.status != prev:
            self._camera_row(rt, now)
        motion = rt.cfg.detect and rt.motion.update(frame.image)
        if (rt.count + rt.offset) % rt.stride == 0:
            rt.due = True
        ran = False
        # Idle scenes skip YOLO; open tracks keep it going so a person standing still
        # (absorbed into the MOG2 background) does not get a false exit.
        if rt.due and not (rt.cfg.detect and self.detector and (motion or rt.zones.tracks)):
            rt.due = False
        elif rt.due and not busy:
            rt.due, ran = False, True
            self._detect(rt, frame.image, now)
        if self.on_frame:
            self.on_frame(rt.cfg.id, frame.image, rt.dets)
        return ran

    def _detect(self, rt: CamRuntime, image: np.ndarray, now: float) -> None:
        assert self.detector is not None and rt.tracker is not None
        t0 = time.perf_counter()
        boxes = self.detector.detect(image)
        self.latency.add((time.perf_counter() - t0) * 1000.0)
        rt.dets = rt.tracker.update(boxes)
        h, w = image.shape[:2]
        for d in rt.dets:
            if d.track_id is None:
                continue
            tid = d.track_id
            x1, y1, x2, y2 = d.xyxy
            point = (((x1 + x2) / 2) / w, y2 / h)
            events = rt.zones.observe(tid, point, d.conf, now, d.xyxy)
            for ev in events:
                self._emit(rt, ev)
            up = rt.best.consider(tid, image, d.xyxy, now)
            if up is not None:
                self._upload_best(rt, up)
            stale = now - rt.people_sent.get(tid, 0.0) >= self.cfg.tracking.people_refresh_s
            if events or up or stale:
                self._person(rt, rt.zones.tracks[tid], now)

    def _age_tracks(self, rt: CamRuntime, now: float) -> None:
        for ev in rt.zones.tick(now):
            self._emit(rt, ev)
        for tid in rt.zones.tracks:
            up = rt.best.poll(tid, now)
            if up is not None:
                self._upload_best(rt, up)
                self._person(rt, rt.zones.tracks[tid], now)
        self._drain_ended(rt, now)

    def _drain_ended(self, rt: CamRuntime, now: float) -> None:
        ended, rt.zones.ended = rt.zones.ended, []
        for st in ended:
            up = rt.best.finish(st.track_id)
            if up is not None:
                self._upload_best(rt, up)
            st.zone = None
            self._person(rt, st, now)
            rt.people_sent.pop(st.track_id, None)
            rt.best_info.pop(st.track_id, None)
        if ended:
            live = set(rt.zones.tracks)
            rt.dets = [d for d in rt.dets if d.track_id in live]

    def _emit(self, rt: CamRuntime, ev: Event) -> None:
        tid = ev.track_id
        row = {
            "node_id": self.cfg.node_id, "type": ev.type, "camera": rt.cfg.id,
            "track_id": tid,
            "person_id": self.person_id(rt.cfg.id, tid) if tid is not None else None,
            "severity": ev.severity, "meta": ev.meta,
            # Stamp here, not in Postgres, so rows flushed after an outage keep their real time.
            "created_at": iso(self.clock()),
        }
        log.info("%s %s T-%s %s", rt.cfg.id, ev.type, tid, ev.meta)
        self.out.insert("events", row)

    def _upload_best(self, rt: CamRuntime, up: Upload) -> None:
        data = encode_jpeg(up.crop, self.cfg.bestframe.jpeg_quality)
        if data is None:
            return
        pid = self.person_id(rt.cfg.id, up.track_id).replace(":", "_")
        path = f"{self.cfg.node_id}/{rt.cfg.id}/{pid}.jpg"
        self.out.upload("best-frames", path, data, durable=True)
        rt.best_info[up.track_id] = (path, round(up.score, 1))

    def _person(self, rt: CamRuntime, st: TrackState, now: float) -> None:
        row: dict[str, Any] = {
            "id": self.person_id(rt.cfg.id, st.track_id), "node_id": self.cfg.node_id,
            "camera": rt.cfg.id, "track_id": st.track_id, "zone": st.zone,
            "dwell_s": st.dwell(st.last_seen),
            "first_seen": iso(st.first_seen), "last_seen": iso(st.last_seen),
        }
        if st.track_id in rt.best_info:
            row["best_frame"], row["quality"] = rt.best_info[st.track_id]
        self.out.upsert("people", row, on_conflict="id")
        rt.people_sent[st.track_id] = now

    def _snapshot(self, rt: CamRuntime, now: float) -> None:
        rt.next_snapshot = now + self.cfg.snapshot.interval_s
        if rt.image is None or rt.health.status == "offline":
            return
        s = self.cfg.snapshot
        data = render(rt.image, rt.cfg.zones, rt.dets, (s.width, s.height), s.jpeg_quality)
        if data is not None:
            self.out.upload("snapshots", self._snapshot_path(rt), data, durable=False)

    def _snapshot_path(self, rt: CamRuntime) -> str:
        return f"{self.cfg.node_id}/{rt.cfg.id}.jpg"

    def _camera_row(self, rt: CamRuntime, now: float) -> None:
        rt.next_heartbeat = now + self.cfg.health.heartbeat_s
        status = "offline" if rt.health.status == "starting" else rt.health.status
        if rt.image is not None:
            res = f"{rt.image.shape[1]}x{rt.image.shape[0]}"
        else:
            res = f"{rt.cfg.width}x{rt.cfg.height}"
        self.out.upsert("cameras", {
            "id": rt.cfg.id, "node_id": self.cfg.node_id, "name": rt.cfg.name,
            "role": rt.cfg.role, "status": status, "last_seen": iso(rt.health.last_frame_ts),
            "fps": rt.fps.rate(now), "resolution": res, "snapshot_path": self._snapshot_path(rt),
        }, on_conflict="id")

    def _telemetry(self, now: float) -> None:
        t = self.cfg.telemetry
        self.next_telemetry = now + t.interval_s
        lat = self.latency.value()
        self.out.insert("telemetry", {
            "node_id": self.cfg.node_id, "cpu": self.stats.cpu(), "mem": self.stats.mem(),
            "temp": self.stats.temp(), "latency_ms": round(lat, 1) if lat is not None else None,
            "fps": {rt.cfg.id: rt.fps.rate(now) for rt in self.cams},
        })
        if now >= self.next_prune:
            self.next_prune = now + t.prune_every_s
            self.out.rpc("prune_telemetry", {"keep_hours": t.keep_hours})
