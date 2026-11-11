"""Small counters and host stats (CPU, memory, SoC temperature) for the telemetry row."""

from __future__ import annotations

import logging
from collections import deque
from pathlib import Path

log = logging.getLogger(__name__)

try:
    import psutil
except ImportError:  # the /proc readers below cover the Pi without it
    psutil = None


class RollingAverage:
    def __init__(self, size: int = 50) -> None:
        self._vals: deque[float] = deque(maxlen=size)

    def add(self, v: float) -> None:
        self._vals.append(v)

    def value(self) -> float | None:
        return sum(self._vals) / len(self._vals) if self._vals else None


class RateCounter:
    """Events per second over a sliding window."""

    def __init__(self, window_s: float = 5.0) -> None:
        self.window_s = window_s
        self._ts: deque[float] = deque()

    def mark(self, now: float) -> None:
        self._ts.append(now)
        self._trim(now)

    def rate(self, now: float) -> float:
        self._trim(now)
        if len(self._ts) < 2:
            return 0.0
        span = max(now - self._ts[0], 1e-6)
        return round(len(self._ts) / max(span, self.window_s / 2), 1)

    def _trim(self, now: float) -> None:
        while self._ts and now - self._ts[0] > self.window_s:
            self._ts.popleft()


class SystemStats:
    """CPU percent since the previous call, memory percent, SoC temperature in C."""

    def __init__(self, proc: Path = Path("/proc"),
                 thermal: Path = Path("/sys/class/thermal/thermal_zone0/temp")) -> None:
        self._proc, self._thermal = proc, thermal
        self._last_cpu: tuple[int, int] | None = None
        if psutil is not None:
            psutil.cpu_percent(None)  # first call primes the counter

    def cpu(self) -> float | None:
        if psutil is not None:
            return round(psutil.cpu_percent(None), 1)
        try:
            fields = (self._proc / "stat").read_text().splitlines()[0].split()[1:]
        except OSError:
            return None
        vals = [int(v) for v in fields]
        idle, total = vals[3] + (vals[4] if len(vals) > 4 else 0), sum(vals)
        prev, self._last_cpu = self._last_cpu, (idle, total)
        if prev is None or total == prev[1]:
            return None
        return round(100.0 * (1 - (idle - prev[0]) / (total - prev[1])), 1)

    def mem(self) -> float | None:
        if psutil is not None:
            return round(psutil.virtual_memory().percent, 1)
        try:
            info = {}
            for line in (self._proc / "meminfo").read_text().splitlines():
                key, _, rest = line.partition(":")
                info[key] = int(rest.split()[0])
            return round(100.0 * (1 - info["MemAvailable"] / info["MemTotal"]), 1)
        except (OSError, KeyError, ValueError, IndexError):
            return None

    def temp(self) -> float | None:
        try:
            return round(int(self._thermal.read_text().strip()) / 1000.0, 1)
        except (OSError, ValueError):
            pass
        if psutil is not None and hasattr(psutil, "sensors_temperatures"):
            try:
                for entries in psutil.sensors_temperatures().values():
                    if entries:
                        return round(float(entries[0].current), 1)
            except Exception as e:  # not supported on every OS
                log.debug("sensors_temperatures failed: %s", e)
        return None
