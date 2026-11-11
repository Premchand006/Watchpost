from __future__ import annotations

import numpy as np
from conftest import textured

from watchpost.config import HealthConfig
from watchpost.health import CameraHealth

CFG = HealthConfig(offline_after_s=5.0, blackout_luma=12.0, scene_change_threshold=40.0,
                   tamper_hold_s=2.0, rebaseline_s=6.0)


def feed(h: CameraHealth, frame: np.ndarray, start: float, seconds: float, step: float = 0.1):
    events = []
    t = start
    while t < start + seconds - 1e-9:
        events += h.on_frame(frame, t, t)
        events += h.tick(t)
        t = round(t + step, 6)
    return events, t


def types(evs):
    return [e.type for e in evs]


def test_offline_after_no_frames_then_online():
    h = CameraHealth(CFG, now=0.0)
    evs, t = feed(h, textured(90, 160), 0.0, 1.0)
    assert evs == [] and h.status == "online"
    assert h.tick(t + 4.0) == []
    evs = h.tick(t + 5.5)
    assert types(evs) == ["offline"] and evs[0].severity == "warning"
    assert h.tick(t + 9) == []  # reported once
    evs = h.on_frame(textured(90, 160), t + 10, t + 10)
    assert types(evs) == ["online"] and evs[0].severity == "info"


def test_never_started_goes_offline():
    h = CameraHealth(CFG, now=0.0)
    assert types(h.tick(6.0)) == ["offline"]


def test_blackout_tamper_and_recovery():
    h = CameraHealth(CFG, now=0.0)
    scene = textured(90, 160, seed=3)
    _, t = feed(h, scene, 0.0, 3.0)
    black = np.zeros_like(scene)
    evs, t2 = feed(h, black, t, 1.5)
    assert evs == []  # shorter than tamper_hold_s
    evs, t3 = feed(h, black, t2, 1.5)
    assert types(evs) == ["tamper"]
    assert evs[0].meta["reason"] == "blackout" and h.status == "tamper"
    evs, _ = feed(h, scene, t3, 1.0)
    assert types(evs) == ["online"] and h.status == "online"


def test_scene_change_tamper_and_rebaseline():
    h = CameraHealth(CFG, now=0.0)
    scene = np.full((90, 160, 3), 60, np.uint8)
    scene[:, 80:] = 200
    _, t = feed(h, scene, 0.0, 3.0)
    turned = 255 - scene  # camera pointed somewhere else entirely
    evs, t = feed(h, turned, t, 3.0)
    assert types(evs) == ["tamper"] and evs[0].meta["reason"] == "scene_change"
    assert evs[0].meta["score"] > 40
    # the new view stays steady, so after rebaseline_s it becomes the reference
    evs, _ = feed(h, turned, t, 8.0)
    assert types(evs) == ["online"]


def test_brief_change_is_ignored():
    h = CameraHealth(CFG, now=0.0)
    scene = np.full((90, 160, 3), 60, np.uint8)
    _, t = feed(h, scene, 0.0, 3.0)
    evs, t = feed(h, 255 - scene, t, 1.0)  # something right in front of the lens for 1 s
    evs2, _ = feed(h, scene, t, 3.0)
    assert evs + evs2 == []
