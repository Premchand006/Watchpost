from __future__ import annotations

from watchpost.config import ZoneConfig
from watchpost.zones import ZoneEngine, point_in_polygon

SQUARE = ((0.5, 0.0), (1.0, 0.0), (1.0, 1.0), (0.5, 1.0))
DOOR = ZoneConfig("door", SQUARE, restricted=True)
DESK = ZoneConfig("desk", ((0.0, 0.0), (0.4, 0.0), (0.4, 1.0), (0.0, 1.0)))


def types(evs):
    return [e.type for e in evs]


def test_point_in_polygon():
    assert point_in_polygon(0.75, 0.5, SQUARE)
    assert not point_in_polygon(0.25, 0.5, SQUARE)
    tri = ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0))
    assert point_in_polygon(0.2, 0.2, tri)
    assert not point_in_polygon(0.8, 0.8, tri)


def test_enter_intrusion_loiter_exit_with_fake_clock():
    z = ZoneEngine([DOOR], loiter_seconds=5, exit_after_s=2)
    t = 100.0
    evs = z.observe(1, (0.8, 0.9), 0.9, t)
    assert types(evs) == ["enter", "intrusion"]
    assert evs[0].meta == {"conf": 0.9, "zone": "door"}
    assert evs[1].severity == "critical"

    for i in range(1, 5):
        assert z.observe(1, (0.8, 0.9), 0.9, t + i) == []
    assert z.tick(t + 5.0) == []  # not over threshold yet
    evs = z.tick(t + 5.5)
    assert types(evs) == ["loiter"] and evs[0].meta["zone"] == "door"
    assert evs[0].severity == "warning"
    assert z.tick(t + 6) == []  # fires once per visit

    # last sighting was t+4; the exit comes from tick() alone
    evs = z.tick(t + 6.2)
    assert types(evs) == ["exit"]
    assert evs[0].meta == {"zone": "door", "dwell_s": 4.0, "final": True}
    assert not z.tracks and len(z.ended) == 1


def test_zone_transition_balances_enter_and_exit():
    z = ZoneEngine([DOOR, DESK], loiter_seconds=60, exit_after_s=2)
    assert types(z.observe(3, (0.45, 0.5), 0.8, 0.0)) == ["enter"]  # between zones: zone None
    evs = z.observe(3, (0.2, 0.5), 0.8, 1.0)
    assert types(evs) == ["exit", "enter"]
    assert evs[0].meta["zone"] is None and evs[1].meta["zone"] == "desk"
    evs = z.observe(3, (0.9, 0.5), 0.8, 2.0)
    assert types(evs) == ["exit", "enter", "intrusion"]
    assert z.tracks[3].zone == "door"


def test_no_zones_loiter_uses_camera_dwell():
    z = ZoneEngine([], loiter_seconds=3, exit_after_s=10)
    z.observe(1, (0.5, 0.5), 0.7, 0.0)
    z.observe(1, (0.5, 0.5), 0.7, 3.0)
    evs = z.tick(3.5)
    assert types(evs) == ["loiter"] and evs[0].meta["zone"] is None


def test_close_all_exits_open_tracks():
    z = ZoneEngine([], loiter_seconds=30, exit_after_s=10)
    z.observe(1, (0.5, 0.5), 0.7, 0.0)
    z.observe(2, (0.5, 0.5), 0.7, 0.0)
    assert types(z.close_all()) == ["exit", "exit"]
    assert not z.tracks
