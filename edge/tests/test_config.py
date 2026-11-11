from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from watchpost.config import ConfigError, load_config, parse_config

EDGE = Path(__file__).resolve().parent.parent


def base(**over):
    raw = {
        "node_id": "pi-01",
        "model": {"path": "yolo26n_ncnn_model"},
        "cameras": [{"id": "cam-01", "device": 0}],
    }
    raw.update(over)
    return raw


def test_shipped_config_loads():
    cfg = load_config(EDGE / "config.yaml")
    assert cfg.node_id == "pi-01"
    assert [c.id for c in cfg.cameras] == ["cam-01", "cam-02", "cam-03"]
    # relative paths resolve against edge/, not the working directory
    assert Path(cfg.model.path) == EDGE / "yolo26n_ncnn_model"
    assert Path(cfg.publisher.buffer_path) == EDGE / "buffer.db"
    cam2 = cfg.cameras[1]
    assert cam2.zones[0].name == "restricted-east" and cam2.zones[0].restricted
    assert cfg.telemetry.interval_s == 5


def test_defaults_and_legacy_restricted_zones(tmp_path):
    raw = base(cameras=[{
        "id": "cam-01", "device": "/dev/video0",
        "zones": [{"name": "desk", "polygon": [[0, 0], [0.5, 0], [0.5, 0.5]]}],
        "restricted_zones": [[[0.6, 0.6], [1, 0.6], [1, 1]]],
    }])
    p = tmp_path / "c.yaml"
    p.write_text(yaml.safe_dump(raw))
    cfg = load_config(p)
    cam = cfg.cameras[0]
    assert cam.backend == "v4l2" and cam.detect and cam.stride is None
    assert [(z.name, z.restricted) for z in cam.zones] == [("desk", False), ("restricted-1", True)]
    assert cfg.schedule.stride == 5
    assert Path(cfg.publisher.spool_dir) == tmp_path / "spool"


@pytest.mark.parametrize("raw, msg", [
    ({"model": {"path": "m"}, "cameras": [{"id": "a", "device": 0}]}, "node_id"),
    (base(model={}), "model.path"),
    (base(cameras=[]), "non-empty"),
    (base(cameras=[{"id": "a", "device": 0}, {"id": "a", "device": 1}]), "duplicate"),
    (base(cameras=[{"id": "a", "device": 0, "backend": "gstreamer"}]), "backend"),
    (base(cameras=[{"id": "a"}]), "device"),
    (base(cameras=[{"id": "a", "device": 0, "zones": [{"polygon": [[0, 0], [1, 1]]}]}]),
     "at least 3"),
    (base(cameras=[{"id": "a", "device": 0,
                    "zones": [{"polygon": [[0, 0], [2, 0], [1, 1]]}]}]), "0..1"),
    (base(schedule={"stride": 0}), "stride"),
    (base(schedule={"strid": 3}), "unknown key"),
    (base(node_id="pi:01"), "':'"),
])
def test_validation_errors(raw, msg):
    with pytest.raises(ConfigError, match=msg):
        parse_config(raw, Path("."))


def test_missing_file(tmp_path):
    with pytest.raises(ConfigError, match="not found"):
        load_config(tmp_path / "nope.yaml")
