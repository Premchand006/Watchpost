#!/usr/bin/env python3
"""Open every camera in config.yaml at once and show (or save) a labelled frame.

    python edge/tools/camera_test.py                 # live windows, q to quit
    python edge/tools/camera_test.py --save          # headless: one JPEG per camera
    python edge/tools/camera_test.py --config other.yaml --seconds 20

Uses the same capture backends as the service (v4l2 for USB, picamera2 for CSI),
each in its own thread, so a dead camera shows up as FAIL without freezing the rest.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

EDGE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EDGE_DIR))  # run without installing the package

import cv2  # noqa: E402

from watchpost.cameras import CaptureThread, make_backend  # noqa: E402
from watchpost.config import ConfigError, load_config  # noqa: E402


def label(frame, text: str):
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, 0), (w, 34), (0, 0, 0), -1)
    cv2.putText(frame, f"{text} | {w}x{h}", (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (0, 255, 200), 1, cv2.LINE_AA)
    return frame


def main() -> int:
    ap = argparse.ArgumentParser(description="Test all configured cameras at once.")
    ap.add_argument("--config", default=str(EDGE_DIR / "config.yaml"))
    ap.add_argument("--save", action="store_true", help="save one JPEG per camera and exit")
    ap.add_argument("--seconds", type=float, default=0, help="stop after N seconds (0 = until q)")
    args = ap.parse_args()

    try:
        cfg = load_config(args.config)
    except ConfigError as e:
        print(f"config error: {e}")
        return 2

    threads = {}
    for c in cfg.cameras:
        def factory(c=c):
            return make_backend(c.backend, c.device, c.width, c.height, c.fps)

        threads[c.id] = (c, CaptureThread(c.id, factory, backoff_max_s=5).start())
        print(f"starting {c.id} ({c.name}) backend={c.backend} device={c.device}")

    # Give sensors time to wake up and the first frames to arrive.
    deadline = time.time() + 5
    while time.time() < deadline and not all(t.latest() for _, t in threads.values()):
        time.sleep(0.1)
    for cid, (c, t) in threads.items():
        print(f"[ {'OK' if t.latest() else 'FAIL'} ] {cid} {c.name}")

    save_dir = EDGE_DIR / "captures"
    start = time.time()
    counts = {cid: (0, time.time()) for cid in threads}
    last_seq = {cid: 0 for cid in threads}
    fps = {cid: 0.0 for cid in threads}
    shown = {}
    try:
        while True:
            for cid, (c, t) in threads.items():
                f = t.latest()
                if f is None or f.seq == last_seq[cid]:
                    continue
                last_seq[cid] = f.seq
                n, t0 = counts[cid]
                n += 1
                if time.time() - t0 >= 1.0:
                    fps[cid] = n / (time.time() - t0)
                    n, t0 = 0, time.time()
                counts[cid] = (n, t0)
                shown[cid] = label(f.image.copy(),
                                   f"{cid} {c.name} | {c.device} | {fps[cid]:4.1f} fps")
                if not args.save:
                    cv2.imshow(cid, shown[cid])
            if args.save:
                # run ~2 s first so the fps label means something
                if time.time() - start >= 2.0:
                    save_dir.mkdir(exist_ok=True)
                    for cid, img in shown.items():
                        path = save_dir / f"{cid}.jpg"
                        cv2.imwrite(str(path), img)
                        print(f"saved {path} ({fps[cid]:.1f} fps)")
                    if not shown:
                        print("no frames from any camera, nothing saved")
                    break
                time.sleep(0.005)
            elif cv2.waitKey(1) & 0xFF == ord("q"):
                break
            if args.seconds and time.time() - start > args.seconds:
                break
    finally:
        for _, t in threads.values():
            t.stop()
        if not args.save:
            cv2.destroyAllWindows()
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
