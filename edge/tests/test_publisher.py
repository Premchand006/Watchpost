from __future__ import annotations

import pytest
from conftest import FakeClock, FakeSink, Rejected

from watchpost.publisher import Publisher
from watchpost.sinks import is_permanent


@pytest.fixture
def sink() -> FakeSink:
    return FakeSink()


def make(tmp_path, sink, clock, **kw) -> Publisher:
    return Publisher(sink, tmp_path / "buffer.db", tmp_path / "spool", clock=clock,
                     backoff_min_s=2.0, backoff_max_s=60.0, **kw)


def rows(sink, table="events"):
    return [c[2]["n"] for c in sink.calls if c[1] == table]


def test_success_path(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock)
    for n in range(3):
        pub.insert("events", {"n": n})
    pub.upsert("people", {"id": "x", "n": "p"})
    pub.rpc("prune_telemetry", {"keep_hours": 24})
    pub.pump()
    assert rows(sink) == [0, 1, 2]
    assert ("upsert", "people", {"id": "x", "n": "p"}) in sink.calls
    assert ("rpc", "prune_telemetry", {"keep_hours": 24}) in sink.calls
    assert pub.pending() == 0


def test_failure_buffers_then_flushes_in_order(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock)
    sink.down = True
    pub.insert("events", {"n": 1})
    pub.insert("events", {"n": 2})
    pub.insert("telemetry", {"n": "t1"})
    pub.pump()
    assert pub.pending() == 3 and not pub.online()

    sink.down = False
    pub.insert("events", {"n": 3})  # arrives during backoff: must queue behind 1 and 2
    pub.pump()
    assert sink.calls == []  # still backing off
    clock.advance(2.1)
    pub.pump()
    assert rows(sink) == [1, 2, 3]
    assert rows(sink, "telemetry") == ["t1"]
    assert pub.pending() == 0


def test_backoff_grows_while_down(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock)
    sink.down = True
    pub.insert("events", {"n": 1})
    pub.pump()
    clock.advance(2.1)
    pub.pump()  # retry fails, next delay 4 s
    clock.advance(3.0)
    assert not pub.online()
    clock.advance(1.1)
    sink.down = False
    pub.pump()
    assert rows(sink) == [1]


def test_permanent_error_dropped_after_max_attempts(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock, max_attempts=3)
    sink.reject = {"bad"}
    pub.insert("events", {"n": "bad"})
    pub.insert("events", {"n": "good"})
    pub.pump()
    assert pub.pending() == 2  # good waits behind bad to keep order
    for _ in range(20):
        clock.advance(30)
        pub.pump()
        if pub.pending() == 0:
            break
    assert pub.pending() == 0
    assert rows(sink) == ["good"]


def test_best_frames_spool_to_disk_and_snapshots_drop(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock)
    sink.down = True
    pub.upload("best-frames", "pi-01/cam-01/a.jpg", b"v1")
    pub.pump()
    pub.upload("best-frames", "pi-01/cam-01/a.jpg", b"v2")  # same path: replaces v1
    pub.upload("snapshots", "pi-01/cam-01.jpg", b"snap", durable=False)
    pub.pump()
    spooled = list((tmp_path / "spool").iterdir())
    assert len(spooled) == 1 and spooled[0].read_bytes() == b"v2"
    assert pub.pending() == 1

    sink.down = False
    clock.advance(5)
    pub.pump()
    assert sink.calls == [("upload", "best-frames/pi-01/cam-01/a.jpg", b"v2")]
    assert list((tmp_path / "spool").iterdir()) == []


def test_snapshot_newest_wins(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock)
    pub.upload("snapshots", "pi-01/cam-01.jpg", b"old", durable=False)
    pub.upload("snapshots", "pi-01/cam-01.jpg", b"new", durable=False)
    pub.pump()
    assert sink.calls == [("upload", "snapshots/pi-01/cam-01.jpg", b"new")]


def test_buffer_survives_restart(tmp_path, sink, clock):
    sink.down = True
    pub = make(tmp_path, sink, clock)
    pub.insert("events", {"n": 1})
    pub.close()
    sink.down = False
    pub2 = make(tmp_path, sink, FakeClock())
    pub2.pump()
    assert rows(sink) == [1]


def test_no_sink_buffers_everything(tmp_path, clock):
    pub = make(tmp_path, None, clock)
    pub.insert("events", {"n": 1})
    pub.upload("snapshots", "x.jpg", b"s", durable=False)
    pub.pump()
    assert pub.pending() == 1


def test_queue_full_never_blocks(tmp_path, sink, clock):
    pub = make(tmp_path, sink, clock, queue_size=2)
    for n in range(5):
        pub.insert("events", {"n": n})
    assert pub.dropped == 3


def test_background_thread_close_flushes(tmp_path, sink):
    pub = Publisher(sink, tmp_path / "b.db", tmp_path / "spool").start()
    for n in range(10):
        pub.insert("events", {"n": n})
    pub.close(timeout=5)
    assert rows(sink) == list(range(10))


class _ApiError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


@pytest.mark.parametrize("exc, permanent", [
    (ConnectionError("down"), False),
    (TimeoutError(), False),
    (Rejected(400), True),
    (Rejected(409), True),
    (Rejected(429), False),
    (Rejected(503), False),
    (_ApiError("23505"), True),   # unique violation
    (_ApiError("42501"), True),   # RLS
    (_ApiError("PGRST204"), True),
    (_ApiError("08006"), False),  # connection failure
    (Exception({"statusCode": "413", "message": "too large"}), True),
    (RuntimeError("???"), False),
])
def test_is_permanent(exc, permanent):
    assert is_permanent(exc) is permanent
