from __future__ import annotations

import time

import numpy as np
import pytest

from watchpost.cameras import CaptureThread, Picamera2Backend, V4L2Backend, make_backend


class FlakyBackend:
    """Fails to open twice, then delivers 5 frames, then goes dark."""

    opens = 0

    def __init__(self) -> None:
        self.reads = 0

    def open(self) -> None:
        FlakyBackend.opens += 1
        if FlakyBackend.opens <= 2:
            raise OSError("no such device")

    def read(self):
        self.reads += 1
        if self.reads <= 5:
            return np.full((4, 4, 3), self.reads, np.uint8)
        return None

    def close(self) -> None:
        pass


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


def test_capture_thread_reconnects_and_keeps_latest():
    FlakyBackend.opens = 0
    t = CaptureThread("cam-x", FlakyBackend, max_failed_reads=3,
                      backoff_min_s=0.01, backoff_max_s=0.05).start()
    try:
        assert wait_for(lambda: t.latest() is not None)
        assert wait_for(lambda: FlakyBackend.opens >= 4)  # went dark, reopened
        f = t.latest()
        assert f is not None and f.seq >= 5 and int(f.image[0, 0, 0]) == 5
    finally:
        t.stop()


def test_make_backend():
    assert isinstance(make_backend("v4l2", 0, 640, 480, 15), V4L2Backend)
    assert isinstance(make_backend("picamera2", 0, 640, 480, 15), Picamera2Backend)
    with pytest.raises(ValueError):
        make_backend("gstreamer", 0, 640, 480, 15)


def test_picamera2_import_is_lazy():
    b = Picamera2Backend(0, 640, 480)  # constructing must not import picamera2
    assert b.read() is None
