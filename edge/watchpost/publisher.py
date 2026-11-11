"""Background publisher. The vision loop only ever enqueues; this thread does the network.

Rows and best-frame uploads that fail are written to SQLite (and image bytes to a spool
folder) and retried oldest first, per table. Snapshots are not buffered: a newer one
replaces any that has not been sent yet, and failures drop it.
"""

from __future__ import annotations

import json
import logging
import queue
import sqlite3
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .sinks import Sink, is_permanent

log = logging.getLogger(__name__)


@dataclass
class _Item:
    kind: str  # row | upload | rpc
    key: str  # table name, "storage:<bucket>", or rpc function name
    payload: dict[str, Any]
    data: bytes | None = None


class Publisher:
    def __init__(self, sink: Sink | None, buffer_path: str | Path, spool_dir: str | Path,
                 queue_size: int = 1000, max_attempts: int = 5, max_buffer_rows: int = 50000,
                 backoff_min_s: float = 2.0, backoff_max_s: float = 60.0,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._sink = sink
        self._q: queue.Queue[_Item] = queue.Queue(maxsize=queue_size)
        self._snaps: dict[tuple[str, str], bytes] = {}
        self._snap_lock = threading.Lock()
        self._max_attempts = max_attempts
        self._max_rows = max_buffer_rows
        self._bmin, self._bmax = backoff_min_s, backoff_max_s
        self._delay = backoff_min_s
        self._retry_at = 0.0
        self._key_retry: dict[str, float] = {}
        self._clock = clock
        self._stopping = threading.Event()
        self._thread: threading.Thread | None = None
        self.dropped = 0
        self._spool = Path(spool_dir)
        self._spool.mkdir(parents=True, exist_ok=True)
        Path(buffer_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(buffer_path), check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS buf (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT,"
            " kind TEXT, payload TEXT, file TEXT, attempts INTEGER DEFAULT 0)"
        )
        self._db.commit()
        if sink is None:
            log.warning("no Supabase sink, everything goes to the local buffer")

    # Called from the vision loop. None of these block.
    def insert(self, table: str, row: dict[str, Any]) -> None:
        self._put(_Item("row", table, {"op": "insert", "row": row}))

    def upsert(self, table: str, row: dict[str, Any], on_conflict: str = "id") -> None:
        self._put(_Item("row", table, {"op": "upsert", "row": row, "on_conflict": on_conflict}))

    def upload(self, bucket: str, path: str, data: bytes, durable: bool = True) -> None:
        if not durable:
            with self._snap_lock:
                self._snaps[(bucket, path)] = data
            return
        self._put(_Item("upload", f"storage:{bucket}", {"bucket": bucket, "path": path}, data))

    def rpc(self, fn: str, params: dict[str, Any]) -> None:
        self._put(_Item("rpc", fn, params))

    def _put(self, item: _Item) -> None:
        try:
            self._q.put_nowait(item)
        except queue.Full:
            self.dropped += 1
            if self.dropped % 100 == 1:
                log.warning("publish queue full, dropped %d items so far", self.dropped)

    # Thread control.
    def start(self) -> Publisher:
        self._thread = threading.Thread(target=self._run, name="publisher", daemon=True)
        self._thread.start()
        return self

    def close(self, timeout: float = 10.0) -> None:
        """Drain the queue (to Supabase or the buffer) and stop."""
        self._stopping.set()
        if self._thread is not None:
            self._thread.join(timeout)
            if self._thread.is_alive():
                log.warning("publisher still busy at shutdown, %d items not saved",
                            self._q.qsize())
                return
        else:
            while not self._q.empty():
                self.pump()
        self._db.close()

    def _run(self) -> None:
        while not (self._stopping.is_set() and self._q.empty()):
            try:
                self.pump(wait_s=0.5)
            except Exception:
                log.exception("publisher loop error")
                time.sleep(1.0)

    def pending(self) -> int:
        return int(self._db.execute("SELECT COUNT(*) FROM buf").fetchone()[0])

    def online(self) -> bool:
        return self._sink is not None and self._clock() >= self._retry_at

    # Worker side.
    def pump(self, wait_s: float = 0.0) -> None:
        """Handle queued items, send the newest snapshots, then retry the buffer."""
        try:
            first = self._q.get(timeout=wait_s) if wait_s > 0 else self._q.get_nowait()
        except queue.Empty:
            first = None
        if first is not None:
            self._handle(first)
            while True:
                try:
                    self._handle(self._q.get_nowait())
                except queue.Empty:
                    break
        self._send_snapshots()
        self.flush()

    def _handle(self, item: _Item) -> None:
        if item.kind == "rpc":
            if self.online():
                try:
                    self._sink.rpc(item.key, item.payload)  # type: ignore[union-attr]
                except Exception as e:
                    log.debug("rpc %s failed: %s", item.key, e)
            return
        if not self.online() or self._has_pending(item.key):
            self._store(item)
            return
        try:
            self._send(item.kind, item.key, item.payload, item.data)
            self._mark_ok()
        except Exception as e:
            if is_permanent(e):
                log.warning("%s rejected (%s), will retry a few times", item.key, e)
                self._store(item, attempts=1)
                self._key_retry[item.key] = self._clock() + self._bmin
            else:
                self._mark_down(e)
                self._store(item)

    def _send_snapshots(self) -> None:
        with self._snap_lock:
            snaps, self._snaps = self._snaps, {}
        for (bucket, path), data in snaps.items():
            if not self.online():
                return
            try:
                self._sink.upload(bucket, path, data)  # type: ignore[union-attr]
                self._mark_ok()
            except Exception as e:
                if not is_permanent(e):
                    self._mark_down(e)
                log.debug("snapshot %s dropped: %s", path, e)

    def flush(self, limit: int = 200) -> None:
        if not self.online():
            return
        now = self._clock()
        keys = self._db.execute("SELECT key FROM buf GROUP BY key ORDER BY MIN(id)").fetchall()
        for (key,) in keys:
            if self._key_retry.get(key, 0.0) > now:
                continue
            rows = self._db.execute(
                "SELECT id, kind, payload, file, attempts FROM buf WHERE key=? ORDER BY id"
                " LIMIT ?", (key, limit)).fetchall()
            for rid, kind, payload_s, file, attempts in rows:
                data = None
                if file:
                    try:
                        data = (self._spool / file).read_bytes()
                    except OSError:
                        log.warning("spooled image %s missing, dropping", file)
                        self._delete(rid, None)
                        continue
                try:
                    self._send(kind, key, json.loads(payload_s), data)
                except Exception as e:
                    if not is_permanent(e):
                        self._mark_down(e)
                        return
                    attempts += 1
                    if attempts >= self._max_attempts:
                        log.error("dropping %s row after %d attempts: %s", key, attempts, e)
                        self._delete(rid, file)
                        continue
                    self._db.execute("UPDATE buf SET attempts=? WHERE id=?", (attempts, rid))
                    self._db.commit()
                    self._key_retry[key] = now + min(self._bmax, self._bmin * 2 ** attempts)
                    break
                self._mark_ok()
                self._delete(rid, file)

    def _send(self, kind: str, key: str, payload: dict[str, Any], data: bytes | None) -> None:
        sink = self._sink
        assert sink is not None
        if kind == "upload":
            sink.upload(payload["bucket"], payload["path"], data or b"")
        elif payload["op"] == "upsert":
            sink.upsert(key, payload["row"], payload["on_conflict"])
        else:
            sink.insert(key, payload["row"])

    def _mark_down(self, exc: Exception) -> None:
        if self._clock() >= self._retry_at:
            log.warning("publish failed, buffering locally, retry in %.0fs: %s", self._delay, exc)
        self._retry_at = self._clock() + self._delay
        self._delay = min(self._delay * 2, self._bmax)

    def _mark_ok(self) -> None:
        if self._delay > self._bmin:
            log.info("Supabase reachable again, flushing %d buffered rows", self.pending())
        self._delay = self._bmin

    def _has_pending(self, key: str) -> bool:
        row = self._db.execute("SELECT 1 FROM buf WHERE key=? LIMIT 1", (key,)).fetchone()
        return row is not None

    def _store(self, item: _Item, attempts: int = 0) -> None:
        payload = json.dumps(item.payload, sort_keys=True, default=str)
        file = None
        if item.kind == "upload":
            # Only the newest image for a storage path matters, it is an upsert.
            for rid, old in self._db.execute(
                    "SELECT id, file FROM buf WHERE key=? AND payload=?",
                    (item.key, payload)).fetchall():
                self._delete(rid, old, commit=False)
            file = f"{uuid.uuid4().hex}.jpg"
            (self._spool / file).write_bytes(item.data or b"")
        self._db.execute("INSERT INTO buf (key, kind, payload, file, attempts) VALUES (?,?,?,?,?)",
                         (item.key, item.kind, payload, file, attempts))
        self._db.commit()
        over = self.pending() - self._max_rows
        if over > 0:
            log.warning("buffer over %d rows, discarding the oldest %d", self._max_rows, over)
            for rid, old in self._db.execute(
                    "SELECT id, file FROM buf ORDER BY id LIMIT ?", (over,)).fetchall():
                self._delete(rid, old, commit=False)
            self._db.commit()

    def _delete(self, rid: int, file: str | None, commit: bool = True) -> None:
        self._db.execute("DELETE FROM buf WHERE id=?", (rid,))
        if commit:
            self._db.commit()
        if file:
            (self._spool / file).unlink(missing_ok=True)
