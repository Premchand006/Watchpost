from __future__ import annotations

from conftest import textured

from watchpost.motion import MotionGate


def test_static_scene_has_no_motion_and_moving_block_does():
    gate = MotionGate(min_area_frac=0.004, warmup_frames=10)
    bg = textured(240, 320, seed=1)
    results = [gate.update(bg) for _ in range(40)]
    assert not any(results)

    hits = []
    for i in range(10):
        frame = bg.copy()
        x = 20 + i * 15
        frame[80:180, x:x + 50] = 255
        hits.append(gate.update(frame))
    assert all(hits)
    assert gate.last_fraction > 0.004


def test_warmup_suppresses_first_frames():
    gate = MotionGate(warmup_frames=5)
    assert not any(gate.update(textured(120, 160, seed=i)) for i in range(5))
