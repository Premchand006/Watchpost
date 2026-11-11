from __future__ import annotations

import pytest

pytest.importorskip("supervision")

from watchpost.detector import Detection  # noqa: E402
from watchpost.tracker import ByteTracker  # noqa: E402


def test_bytetrack_keeps_ids_for_a_moving_box():
    tr = ByteTracker(lost_track_buffer=10)
    ids = set()
    for i in range(6):
        x = 100 + i * 4
        out = tr.update([Detection((x, 100, x + 60, 220), 0.9)])
        ids.update(d.track_id for d in out)
    assert len(ids) == 1 and None not in ids


def test_empty_update_is_fine():
    tr = ByteTracker()
    assert tr.update([]) == []
