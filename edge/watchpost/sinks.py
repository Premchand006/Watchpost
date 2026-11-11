"""Where the publisher sends things: Supabase, or the log in --dry-run."""

from __future__ import annotations

import logging
from typing import Any, Protocol

log = logging.getLogger(__name__)

# SQLSTATE classes that mean "try again later" rather than "this row is bad":
# connection exception, insufficient resources, operator intervention, system error.
_TRANSIENT_SQLSTATE = ("08", "53", "57", "58")


class Sink(Protocol):
    def insert(self, table: str, row: dict[str, Any]) -> None: ...
    def upsert(self, table: str, row: dict[str, Any], on_conflict: str) -> None: ...
    def upload(self, bucket: str, path: str, data: bytes) -> None: ...
    def rpc(self, fn: str, params: dict[str, Any]) -> None: ...


def _status_of(exc: BaseException) -> int | None:
    for attr in ("status_code", "status", "statusCode"):
        v = getattr(exc, attr, None)
        if isinstance(v, int) or (isinstance(v, str) and v.isdigit()):
            return int(v)
    resp = getattr(exc, "response", None)
    if resp is not None and isinstance(getattr(resp, "status_code", None), int):
        return int(resp.status_code)
    # storage3 puts the response body dict in args[0]
    if exc.args and isinstance(exc.args[0], dict):
        for k in ("statusCode", "status"):
            v = exc.args[0].get(k)
            if isinstance(v, int) or (isinstance(v, str) and v.isdigit()):
                return int(v)
    return None


def is_permanent(exc: BaseException) -> bool:
    """True when retrying the same payload cannot help (4xx, constraint violation, RLS)."""
    if isinstance(exc, (OSError, TimeoutError, ConnectionError)):
        return False
    status = _status_of(exc)
    if status is not None:
        return 400 <= status < 500 and status not in (408, 425, 429)
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code:
        if code.isdigit() and len(code) == 3:
            s = int(code)
            return 400 <= s < 500 and s not in (408, 425, 429)
        if code.startswith("PGRST"):
            return True
        if len(code) == 5:
            return code[:2] not in _TRANSIENT_SQLSTATE
    return False


class SupabaseSink:
    def __init__(self, url: str, key: str, timeout_s: float = 10.0) -> None:
        from supabase import create_client

        try:
            from supabase import ClientOptions

            # Library defaults are long; a hung request would stall the publisher thread.
            opts = ClientOptions(postgrest_client_timeout=timeout_s,
                                 storage_client_timeout=int(timeout_s))
            self._client: Any = create_client(url, key, options=opts)
        except (ImportError, TypeError):
            self._client = create_client(url, key)

    def insert(self, table: str, row: dict[str, Any]) -> None:
        self._client.table(table).insert(row).execute()

    def upsert(self, table: str, row: dict[str, Any], on_conflict: str) -> None:
        self._client.table(table).upsert(row, on_conflict=on_conflict).execute()

    def upload(self, bucket: str, path: str, data: bytes) -> None:
        self._client.storage.from_(bucket).upload(
            path, data, {"content-type": "image/jpeg", "upsert": "true"}
        )

    def rpc(self, fn: str, params: dict[str, Any]) -> None:
        self._client.rpc(fn, params).execute()


class LogSink:
    """--dry-run: log what would be sent, never touch the network."""

    def insert(self, table: str, row: dict[str, Any]) -> None:
        log.info("[dry-run] insert %s %s", table, row)

    def upsert(self, table: str, row: dict[str, Any], on_conflict: str) -> None:
        log.info("[dry-run] upsert %s %s", table, row)

    def upload(self, bucket: str, path: str, data: bytes) -> None:
        log.debug("[dry-run] upload %s/%s (%d bytes)", bucket, path, len(data))

    def rpc(self, fn: str, params: dict[str, Any]) -> None:
        log.info("[dry-run] rpc %s %s", fn, params)
