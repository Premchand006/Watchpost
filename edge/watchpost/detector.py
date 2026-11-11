"""YOLO26n person detector (NCNN export) and the Detection type shared by the pipeline."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Detection:
    xyxy: tuple[float, float, float, float]  # pixels in the source frame
    conf: float
    track_id: int | None = None


class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...


class YoloDetector:
    """Wraps an Ultralytics model. Expects the NCNN folder from `yolo export format=ncnn`.

    YOLO26 is NMS-free, so results come back final and no extra NMS runs here.
    If YOLO26 gives trouble, point model.path at yolo11n_ncnn_model; the API is the same.
    """

    def __init__(self, model_path: str, imgsz: int = 640, conf: float = 0.4,
                 person_class_id: int = 0) -> None:
        # Imported here so tests and tools do not need ultralytics/torch installed.
        from ultralytics import YOLO

        log.info("loading model %s", model_path)
        self._model: Any = YOLO(model_path, task="detect")
        self.imgsz, self.conf, self.person_class_id = imgsz, conf, person_class_id

    def detect(self, frame: np.ndarray) -> list[Detection]:
        res = self._model(
            frame, imgsz=self.imgsz, conf=self.conf, classes=[self.person_class_id], verbose=False
        )[0]
        boxes = res.boxes
        if boxes is None or len(boxes) == 0:
            return []
        xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, "cpu") else np.asarray(boxes.xyxy)
        conf = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else np.asarray(boxes.conf)
        cls = boxes.cls.cpu().numpy() if hasattr(boxes.cls, "cpu") else np.asarray(boxes.cls)
        return [
            Detection(tuple(float(v) for v in b), float(c))  # type: ignore[arg-type]
            for b, c, k in zip(xyxy, conf, cls, strict=True)
            if int(k) == self.person_class_id
        ]
