"""Opt-in local SQLite snapshots. PostgreSQL uses the separate Restic service."""
import argparse
import asyncio
from contextlib import closing, suppress
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import sqlite3
import tempfile
from uuid import uuid4

from cryptography.fernet import Fernet
from sqlalchemy.engine import make_url

logger = logging.getLogger(__name__)
_task = None
_state = {"enabled": False, "status": "disabled", "last_success": None}


def backup_database(source: Path, directory: Path, key: Path) -> Path:
    source, directory, key = source.resolve(), directory.resolve(), key.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    if not key.exists():
        if any(directory.glob("*.fernet")):
            raise RuntimeError("Backup key missing; refusing to orphan previous snapshots with a new key")
        key.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(Fernet.generate_key())
    cipher = Fernet(key.read_bytes().strip())
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as live, closing(sqlite3.connect(":memory:")) as snapshot:
        live.backup(snapshot)
        if snapshot.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise RuntimeError("Snapshot integrity check failed")
        payload = cipher.encrypt("\n".join(snapshot.iterdump()).encode("utf-8"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = directory / f"seekcost-{stamp}-{uuid4().hex}.sql.fernet"
    with tempfile.NamedTemporaryFile(dir=directory, prefix=".partial-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
            # Atomic publication with no overwrite, even in an unlikely name collision.
            os.link(temporary, archive)
        finally:
            temporary.unlink(missing_ok=True)
    return archive


def restore_database(archive: Path, key: Path, target: Path):
    if target.exists():
        raise FileExistsError("Restore requires a new destination, never an existing database")
    sql = Fernet(key.read_bytes().strip()).decrypt(archive.read_bytes()).decode("utf-8")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    # Failed recovery remains a separate file for inspection; source is untouched.
    with closing(sqlite3.connect(target)) as db:
        db.executescript(sql)
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise RuntimeError("Restored database integrity check failed")


def status():
    return dict(_state)


async def start():
    global _task
    from app.core.config import get_settings
    settings = get_settings()
    if not settings.SQLITE_BACKUP_DIR or not settings.DATABASE_URL.startswith("sqlite"):
        return
    if _task is not None and not _task.done():
        return
    source = Path(make_url(settings.DATABASE_URL).database).resolve()
    directory, key = Path(settings.SQLITE_BACKUP_DIR), source.parent / "backup.key"
    _state.update(enabled=True, status="starting", last_success=None)

    async def take():
        try:
            await asyncio.to_thread(backup_database, source, directory, key)
        except Exception:
            _state["status"] = "failed"
            logger.error("Local SQLite backup failed; inspect storage and recovery key")
            raise
        _state.update(status="ok", last_success=datetime.now(timezone.utc).isoformat())
        logger.info("Encrypted local SQLite snapshot completed")

    # Fail startup rather than silently run with an unusable initial backup setup.
    await take()

    async def loop():
        while True:
            await asyncio.sleep(settings.SQLITE_BACKUP_INTERVAL_SECONDS)
            try:
                await take()
            except Exception:
                pass  # failure remains observable via /health/backup and logs

    _task = asyncio.create_task(loop())


async def stop():
    global _task
    if _task is not None:
        _task.cancel()
        with suppress(asyncio.CancelledError):
            await _task
        _task = None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local SQLite backup or restore; restore never replaces an existing file.")
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("source", type=Path, help="Database (backup) or encrypted snapshot (restore)")
    parser.add_argument("destination", type=Path, help="Backup directory or NEW recovery database file")
    parser.add_argument("--key", required=True, type=Path)
    args = parser.parse_args()
    if args.action == "backup":
        print(backup_database(args.source, args.destination, args.key))
    else:
        restore_database(args.source, args.key, args.destination)
        print("Restored into a new file. Original database untouched.")
