"""Shared bits for the engine: per-camera state, the outbox interface, row helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol

import numpy as np

from .bestframe import BestFrameKeeper
from .cameras import FrameSource
from .config import CameraConfig
from .detector import Detection
from .health import CameraHealth
from .motion import MotionGate
from .telemetry import RateCounter
from .tracker import Tracker
from .zones import ZoneEngine

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


class Outbox(Protocol):
    def insert(self, table: str, row: dict[str, Any]) -> None: ...
    def upsert(self, table: str, row: dict[str, Any], on_conflict: str = "id") -> None: ...
    def upload(self, bucket: str, path: str, data: bytes, durable: bool = True) -> None: ...
    def rpc(self, fn: str, params: dict[str, Any]) -> None: ...


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="milliseconds")


def base36(n: int) -> str:
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = _B36[r] + out
        if n == 0:
            return out


@dataclass
class CamRuntime:
    cfg: CameraConfig
    source: FrameSource
    motion: MotionGate
    tracker: Tracker | None
    zones: ZoneEngine
    best: BestFrameKeeper
    health: CameraHealth
    stride: int
    offset: int
    count: int = 0
    last_seq: int = -1
    due: bool = False
    image: np.ndarray | None = None
    dets: list[Detection] = field(default_factory=list)
    fps: RateCounter = field(default_factory=RateCounter)
    next_snapshot: float = 0.0
    next_heartbeat: float = 0.0
    people_sent: dict[int, float] = field(default_factory=dict)
    best_info: dict[int, tuple[str, float]] = field(default_factory=dict)
