"""Small annotated JPEG per camera for the dashboard's live tile."""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np

from .config import ZoneConfig
from .detector import Detection

ZONE_COLOR = (200, 160, 0)
RESTRICTED_COLOR = (0, 60, 255)
BOX_COLOR = (0, 255, 170)


def annotate(frame: np.ndarray, zones: Sequence[ZoneConfig],
             detections: Sequence[Detection],
             scale: tuple[float, float] = (1.0, 1.0)) -> np.ndarray:
    """Boxes are in source-frame pixels; `scale` maps them onto `frame`."""
    out = frame.copy()
    h, w = out.shape[:2]
    for z in zones:
        pts = np.array([[int(x * w), int(y * h)] for x, y in z.polygon], dtype=np.int32)
        color = RESTRICTED_COLOR if z.restricted else ZONE_COLOR
        cv2.polylines(out, [pts], True, color, 2)
        cv2.putText(out, z.name, tuple(pts[0] + [4, 18]), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    color, 2, cv2.LINE_AA)
    for d in detections:
        sx, sy = scale
        x1, y1, x2, y2 = (int(d.xyxy[0] * sx), int(d.xyxy[1] * sy),
                          int(d.xyxy[2] * sx), int(d.xyxy[3] * sy))
        cv2.rectangle(out, (x1, y1), (x2, y2), BOX_COLOR, 2)
        label = f"T-{d.track_id}" if d.track_id is not None else f"{d.conf:.2f}"
        cv2.putText(out, label, (x1 + 2, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    BOX_COLOR, 2, cv2.LINE_AA)
    return out


def render(frame: np.ndarray, zones: Sequence[ZoneConfig], detections: Sequence[Detection],
           size: tuple[int, int] = (640, 360), quality: int = 70) -> bytes | None:
    # Downscale first so the drawing cost and line widths are those of the small image.
    small = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
    scale = (size[0] / frame.shape[1], size[1] / frame.shape[0])
    small = annotate(small, zones, detections, scale)
    ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return jpg.tobytes() if ok else None


def encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes | None:
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return jpg.tobytes() if ok else None
