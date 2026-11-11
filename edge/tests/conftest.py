from __future__ import annotations

from typing import Any

import numpy as np
import pytest


class FakeClock:
    def __init__(self, t: float = 1_700_000_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


class Rejected(Exception):
    """Looks like a PostgREST/Storage 4xx."""

    def __init__(self, status_code: int = 400) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


class FakeSink:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any]] = []
        self.down = False
        self.reject: set[str] = set()  # row "id"/"n" values to reject with 400

    def _check(self, row: dict[str, Any] | None = None) -> None:
        if self.down:
            raise ConnectionError("network unreachable")
        if row is not None and str(row.get("n")) in self.reject:
            raise Rejected(400)

    def insert(self, table: str, row: dict[str, Any]) -> None:
        self._check(row)
        self.calls.append(("insert", table, row))

    def upsert(self, table: str, row: dict[str, Any], on_conflict: str) -> None:
        self._check(row)
        self.calls.append(("upsert", table, row))

    def upload(self, bucket: str, path: str, data: bytes) -> None:
        self._check()
        self.calls.append(("upload", f"{bucket}/{path}", data))

    def rpc(self, fn: str, params: dict[str, Any]) -> None:
        self._check()
        self.calls.append(("rpc", fn, params))


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


def textured(h: int, w: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 255, (h, w, 3), dtype=np.uint8)


def checkerboard(h: int, w: int, cell: int = 4) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    board = (((yy // cell) + (xx // cell)) % 2 * 255).astype(np.uint8)
    return np.dstack([board] * 3)
