"""Pick one good identity crop per track and decide when it is worth re-uploading."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


def sharpness(crop: np.ndarray) -> float:
    """Variance of the Laplacian. Motion blur and defocus both pull it down."""
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def score_crop(crop: np.ndarray, xyxy: tuple[float, float, float, float],
               frame_w: int, frame_h: int) -> float:
    x1, y1, x2, y2 = xyxy
    area = max(0.0, (x2 - x1) * (y2 - y1)) / float(frame_w * frame_h)
    cx = (x1 + x2) / 2 / frame_w
    cy = (y1 + y2) / 2 / frame_h
    centered = 1.0 - (abs(cx - 0.5) + abs(cy - 0.5))  # 1.0 at the centre, 0 in a corner
    return sharpness(crop) * (0.5 + area) * max(0.1, centered)


def crop_box(frame: np.ndarray, xyxy: tuple[float, float, float, float]) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = (int(round(v)) for v in xyxy)
    x1, x2 = max(0, min(w, x1)), max(0, min(w, x2))
    y1, y2 = max(0, min(h, y1)), max(0, min(h, y2))
    return frame[y1:y2, x1:x2]


@dataclass
class _Best:
    uploaded_score: float = -1.0
    last_upload: float = float("-inf")
    pending_score: float = -1.0
    pending: np.ndarray | None = None


@dataclass(frozen=True)
class Upload:
    track_id: int
    crop: np.ndarray
    score: float


class BestFrameKeeper:
    """The first usable crop of a track uploads right away so the dashboard has a photo.
    After that a crop replaces it only when it beats the uploaded score by `min_gain`
    and the cooldown has passed. A better crop seen during the cooldown is held and
    sent once the cooldown ends, or when the track exits."""

    def __init__(self, cooldown_s: float = 3.0, min_gain: float = 0.15,
                 min_side_px: int = 24) -> None:
        self.cooldown_s = cooldown_s
        self.min_gain = min_gain
        self.min_side_px = min_side_px
        self._tracks: dict[int, _Best] = {}

    def consider(self, tid: int, frame: np.ndarray,
                 xyxy: tuple[float, float, float, float], now: float) -> Upload | None:
        crop = crop_box(frame, xyxy)
        if crop.shape[0] < self.min_side_px or crop.shape[1] < self.min_side_px:
            return None
        h, w = frame.shape[:2]
        score = score_crop(crop, xyxy, w, h)
        st = self._tracks.setdefault(tid, _Best())
        if score > st.pending_score and score > st.uploaded_score:
            st.pending_score, st.pending = score, crop.copy()
        return self._due(tid, st, now)

    def poll(self, tid: int, now: float) -> Upload | None:
        st = self._tracks.get(tid)
        return self._due(tid, st, now) if st else None

    def finish(self, tid: int) -> Upload | None:
        """Track ended: hand back a held crop if it beats what was uploaded."""
        st = self._tracks.pop(tid, None)
        if st is None or st.pending is None or not self._better(st):
            return None
        return Upload(tid, st.pending, st.pending_score)

    def _better(self, st: _Best) -> bool:
        if st.uploaded_score < 0:
            return True
        return st.pending_score > st.uploaded_score * (1.0 + self.min_gain)

    def _due(self, tid: int, st: _Best, now: float) -> Upload | None:
        if st.pending is None or not self._better(st):
            return None
        if now - st.last_upload < self.cooldown_s:
            return None
        up = Upload(tid, st.pending, st.pending_score)
        st.uploaded_score, st.last_upload = st.pending_score, now
        st.pending, st.pending_score = None, -1.0
        return up
