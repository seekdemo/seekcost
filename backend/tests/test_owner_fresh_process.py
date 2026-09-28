import os
from pathlib import Path
import subprocess
import sys


def test_owner_creation_registers_relationship_models_in_fresh_process(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env.update(
        DATABASE_URL=f"sqlite+aiosqlite:///{tmp_path / 'owner.db'}",
        APP_ENV="development",
        SECRET_KEY="fresh-process-test-key",
    )
    program = """
import asyncio
from app.core.database import Base, engine
from app.core.owner import create_owner

async def run():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await create_owner('owner-test', 'a-long-test-password')
    await engine.dispose()

asyncio.run(run())
"""
    result = subprocess.run(
        [sys.executable, "-c", program], cwd=backend, env=env,
        text=True, capture_output=True,
    )
    assert result.returncode == 0, result.stderr
