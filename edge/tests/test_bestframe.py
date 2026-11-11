from __future__ import annotations

import cv2
import numpy as np
from conftest import checkerboard

from watchpost.bestframe import BestFrameKeeper, score_crop, sharpness

W, H = 640, 480


def scene(box, blur: int = 0) -> np.ndarray:
    frame = np.full((H, W, 3), 90, np.uint8)
    x1, y1, x2, y2 = box
    patch = checkerboard(y2 - y1, x2 - x1)
    if blur:
        patch = cv2.GaussianBlur(patch, (blur, blur), 0)
    frame[y1:y2, x1:x2] = patch
    return frame


def test_sharpness_prefers_sharp():
    sharp = checkerboard(100, 100)
    assert sharpness(sharp) > 5 * sharpness(cv2.GaussianBlur(sharp, (15, 15), 0))


def test_score_prefers_sharp_large_centered():
    centre = (220, 140, 420, 340)
    sharp = score_crop(scene(centre)[140:340, 220:420], centre, W, H)
    blurry = score_crop(scene(centre, blur=15)[140:340, 220:420], centre, W, H)
    assert sharp > blurry

    small = (300, 220, 340, 260)
    assert sharp > score_crop(scene(small)[220:260, 300:340], small, W, H)

    corner = (0, 0, 200, 200)
    assert sharp > score_crop(scene(corner)[0:200, 0:200], corner, W, H)


def test_uploads_only_on_improvement_after_cooldown():
    k = BestFrameKeeper(cooldown_s=3.0, min_gain=0.15)
    box = (220, 140, 420, 340)
    first = k.consider(1, scene(box, blur=9), box, now=0.0)
    assert first is not None  # first usable crop goes up immediately

    assert k.consider(1, scene(box, blur=9), box, now=4.0) is None  # same quality

    k = BestFrameKeeper(cooldown_s=3.0, min_gain=0.15)
    first = k.consider(1, scene(box, blur=9), box, now=0.0)
    assert k.consider(1, scene(box), box, now=1.0) is None  # better, but in cooldown
    assert k.poll(1, now=2.0) is None
    up = k.poll(1, now=3.1)
    assert up is not None and up.score > first.score
    assert k.poll(1, now=10.0) is None  # nothing pending


def test_small_gain_is_ignored():
    k = BestFrameKeeper(cooldown_s=1.0, min_gain=1000.0)
    box = (220, 140, 420, 340)
    assert k.consider(2, scene(box, blur=5), box, now=0.0) is not None
    assert k.consider(2, scene(box), box, now=5.0) is None
    assert k.finish(2) is None


def test_finish_returns_crop_held_by_cooldown():
    k = BestFrameKeeper(cooldown_s=3.0, min_gain=0.15)
    box = (220, 140, 420, 340)
    assert k.consider(3, scene(box, blur=9), box, now=0.0) is not None
    assert k.consider(3, scene(box), box, now=1.0) is None
    held = k.finish(3)
    assert held is not None and held.track_id == 3
    assert k.finish(3) is None


def test_tiny_boxes_skipped():
    k = BestFrameKeeper()
    box = (10, 10, 20, 20)
    assert k.consider(1, scene((0, 0, 40, 40)), box, now=0.0) is None
