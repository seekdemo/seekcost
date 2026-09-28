#!/usr/bin/env python3
"""Run an isolated SQLite development instance without changing Docker settings."""

import argparse
import asyncio
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]


def local_environment(root: Path, *, backend_port: int = 8001, frontend_port: int = 3000) -> dict[str, str]:
    """Build process-only settings; never read or rewrite the operator's .env."""
    backend = root / "backend"
    data = backend / "data"
    data.mkdir(parents=True, exist_ok=True, mode=0o700)
    secret_path = data / "local-dev-secret"
    if not secret_path.exists():
        try:
            fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(secrets.token_urlsafe(48))
    secret = secret_path.read_text(encoding="utf-8").strip()
    if len(secret) < 32:
        raise RuntimeError(f"Local signing key is invalid: {secret_path}")
    database = data / "seekcost-local.db"
    env = os.environ.copy()
    env.update(
        APP_ENV="development",
        DATABASE_URL=f"sqlite+aiosqlite:///{database}",
        SECRET_KEY=secret,
        ALLOW_REGISTRATION="true",
        SQL_ECHO="false",
        CORS_ORIGINS=f'["http://localhost:{frontend_port}","http://127.0.0.1:{frontend_port}"]',
        SQLITE_BACKUP_DIR=str(backend / "backups" / "local-dev"),
        API_BASE_URL=f"http://127.0.0.1:{backend_port}",
        SEEKCOST_NEXT_DIST_DIR=".next-local",
    )
    return env


def initialize_sqlite(root: Path, env: dict[str, str]) -> None:
    # Import only after the local URL is selected: database.py creates its engine on import.
    os.environ.update(env)
    sys.path.insert(0, str(root / "backend"))
    from app.core.database import engine
    from app.core.sqlite_schema import ensure_sqlite_schema

    async def initialize() -> None:
        await ensure_sqlite_schema(engine)
        await engine.dispose()

    asyncio.run(initialize())


def ensure_frontend(root: Path, env: dict[str, str]) -> None:
    if not shutil.which("node") or not shutil.which("npm"):
        raise RuntimeError("Node.js 20+ and npm are required. Install them before starting the frontend.")
    version = subprocess.check_output(["node", "--version"], text=True).strip()
    try:
        major = int(version.lstrip("v").split(".", 1)[0])
    except ValueError as exc:
        raise RuntimeError(f"Could not read Node.js version: {version}") from exc
    if major < 20:
        raise RuntimeError(f"Node.js 20+ is required (found {version}).")
    if not (root / "frontend" / "node_modules" / ".bin" / "next").exists():
        print("Installing frontend dependencies with npm ci...", flush=True)
        subprocess.run(["npm", "ci"], cwd=root / "frontend", env=env, check=True)


def require_free_port(port: int) -> None:
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError(f"Port {port} is already in use. Stop that service before running local mode.")


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def run_servers(root: Path, env: dict[str, str], *, backend_port: int, frontend_port: int) -> int:
    require_free_port(backend_port)
    require_free_port(frontend_port)
    ensure_frontend(root, env)
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)],
        cwd=root / "backend", env=env,
    )
    frontend = None
    try:
        frontend = subprocess.Popen(
            ["npm", "run", "dev", "--", "--hostname", "127.0.0.1", "--port", str(frontend_port)],
            cwd=root / "frontend", env=env,
        )
        print(f"Local SeekCost: http://localhost:{frontend_port} (Ctrl+C stops both servers)", flush=True)
        while True:
            if backend.poll() is not None:
                return backend.returncode or 1
            if frontend.poll() is not None:
                return frontend.returncode or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        return 0
    finally:
        if frontend is not None:
            stop_process(frontend)
        stop_process(backend)


def main() -> int:
    parser = argparse.ArgumentParser(description="Start SeekCost locally with a private SQLite database.")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--init-only", action="store_true", help="Initialize SQLite without starting servers")
    actions.add_argument("--seed-demo", action="store_true", help="Seed an existing ordinary demo account with fictional fixtures")
    parser.add_argument("--backend-port", type=int, default=8001, help="Backend port (default: 8001)")
    parser.add_argument("--frontend-port", type=int, default=3000, help="Frontend port (default: 3000)")
    args = parser.parse_args()
    try:
        if not 1 <= args.backend_port <= 65535 or not 1 <= args.frontend_port <= 65535:
            raise ValueError("Ports must be between 1 and 65535.")
        if args.backend_port == args.frontend_port:
            raise ValueError("Backend and frontend ports must differ.")
        env = local_environment(ROOT, backend_port=args.backend_port, frontend_port=args.frontend_port)
        initialize_sqlite(ROOT, env)
        print("Local SQLite ready: backend/data/seekcost-local.db (ignored by Git)", flush=True)
        if args.init_only:
            return 0
        if args.seed_demo:
            subprocess.run(
                [sys.executable, "-m", "app.core.demo_data", "--confirm-demo"],
                cwd=ROOT / "backend", env=env, check=True,
            )
            return 0
        return run_servers(ROOT, env, backend_port=args.backend_port, frontend_port=args.frontend_port)
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Local start failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
