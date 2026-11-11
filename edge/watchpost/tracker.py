"""ByteTrack, one tracker per camera, updated only on YOLO ticks.

sv.ByteTrack was removed in supervision 0.31 and moved to Roboflow's `trackers` package
(ByteTrackTracker, same idea, `update()` instead of `update_with_detections()`).
requirements.txt pins supervision below 0.31; if `trackers` is installed instead, it is used.
"""

from __future__ import annotations

import warnings
from typing import Any, Protocol

import numpy as np

from .detector import Detection


class Tracker(Protocol):
    def update(self, detections: list[Detection]) -> list[Detection]: ...


class ByteTracker:
    """Returns only detections that ByteTrack matched to a track, with track_id set.

    Both implementations scale lost_track_buffer by frame_rate / 30. Passing 30 keeps
    the buffer in plain tracker updates, which here means YOLO ticks, not camera frames.
    At stride 5 and 15 fps, 30 updates is about 10 s.
    """

    def __init__(self, lost_track_buffer: int = 30) -> None:
        import supervision as sv

        self._sv = sv
        self._bt: Any
        if hasattr(sv, "ByteTrack"):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", FutureWarning)  # deprecation notice, see above
                self._bt = sv.ByteTrack(lost_track_buffer=lost_track_buffer, frame_rate=30)
            self._update = self._bt.update_with_detections
        else:
            from trackers import ByteTrackTracker

            self._bt = ByteTrackTracker(lost_track_buffer=lost_track_buffer, frame_rate=30)
            self._update = self._bt.update

    def update(self, detections: list[Detection]) -> list[Detection]:
        sv = self._sv
        if detections:
            dets = sv.Detections(
                xyxy=np.array([d.xyxy for d in detections], dtype=np.float32),
                confidence=np.array([d.conf for d in detections], dtype=np.float32),
                class_id=np.zeros(len(detections), dtype=int),
            )
        else:
            dets = sv.Detections.empty()
        out = self._update(dets)
        if out.tracker_id is None or len(out) == 0:
            return []
        conf = out.confidence if out.confidence is not None else np.ones(len(out))
        return [
            Detection(tuple(float(v) for v in box), float(c), int(tid))  # type: ignore[arg-type]
            for box, c, tid in zip(out.xyxy, conf, out.tracker_id, strict=True)
            if tid is not None and int(tid) >= 0  # trackers marks unconfirmed tracks with -1
        ]
