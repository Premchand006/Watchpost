"""Camera capture backends and a per-camera grab thread that keeps only the newest frame."""

from __future__ import annotations

import logging
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import cv2
import numpy as np

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Frame:
    seq: int
    ts: float  # wall-clock capture time (time.time)
    image: np.ndarray


class Backend(Protocol):
    def open(self) -> None: ...
    def read(self) -> np.ndarray | None: ...
    def close(self) -> None: ...


class FrameSource(Protocol):
    """What the engine reads from. CaptureThread and the test fakes implement it."""

    def latest(self) -> Frame | None: ...


class V4L2Backend:
    """USB cameras through OpenCV. On a non-Linux laptop it falls back to the default API."""

    def __init__(self, device: int | str, width: int, height: int, fps: int = 15) -> None:
        self.device, self.width, self.height, self.fps = device, width, height, fps
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        api = cv2.CAP_V4L2 if sys.platform.startswith("linux") else cv2.CAP_ANY
        cap = cv2.VideoCapture(self.device, api)
        if not cap.isOpened():
            cap.release()
            raise OSError(f"cannot open video device {self.device!r}")
        # MJPG keeps three cameras inside USB bandwidth at 720p.
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, self.fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self._cap = cap

    def read(self) -> np.ndarray | None:
        if self._cap is None:
            return None
        ok, img = self._cap.read()
        return img if ok else None

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None


class Picamera2Backend:
    """CSI ribbon cameras on the Pi 5. OpenCV's V4L2 path cannot read these (they sit
    behind libcamera), so this goes through picamera2, which is only installed on the Pi."""

    def __init__(self, device: int | str, width: int, height: int, fps: int = 15) -> None:
        self.camera_num = int(device)
        self.width, self.height, self.fps = width, height, fps
        self._cam: Any = None

    def open(self) -> None:
        from picamera2 import Picamera2  # apt: python3-picamera2

        cam = Picamera2(self.camera_num)
        # RGB888 is stored B,G,R in memory, which is what OpenCV expects.
        conf = cam.create_video_configuration(
            main={"size": (self.width, self.height), "format": "RGB888"},
            controls={"FrameRate": float(self.fps)},
            buffer_count=2,
        )
        cam.configure(conf)
        cam.start()
        self._cam = cam

    def read(self) -> np.ndarray | None:
        if self._cam is None:
            return None
        return self._cam.capture_array("main")

    def close(self) -> None:
        if self._cam is not None:
            try:
                self._cam.stop()
                self._cam.close()
            finally:
                self._cam = None


def make_backend(backend: str, device: int | str, width: int, height: int, fps: int) -> Backend:
    if backend == "picamera2":
        return Picamera2Backend(device, width, height, fps)
    if backend == "v4l2":
        return V4L2Backend(device, width, height, fps)
    raise ValueError(f"unknown camera backend {backend!r}")


class CaptureThread:
    """Reads one camera as fast as it delivers and keeps the newest frame.

    One thread per camera so a stalled USB device only freezes its own feed. After
    `max_failed_reads` empty reads in a row the device is closed and reopened, with
    exponential backoff between attempts.
    """

    def __init__(
        self,
        cam_id: str,
        backend_factory: Callable[[], Backend],
        max_failed_reads: int = 30,
        backoff_min_s: float = 1.0,
        backoff_max_s: float = 30.0,
    ) -> None:
        self.cam_id = cam_id
        self._factory = backend_factory
        self._max_failed = max_failed_reads
        self._backoff_min, self._backoff_max = backoff_min_s, backoff_max_s
        self._lock = threading.Lock()
        self._latest: Frame | None = None
        self._seq = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"cap-{cam_id}", daemon=True)
        self.connected = False

    def start(self) -> CaptureThread:
        self._thread.start()
        return self

    def stop(self, timeout: float = 2.0) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout)

    def latest(self) -> Frame | None:
        with self._lock:
            return self._latest

    def _run(self) -> None:
        backoff = self._backoff_min
        while not self._stop.is_set():
            backend = self._factory()
            try:
                backend.open()
            except Exception as e:  # driver errors come in many types
                log.warning("%s: open failed (%s), retry in %.0fs", self.cam_id, e, backoff)
                _safe_close(backend)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, self._backoff_max)
                continue
            log.info("%s: capture open", self.cam_id)
            self.connected = True
            backoff = self._backoff_min
            self._read_loop(backend)
            self.connected = False
            _safe_close(backend)
            if not self._stop.is_set():
                log.warning("%s: capture lost, reopening", self.cam_id)
                self._stop.wait(self._backoff_min)

    def _read_loop(self, backend: Backend) -> None:
        failed = 0
        while not self._stop.is_set():
            try:
                img = backend.read()
            except Exception as e:
                log.warning("%s: read error: %s", self.cam_id, e)
                img = None
            if img is None:
                failed += 1
                if failed >= self._max_failed:
                    return
                time.sleep(0.01)
                continue
            failed = 0
            with self._lock:
                self._seq += 1
                self._latest = Frame(self._seq, time.time(), img)


def _safe_close(backend: Backend) -> None:
    try:
        backend.close()
    except Exception as e:
        log.debug("close failed: %s", e)
