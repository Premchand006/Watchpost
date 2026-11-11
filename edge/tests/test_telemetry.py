from __future__ import annotations

import numpy as np

import watchpost.telemetry as tm
from watchpost.config import ZoneConfig
from watchpost.detector import Detection
from watchpost.snapshot import render


def test_rolling_average_and_rate():
    avg = tm.RollingAverage(3)
    assert avg.value() is None
    for v in (10, 20, 30, 40):
        avg.add(v)
    assert avg.value() == 30
    rc = tm.RateCounter(window_s=5)
    for i in range(50):
        rc.mark(i * 0.1)
    assert 9.0 <= rc.rate(4.9) <= 10.5


def test_proc_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(tm, "psutil", None)
    (tmp_path / "stat").write_text("cpu  100 0 100 800 0 0 0 0 0 0\n")
    (tmp_path / "meminfo").write_text("MemTotal: 1000 kB\nMemAvailable: 250 kB\n")
    temp = tmp_path / "temp"
    temp.write_text("54321\n")
    s = tm.SystemStats(proc=tmp_path, thermal=temp)
    assert s.cpu() is None  # needs two samples
    (tmp_path / "stat").write_text("cpu  150 0 150 900 0 0 0 0 0 0\n")
    assert s.cpu() == 50.0
    assert s.mem() == 75.0
    assert s.temp() == 54.3


def test_snapshot_render_size():
    frame = np.zeros((720, 1280, 3), np.uint8)
    zones = (ZoneConfig("door", ((0.5, 0.0), (1.0, 0.0), (1.0, 1.0)), True),)
    jpg = render(frame, zones, [Detection((100, 100, 300, 500), 0.9, 4)])
    assert jpg is not None and jpg[:2] == b"\xff\xd8"
    import cv2

    img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape == (360, 640, 3)
    assert img[49:52, 60:140].max() > 100  # box top edge lands at the scaled y=50
