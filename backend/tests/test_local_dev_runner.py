import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("local_dev", ROOT / "scripts" / "local_dev.py")
assert SPEC and SPEC.loader
local_dev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(local_dev)


def test_local_environment_is_isolated_and_secret_is_persistent(tmp_path):
    backend = tmp_path / "backend"
    backend.mkdir()
    existing_env = backend / ".env"
    existing_env.write_text("DATABASE_URL=postgresql+asyncpg://private\n")

    first = local_dev.local_environment(tmp_path)
    second = local_dev.local_environment(tmp_path)

    assert first["DATABASE_URL"] == f"sqlite+aiosqlite:///{backend / 'data' / 'seekcost-local.db'}"
    assert first["DATABASE_URL"] == second["DATABASE_URL"]
    assert first["SECRET_KEY"] == second["SECRET_KEY"]
    assert len(first["SECRET_KEY"]) >= 32
    assert first["APP_ENV"] == "development"
    assert first["ALLOW_REGISTRATION"] == "true"
    assert existing_env.read_text() == "DATABASE_URL=postgresql+asyncpg://private\n"
    assert (backend / "data" / "local-dev-secret").stat().st_mode & 0o077 == 0


def test_local_environment_allows_isolated_test_ports(tmp_path):
    env = local_dev.local_environment(tmp_path, backend_port=18001, frontend_port=13000)
    assert env["API_BASE_URL"] == "http://127.0.0.1:18001"
    assert "http://localhost:13000" in env["CORS_ORIGINS"]
