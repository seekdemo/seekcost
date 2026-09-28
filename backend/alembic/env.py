import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Alembic Config
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 加载所有模型
from app.core.database import Base
from app.models import User, Asset, Transaction, ProfitAllocation, Harbor, Liability, TradePlan, Tag, asset_tags, IBKRLotRecord, IBKRCashFlowRecord, QuantSignalSnapshot, QuantStrategyQualification, QuantStrategySetting
from app.models.harbor import HarborGoal
from app.models.sell_batch_item import SellBatchItem

target_metadata = Base.metadata

# 从 .env 读取数据库 URL
from app.core.config import get_settings
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
