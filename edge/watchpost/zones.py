"""Per-camera zone rules: enter, exit, intrusion, loiter.

A track's position is the bottom-centre of its box (roughly the feet), which matches
how floor zones are drawn. The area outside every zone counts as zone None, so each
`enter` for a zone gets a matching `exit` for the same zone, and a person who walks
from one zone to another produces exit(old) then enter(new).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .config import ZoneConfig
from .events import Event


def point_in_polygon(x: float, y: float, poly: Sequence[tuple[float, float]]) -> bool:
    """Even-odd ray cast. Points exactly on an edge may fall either way."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_cross = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < x_cross:
                inside = not inside
        j = i
    return inside


@dataclass
class TrackState:
    track_id: int
    first_seen: float
    last_seen: float
    conf: float
    zone: str | None
    zone_since: float
    xyxy: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    loiter_fired: bool = False

    def dwell(self, now: float) -> float:
        return round(now - self.first_seen, 1)


class ZoneEngine:
    def __init__(self, zones: Sequence[ZoneConfig], loiter_seconds: float,
                 exit_after_s: float) -> None:
        self.zones = tuple(zones)
        self.loiter_seconds = loiter_seconds
        self.exit_after_s = exit_after_s
        self.tracks: dict[int, TrackState] = {}
        self.ended: list[TrackState] = []  # tracks removed since the engine last drained it

    def zone_at(self, x: float, y: float) -> ZoneConfig | None:
        # Config order decides which zone wins where polygons overlap.
        for z in self.zones:
            if point_in_polygon(x, y, z.polygon):
                return z
        return None

    def _entered(self, z: ZoneConfig | None, tid: int, conf: float) -> list[Event]:
        name = z.name if z else None
        out = [Event("enter", tid, {"conf": round(conf, 3), "zone": name})]
        if z is not None and z.restricted:
            out.append(Event("intrusion", tid, {"zone": name}))
        return out

    def observe(self, tid: int, point: tuple[float, float], conf: float, now: float,
                xyxy: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)) -> list[Event]:
        """Record a tracked detection. `point` is normalized (0..1)."""
        z = self.zone_at(*point)
        name = z.name if z else None
        st = self.tracks.get(tid)
        if st is None:
            self.tracks[tid] = TrackState(tid, now, now, conf, name, now, xyxy)
            return self._entered(z, tid, conf)
        st.last_seen, st.conf, st.xyxy = now, conf, xyxy
        if name == st.zone:
            return []
        out = [Event("exit", tid, {"zone": st.zone, "dwell_s": round(now - st.zone_since, 1)})]
        st.zone, st.zone_since, st.loiter_fired = name, now, False
        return out + self._entered(z, tid, conf)

    def tick(self, now: float) -> list[Event]:
        """Run every loop, YOLO or not, so exits fire when motion (and YOLO) stops."""
        out: list[Event] = []
        for tid in list(self.tracks):
            st = self.tracks[tid]
            if now - st.last_seen > self.exit_after_s:
                out.append(self._final_exit(st, st.last_seen))
                self.ended.append(self.tracks.pop(tid))
                continue
            dwell = now - st.zone_since
            if not st.loiter_fired and dwell > self.loiter_seconds:
                st.loiter_fired = True
                out.append(Event("loiter", tid, {"zone": st.zone, "dwell_s": round(dwell, 1)}))
        return out

    def close_all(self) -> list[Event]:
        """Exit every open track (shutdown)."""
        out = [self._final_exit(st, st.last_seen) for st in self.tracks.values()]
        self.ended.extend(self.tracks.values())
        self.tracks.clear()
        return out

    @staticmethod
    def _final_exit(st: TrackState, at: float) -> Event:
        return Event("exit", st.track_id, {
            "zone": st.zone,
            "dwell_s": st.dwell(at),
            "final": True,
        })
