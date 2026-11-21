"""SQLite-backed persistence layer for datasets, annotations, model registry, audit logs, and field records."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class FieldSenseStore:
    def __init__(self, db_path: str | Path = "data/fieldsense.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    status TEXT NOT NULL,
                    details_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS idempotency_keys (
                    key TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    record_type TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS field_records (
                    id TEXT PRIMARY KEY,
                    workflow_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    consent_verified INTEGER NOT NULL,
                    human_reviewed INTEGER NOT NULL,
                    pii_redacted INTEGER NOT NULL,
                    payload_json TEXT NOT NULL
                );
                """
            )

    def append_audit(
        self, actor_role: str, action: str, resource: str, status: str, details: dict[str, Any]
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO audit_logs (timestamp, actor_role, action, resource, status, details_json) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    datetime.now(timezone.utc).isoformat(),
                    actor_role,
                    action,
                    resource,
                    status,
                    json.dumps(details),
                ),
            )

    def register_idempotent(self, key: str, record_type: str) -> bool:
        """Return True if key is new and recorded, False if duplicate."""
        with self._connect() as conn:
            cur = conn.execute("SELECT key FROM idempotency_keys WHERE key = ?", (key,))
            if cur.fetchone() is not None:
                return False
            conn.execute(
                "INSERT INTO idempotency_keys (key, created_at, record_type) VALUES (?, ?, ?)",
                (key, datetime.now(timezone.utc).isoformat(), record_type),
            )
            return True

    def list_audits(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "actor_role": r["actor_role"],
                    "action": r["action"],
                    "resource": r["resource"],
                    "status": r["status"],
                    "details": json.loads(r["details_json"]),
                }
                for r in rows
            ]
