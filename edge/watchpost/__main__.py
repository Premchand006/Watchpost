"""Entry point: python -m watchpost --config edge/config.yaml [--dry-run] [--show]"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from .cameras import CaptureThread, make_backend
from .config import AppConfig, CameraConfig, ConfigError, load_config
from .detector import Detection
from .engine import Engine
from .publisher import Publisher
from .sinks import LogSink, Sink

log = logging.getLogger("watchpost")
EDGE_DIR = Path(__file__).resolve().parent.parent


class Stop:
    """Set from the signal handler. A threading.Event would be wrong here: Event.set()
    inside a handler can deadlock if the main thread was interrupted in Event.wait()."""

    def __init__(self) -> None:
        self.requested = False

    def is_set(self) -> bool:
        return self.requested


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="watchpost", description="Watchpost edge service")
    p.add_argument("--config", default=str(EDGE_DIR / "config.yaml"), help="path to config.yaml")
    p.add_argument("--dry-run", action="store_true", help="no Supabase, log what would be sent")
    p.add_argument("--show", action="store_true", help="open a debug window per camera")
    p.add_argument("--log-level", default=os.getenv("WATCHPOST_LOG", "INFO"))
    return p.parse_args(argv)


def make_sink(dry_run: bool) -> Sink | None:
    if dry_run:
        return LogSink()
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        log.warning("SUPABASE_URL / SUPABASE_SERVICE_KEY not set in %s", EDGE_DIR / ".env")
        return None
    try:
        from .sinks import SupabaseSink

        return SupabaseSink(url, key)
    except Exception as e:  # missing package or a malformed URL
        log.error("cannot create Supabase client: %s", e)
        return None


def start_cameras(cfg: AppConfig) -> dict[str, CaptureThread]:
    def factory(c: CameraConfig) -> Any:
        return lambda: make_backend(c.backend, c.device, c.width, c.height, c.fps)

    return {c.id: CaptureThread(c.id, factory(c)).start() for c in cfg.cameras}


def make_viewer(cfg: AppConfig) -> Any:
    import cv2

    from .snapshot import annotate

    zones = {c.id: c.zones for c in cfg.cameras}

    def show(cam_id: str, image: np.ndarray, dets: Sequence[Detection]) -> None:
        img = annotate(image, zones[cam_id], dets)
        if img.shape[1] > 960:
            img = cv2.resize(img, (960, int(img.shape[0] * 960 / img.shape[1])))
        cv2.imshow(cam_id, img)
        cv2.waitKey(1)

    return show


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=args.log_level.upper(),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        from dotenv import load_dotenv

        load_dotenv(EDGE_DIR / ".env")
    except ImportError:
        log.warning("python-dotenv not installed, reading secrets from the environment only")
    try:
        cfg = load_config(args.config)
    except ConfigError as e:
        log.error("config: %s", e)
        return 2

    detector = None
    if any(c.detect for c in cfg.cameras):
        from .detector import YoloDetector

        m = cfg.model
        detector = YoloDetector(m.path, m.imgsz, m.conf, m.person_class_id)

    def tracker_factory() -> Any:
        from .tracker import ByteTracker

        return ByteTracker(lost_track_buffer=cfg.tracking.lost_track_buffer)

    p = cfg.publisher
    publisher = Publisher(make_sink(args.dry_run), p.buffer_path, p.spool_dir,
                          queue_size=p.queue_size, max_attempts=p.max_attempts,
                          max_buffer_rows=p.max_buffer_rows).start()
    sources = start_cameras(cfg)
    stop = Stop()

    def on_signal(signum: int, _frame: Any) -> None:
        stop.requested = True

    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, on_signal)

    engine = Engine(cfg, sources, detector, publisher, tracker_factory,
                    on_frame=make_viewer(cfg) if args.show else None)
    try:
        engine.run(stop)
        log.info("stopping")
    finally:
        for src in sources.values():
            src.stop()
        publisher.close(timeout=10.0)
        if args.show:
            import cv2

            cv2.destroyAllWindows()
        log.info("stopped, %d rows left in the local buffer", _pending(p.buffer_path))
    return 0


def _pending(path: str) -> int:
    import sqlite3

    try:
        with sqlite3.connect(path) as db:
            return int(db.execute("SELECT COUNT(*) FROM buf").fetchone()[0])
    except sqlite3.Error:
        return -1


if __name__ == "__main__":
    sys.exit(main())
