"""Schema bootstrap for local SQLite; production PostgreSQL uses Alembic."""

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.alert_scope_schema import ensure_alert_scope_schema
from app.core.database import Base
import app.models  # noqa: F401 - register all mapped tables


async def ensure_sqlite_schema(engine: AsyncEngine) -> None:
    """Create a fresh local schema and apply bounded older-SQLite fixes."""
    if engine.url.get_backend_name() != "sqlite":
        raise ValueError("SQLite schema bootstrap requires a SQLite engine")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(ensure_alert_scope_schema)
        columns = await connection.run_sync(
            lambda sync: {column["name"] for column in inspect(sync).get_columns("investment_tools")}
        )
        if "icon_url" not in columns:
            await connection.execute(text("ALTER TABLE investment_tools ADD COLUMN icon_url VARCHAR(2048)"))
