"""Camera health: offline when frames stop, tamper on blackout or a sudden scene change."""

from __future__ import annotations

import cv2
import numpy as np

from .config import HealthConfig
from .events import Event

_THUMB = (32, 18)


def thumbnail(frame: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    return cv2.resize(gray, _THUMB, interpolation=cv2.INTER_AREA).astype(np.float32)


class CameraHealth:
    """Status is one of starting, online, offline, tamper.

    The scene is compared against a slow running average of a 32x18 grey thumbnail, so
    daylight drift is absorbed but a covered or turned camera is not. A person walking
    right past the lens also changes the thumbnail, which is why the change has to hold
    for `tamper_hold_s` before it counts. If the camera was moved on purpose and the new
    view stays steady for `rebaseline_s`, that view becomes the new reference.
    """

    def __init__(self, cfg: HealthConfig, now: float, check_interval_s: float = 0.5) -> None:
        self.cfg = cfg
        self.status = "starting"
        self.last_frame_ts = now
        self._check_every = check_interval_s
        self._next_check = 0.0
        self._ref: np.ndarray | None = None
        self._prev: np.ndarray | None = None
        self._suspect_since: float | None = None
        self._stable_since: float | None = None

    def on_frame(self, frame: np.ndarray, ts: float, now: float) -> list[Event]:
        self.last_frame_ts = ts
        out: list[Event] = []
        if self.status == "starting":
            self.status = "online"
        elif self.status == "offline":
            self.status = "online"
            out.append(Event("online"))
        if now >= self._next_check:
            self._next_check = now + self._check_every
            out.extend(self._check(thumbnail(frame), now))
        return out

    def tick(self, now: float) -> list[Event]:
        age = now - self.last_frame_ts
        if self.status != "offline" and age > self.cfg.offline_after_s:
            self.status = "offline"
            self._suspect_since = None
            return [Event("offline", meta={"last_frame_s": round(age, 1)})]
        return []

    def _check(self, thumb: np.ndarray, now: float) -> list[Event]:
        cfg = self.cfg
        prev, self._prev = self._prev, thumb
        if self._ref is None:
            self._ref = thumb
            return []
        luma = float(thumb.mean())
        diff = float(np.abs(thumb - self._ref).mean())
        if luma < cfg.blackout_luma:
            reason, score = "blackout", luma
        elif diff > cfg.scene_change_threshold:
            reason, score = "scene_change", diff
        else:
            self._suspect_since = self._stable_since = None
            self._ref = 0.95 * self._ref + 0.05 * thumb
            if self.status == "tamper":
                self.status = "online"
                return [Event("online")]
            return []

        if self._suspect_since is None:
            self._suspect_since = now
        if self.status != "tamper":
            if now - self._suspect_since >= cfg.tamper_hold_s:
                self.status = "tamper"
                self._stable_since = None
                return [Event("tamper", meta={"reason": reason, "score": round(score, 1)})]
            return []

        if reason == "scene_change" and prev is not None:
            steady = float(np.abs(thumb - prev).mean()) < cfg.scene_change_threshold / 4
            if not steady:
                self._stable_since = None
            elif self._stable_since is None:
                self._stable_since = now
            elif now - self._stable_since >= cfg.rebaseline_s:
                self._ref = thumb  # next check sees no change and reports online
        return []
