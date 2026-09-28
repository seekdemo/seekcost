from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.v1.router import api_router
from app.core import price_scheduler, custom_alerts, sqlite_backup
from app.core.database import Base, engine, async_session
from app.core.exchange_rate import warm_up_cache
import app.models  # noqa: F401 - register all mapped tables for local SQLite

settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
    # 启动时
    if settings.DATABASE_URL.startswith("sqlite"):
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            from app.core.alert_scope_schema import ensure_alert_scope_schema
            await connection.run_sync(ensure_alert_scope_schema)
            # Local SQLite databases are created without an Alembic baseline.
            from sqlalchemy import inspect
            columns = await connection.run_sync(lambda sync: {c["name"] for c in inspect(sync).get_columns("investment_tools")})
            if "icon_url" not in columns:
                await connection.execute(text("ALTER TABLE investment_tools ADD COLUMN icon_url VARCHAR(2048)"))
    await sqlite_backup.start()
    price_scheduler.start()
    custom_alerts.start()
    await warm_up_cache()
    yield
    # 关闭时
    price_scheduler.stop()
    custom_alerts.stop()
    await sqlite_backup.stop()


app = FastAPI(
    title="SeekCost",
    description="散户专属的心理成本管理系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "SeekCost"}


@app.get("/health/ready")
async def readiness_check():
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}


@app.get("/health/backup")
async def local_backup_health():
    state = sqlite_backup.status()
    return JSONResponse(status_code=503 if state["status"] == "failed" else 200, content=state)
