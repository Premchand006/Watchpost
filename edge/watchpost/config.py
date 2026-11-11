"""Load and validate edge/config.yaml into typed settings."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

BACKENDS = ("v4l2", "picamera2")


class ConfigError(ValueError):
    """Raised when config.yaml is missing a key or has a bad value."""


@dataclass(frozen=True)
class ZoneConfig:
    name: str
    polygon: tuple[tuple[float, float], ...]
    restricted: bool = False


@dataclass(frozen=True)
class CameraConfig:
    id: str
    name: str
    role: str
    backend: str
    device: int | str
    width: int
    height: int
    fps: int
    detect: bool
    stride: int | None
    zones: tuple[ZoneConfig, ...]
    loiter_seconds: float


@dataclass(frozen=True)
class ModelConfig:
    path: str
    imgsz: int = 640
    conf: float = 0.4
    person_class_id: int = 0


@dataclass(frozen=True)
class ScheduleConfig:
    stride: int = 5
    motion_min_area_frac: float = 0.004
    stagger: bool = True


@dataclass(frozen=True)
class TrackingConfig:
    exit_after_s: float = 3.0
    lost_track_buffer: int = 30
    people_refresh_s: float = 10.0


@dataclass(frozen=True)
class BestFrameConfig:
    upload_cooldown_s: float = 3.0
    min_gain: float = 0.15
    jpeg_quality: int = 90


@dataclass(frozen=True)
class SnapshotConfig:
    interval_s: float = 1.0
    width: int = 640
    height: int = 360
    jpeg_quality: int = 70


@dataclass(frozen=True)
class HealthConfig:
    offline_after_s: float = 5.0
    heartbeat_s: float = 10.0
    blackout_luma: float = 12.0
    scene_change_threshold: float = 40.0
    tamper_hold_s: float = 2.0
    rebaseline_s: float = 30.0


@dataclass(frozen=True)
class TelemetryConfig:
    interval_s: float = 5.0
    prune_every_s: float = 3600.0
    keep_hours: int = 24


@dataclass(frozen=True)
class PublisherConfig:
    buffer_path: str = "buffer.db"
    spool_dir: str = "spool"
    queue_size: int = 1000
    max_attempts: int = 5
    max_buffer_rows: int = 50000


@dataclass(frozen=True)
class AppConfig:
    node_id: str
    model: ModelConfig
    cameras: tuple[CameraConfig, ...]
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)
    tracking: TrackingConfig = field(default_factory=TrackingConfig)
    bestframe: BestFrameConfig = field(default_factory=BestFrameConfig)
    snapshot: SnapshotConfig = field(default_factory=SnapshotConfig)
    health: HealthConfig = field(default_factory=HealthConfig)
    telemetry: TelemetryConfig = field(default_factory=TelemetryConfig)
    publisher: PublisherConfig = field(default_factory=PublisherConfig)
    base_dir: Path = field(default_factory=Path.cwd)


def load_config(path: str | Path) -> AppConfig:
    """Read a YAML file. Relative paths inside it resolve against the file's folder."""
    path = Path(path).resolve()
    if not path.is_file():
        raise ConfigError(f"config file not found: {path}")
    with path.open(encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return parse_config(raw, base_dir=path.parent)


def parse_config(raw: dict[str, Any], base_dir: Path) -> AppConfig:
    if not isinstance(raw, dict):
        raise ConfigError("config root must be a mapping")
    node_id = raw.get("node_id")
    if not node_id or not isinstance(node_id, str):
        raise ConfigError("node_id is required")
    if ":" in node_id:
        raise ConfigError("node_id must not contain ':' (it is the person_id separator)")

    model_raw = _section(raw, "model")
    if "path" not in model_raw:
        raise ConfigError("model.path is required")
    model = _build(ModelConfig, model_raw, "model")
    model = ModelConfig(**{**model.__dict__, "path": str(_resolve(base_dir, model.path))})

    schedule = _build(ScheduleConfig, _section(raw, "schedule"), "schedule")
    if schedule.stride < 1:
        raise ConfigError("schedule.stride must be >= 1")
    if not 0 <= schedule.motion_min_area_frac < 1:
        raise ConfigError("schedule.motion_min_area_frac must be in [0, 1)")

    pub = _build(PublisherConfig, _section(raw, "publisher"), "publisher")
    pub = PublisherConfig(
        **{
            **pub.__dict__,
            "buffer_path": str(_resolve(base_dir, pub.buffer_path)),
            "spool_dir": str(_resolve(base_dir, pub.spool_dir)),
        }
    )
    if pub.max_attempts < 1:
        raise ConfigError("publisher.max_attempts must be >= 1")

    telemetry = _build(TelemetryConfig, _section(raw, "telemetry"), "telemetry")
    if telemetry.interval_s <= 0:
        raise ConfigError("telemetry.interval_s must be > 0")

    cams_raw = raw.get("cameras")
    if not isinstance(cams_raw, list) or not cams_raw:
        raise ConfigError("cameras must be a non-empty list")
    cameras = tuple(_camera(c, i) for i, c in enumerate(cams_raw))
    ids = [c.id for c in cameras]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ConfigError(f"duplicate camera ids: {sorted(dupes)}")

    return AppConfig(
        node_id=node_id,
        model=model,
        cameras=cameras,
        schedule=schedule,
        tracking=_build(TrackingConfig, _section(raw, "tracking"), "tracking"),
        bestframe=_build(BestFrameConfig, _section(raw, "bestframe"), "bestframe"),
        snapshot=_build(SnapshotConfig, _section(raw, "snapshot"), "snapshot"),
        health=_build(HealthConfig, _section(raw, "health"), "health"),
        telemetry=telemetry,
        publisher=pub,
        base_dir=base_dir,
    )


def _resolve(base: Path, p: str) -> Path:
    q = Path(p).expanduser()
    return q if q.is_absolute() else (base / q).resolve()


def _section(raw: dict[str, Any], key: str) -> dict[str, Any]:
    value = raw.get(key) or {}
    if not isinstance(value, dict):
        raise ConfigError(f"{key} must be a mapping")
    return value


def _build(cls: type, values: dict[str, Any], where: str) -> Any:
    known = set(cls.__dataclass_fields__)
    unknown = set(values) - known
    if unknown:
        raise ConfigError(f"unknown key(s) in {where}: {sorted(unknown)}")
    try:
        return cls(**values)
    except TypeError as e:
        raise ConfigError(f"{where}: {e}") from e


def _camera(raw: Any, index: int) -> CameraConfig:
    if not isinstance(raw, dict):
        raise ConfigError(f"cameras[{index}] must be a mapping")
    cam_id = raw.get("id")
    if not cam_id or not isinstance(cam_id, str):
        raise ConfigError(f"cameras[{index}].id is required")
    where = f"camera {cam_id}"
    if ":" in cam_id or "/" in cam_id:
        raise ConfigError(f"{where}: id must not contain ':' or '/'")
    backend = raw.get("backend", "v4l2")
    if backend not in BACKENDS:
        raise ConfigError(f"{where}: backend must be one of {BACKENDS}, got {backend!r}")
    if "device" not in raw:
        raise ConfigError(f"{where}: device is required")
    device = raw["device"]
    if not isinstance(device, (int, str)) or isinstance(device, bool):
        raise ConfigError(f"{where}: device must be an int or a path")

    width, height = int(raw.get("width", 1280)), int(raw.get("height", 720))
    if width <= 0 or height <= 0:
        raise ConfigError(f"{where}: width and height must be positive")
    stride = raw.get("stride")
    if stride is not None and int(stride) < 1:
        raise ConfigError(f"{where}: stride must be >= 1")

    zones: list[ZoneConfig] = []
    for j, z in enumerate(raw.get("zones") or []):
        if not isinstance(z, dict) or "polygon" not in z:
            raise ConfigError(f"{where}: zones[{j}] needs a polygon")
        name = str(z.get("name") or f"zone-{j + 1}")
        zones.append(ZoneConfig(name, _polygon(z["polygon"], where), bool(z.get("restricted"))))
    # Older configs list bare restricted polygons.
    for j, poly in enumerate(raw.get("restricted_zones") or []):
        zones.append(ZoneConfig(f"restricted-{j + 1}", _polygon(poly, where), True))
    names = [z.name for z in zones]
    if len(set(names)) != len(names):
        raise ConfigError(f"{where}: zone names must be unique")

    return CameraConfig(
        id=cam_id,
        name=str(raw.get("name", cam_id)),
        role=str(raw.get("role", "detect")),
        backend=backend,
        device=device,
        width=width,
        height=height,
        fps=int(raw.get("fps", 15)),
        detect=bool(raw.get("detect", True)),
        stride=int(stride) if stride is not None else None,
        zones=tuple(zones),
        loiter_seconds=float(raw.get("loiter_seconds", 10)),
    )


def _polygon(raw: Any, where: str) -> tuple[tuple[float, float], ...]:
    try:
        pts = tuple((float(x), float(y)) for x, y in raw)
    except (TypeError, ValueError) as e:
        raise ConfigError(f"{where}: polygon points must be [x, y] pairs") from e
    if len(pts) < 3:
        raise ConfigError(f"{where}: polygon needs at least 3 points")
    if any(not (0 <= v <= 1) for p in pts for v in p):
        raise ConfigError(f"{where}: polygon coordinates are normalized, keep them in 0..1")
    return pts
