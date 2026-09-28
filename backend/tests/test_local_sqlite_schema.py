from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
import pytest

from app.core.sqlite_schema import ensure_sqlite_schema


@pytest.mark.asyncio
async def test_fresh_sqlite_schema_is_initialized_idempotently(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'local.db'}")
    try:
        await ensure_sqlite_schema(engine)
        await ensure_sqlite_schema(engine)
        async with engine.connect() as connection:
            tables, columns = await connection.run_sync(
                lambda sync: (
                    set(inspect(sync).get_table_names()),
                    {item["name"] for item in inspect(sync).get_columns("investment_tools")},
                )
            )
        assert {"users", "watch_stocks", "investment_tools"} <= tables
        assert "icon_url" in columns
    finally:
        await engine.dispose()
