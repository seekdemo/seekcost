from pathlib import Path
import sqlite3

import pytest

from app.core.sqlite_backup import backup_database, restore_database


def database(path):
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE evidence (body TEXT)")
        db.execute("INSERT INTO evidence VALUES ('synthetic research 理由')")


def test_encrypted_backup_and_exclusive_restore(tmp_path):
    source = tmp_path / "source.db"
    database(source)
    key = tmp_path / "data" / "backup.key"
    archive = backup_database(source, tmp_path / "archives", key)
    assert b"synthetic" not in archive.read_bytes()
    assert archive.stat().st_mode & 0o777 == 0o600
    assert key.stat().st_mode & 0o777 == 0o600
    target = tmp_path / "recovery.db"
    restore_database(archive, key, target)
    with sqlite3.connect(target) as db:
        assert db.execute("SELECT body FROM evidence").fetchone()[0] == "synthetic research 理由"
    with pytest.raises(FileExistsError):
        restore_database(archive, key, source)
    assert backup_database(source, tmp_path / "archives", key) != archive


def test_missing_source_is_not_created(tmp_path):
    source = tmp_path / "missing.db"
    with pytest.raises(FileNotFoundError):
        backup_database(source, tmp_path / "archives", tmp_path / "key")
    assert not source.exists()


def test_missing_key_with_existing_snapshots_is_not_replaced(tmp_path):
    source = tmp_path / "source.db"
    database(source)
    key = tmp_path / "key"
    backup_database(source, tmp_path / "archives", key)
    key.unlink()
    with pytest.raises(RuntimeError, match="key"):
        backup_database(source, tmp_path / "archives", key)
    assert not key.exists()


def test_wrong_key_leaves_no_destination(tmp_path):
    from cryptography.fernet import Fernet, InvalidToken
    source = tmp_path / "source.db"
    database(source)
    archive = backup_database(source, tmp_path / "archives", tmp_path / "key")
    wrong = tmp_path / "wrong.key"
    wrong.write_bytes(Fernet.generate_key())
    with pytest.raises(InvalidToken):
        restore_database(archive, wrong, tmp_path / "recovery.db")
    assert not (tmp_path / "recovery.db").exists()
