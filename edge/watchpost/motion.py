"""Cheap per-camera motion gate that runs before YOLO."""

from __future__ import annotations

import cv2
import numpy as np


class MotionGate:
    """MOG2 background subtraction on a 320x180 copy of the frame.

    MOG2 flags most of the first frames as foreground while it builds a background,
    so the gate reports no motion for `warmup_frames`.
    """

    def __init__(
        self,
        min_area_frac: float = 0.004,
        history: int = 300,
        var_threshold: float = 25.0,
        warmup_frames: int = 10,
        size: tuple[int, int] = (320, 180),
    ) -> None:
        self.min_area_frac = min_area_frac
        self._size = size
        self._warmup = warmup_frames
        self._seen = 0
        self._bg = cv2.createBackgroundSubtractorMOG2(
            history=history, varThreshold=var_threshold, detectShadows=False
        )
        self.last_fraction = 0.0

    def update(self, frame: np.ndarray) -> bool:
        small = cv2.resize(frame, self._size, interpolation=cv2.INTER_AREA)
        mask = self._bg.apply(small)
        self._seen += 1
        # Opening removes single-pixel sensor noise that would otherwise count as motion.
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        self.last_fraction = float(np.count_nonzero(mask)) / mask.size
        if self._seen <= self._warmup:
            return False
        return self.last_fraction > self.min_area_frac
