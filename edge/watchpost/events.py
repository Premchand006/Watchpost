"""Event record passed from the rule modules to the engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SEVERITY = {
    "intrusion": "critical",
    "loiter": "warning",
    "offline": "warning",
    "tamper": "warning",
}


@dataclass(frozen=True)
class Event:
    type: str  # enter | exit | intrusion | loiter | offline | online | tamper
    track_id: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def severity(self) -> str:
        return SEVERITY.get(self.type, "info")
