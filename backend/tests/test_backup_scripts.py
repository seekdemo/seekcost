"""Control-flow tests with stub clients, NOT a PostgreSQL/Restic restore drill."""
import importlib.util
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "deploy" / "backup"


@pytest.fixture
def clients(tmp_path):
    binaries = tmp_path / "bin"
    binaries.mkdir()
    programs = {
        "flock": "exit 0",
        "pg_dump": 'printf "synthetic dump"; exit "${DUMP_EXIT:-0}"',
        "restic": '''if [[ "$*" == *" copy "* ]]; then exit "${COPY_EXIT:-0}"; fi
case "$1" in
init) touch "$RESTIC_REPOSITORY/config";;
backup) cat >/dev/null; printf '%s\\n' '{"message_type":"summary","snapshot_id":"abcdef1234567890"}';;
dump) printf 'synthetic dump';;
esac''',
        "createdb": 'printf "%s\\n" "$*" >> "$COMMAND_LOG"; exit "${CREATE_EXIT:-0}"',
        "pg_restore": 'printf "%s\\n" "$*" >> "$COMMAND_LOG"; cat >/dev/null; exit "${RESTORE_EXIT:-0}"',
        "psql": 'printf "%s\\n" "$*" >> "$COMMAND_LOG"',
        "curl": 'exit "${WEBHOOK_EXIT:-0}"',
    }
    for name, code in programs.items():
        path = binaries / name
        path.write_text("#!/usr/bin/env bash\n" + code + "\n")
        path.chmod(0o755)
    key = tmp_path / "password"
    key.write_text("test-only-not-a-production-secret")
    return {
        **os.environ, "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
        "RESTIC_REPOSITORY": str(tmp_path / "backups"), "RESTIC_PASSWORD_FILE": str(key),
        "BACKUP_INTERVAL_SECONDS": "86400", "PGDATABASE": "seekcost",
        "OFFSITE_REPOSITORY": "", "BACKUP_WEBHOOK_URL": "",
        "COMMAND_LOG": str(tmp_path / "commands"),
    }


def run(script, env, *args):
    return subprocess.run(["bash", str(SCRIPTS / script), *args], env=env, capture_output=True, text=True)


def test_backup_success_and_health(clients):
    result = run("backup.sh", clients)
    assert result.returncode == 0, result.stderr
    assert run("health.sh", clients).returncode == 0
    assert "abcdef1234567890" in (Path(clients["RESTIC_REPOSITORY"]) / ".seekcost-success").read_text()


@pytest.mark.parametrize("fault", [{"DUMP_EXIT": "1"}, {"OFFSITE_REPOSITORY": "s3:test", "COPY_EXIT": "1"}, {"BACKUP_WEBHOOK_URL": "https://test.invalid", "WEBHOOK_EXIT": "1"}])
def test_failure_never_reports_healthy(clients, fault):
    assert run("backup.sh", clients).returncode == 0
    result = run("backup.sh", {**clients, **fault})
    assert result.returncode != 0
    assert run("health.sh", clients).returncode != 0


@pytest.mark.parametrize("snapshot,target", [("latest", "seekcost_restore_test"), ("abcdef12", "seekcost"), ("abcdef12", "postgres"), ("abcdef12", "seekcost_restore_a;drop")])
def test_restore_rejects_unsafe_targets(clients, snapshot, target):
    assert run("restore.sh", clients, snapshot, target).returncode != 0
    assert not Path(clients["COMMAND_LOG"]).exists()


def test_restore_never_overwrites_existing_database(clients):
    result = run("restore.sh", {**clients, "CREATE_EXIT": "1"}, "abcdef12", "seekcost_restore_test")
    assert result.returncode != 0
    assert "--dbname" not in Path(clients["COMMAND_LOG"]).read_text()


def test_restore_targets_only_new_database_and_propagates_failure(clients):
    assert run("restore.sh", clients, "abcdef12", "seekcost_restore_test").returncode == 0
    log = Path(clients["COMMAND_LOG"]).read_text()
    assert "--dbname=seekcost_restore_test" in log
    assert "--clean" not in log
    assert run("restore.sh", {**clients, "RESTORE_EXIT": "1"}, "abcdef12", "seekcost_restore_failed").returncode != 0


def test_initializer_is_private_and_refuses_overwrite(tmp_path):
    spec = importlib.util.spec_from_file_location("selfhost_init", ROOT / "scripts" / "selfhost-init.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    (tmp_path / "deploy").mkdir()
    (tmp_path / "deploy" / "selfhost.env.example").write_text((ROOT / "deploy" / "selfhost.env.example").read_text())
    module.initialize(tmp_path)
    original = (tmp_path / ".env").read_text()
    for key in ("SECRET_KEY", "APP_DB_PASSWORD", "POSTGRES_PASSWORD"):
        value = next(line.split("=", 1)[1] for line in original.splitlines() if line.startswith(key + "="))
        assert len(value) == 64
    assert (tmp_path / ".env").stat().st_mode & 0o777 == 0o600
    assert (tmp_path / "deploy/secrets/backup-password").stat().st_mode & 0o777 == 0o600
    with pytest.raises(SystemExit, match="Refusing"):
        module.initialize(tmp_path)
    assert (tmp_path / ".env").read_text() == original
