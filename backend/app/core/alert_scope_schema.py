"""Bounded upgrade for the existing local SQLite create_all bootstrap."""
from sqlalchemy import inspect, String, Integer
from alembic.migration import MigrationContext
from alembic.operations import Operations


def ensure_alert_scope_schema(connection):
    columns = {column["name"]: column for column in inspect(connection).get_columns("custom_alert_rules")}
    if "scope" in columns and columns["stock_id"]["nullable"]:
        return
    # Mirrors f6b0c2d5e8a1 for local SQLite installations not managed by Alembic.
    operations = Operations(MigrationContext.configure(connection))
    with operations.batch_alter_table("custom_alert_rules") as batch:
        if "scope" not in columns:
            from sqlalchemy import Column
            batch.add_column(Column("scope", String(12), nullable=False, server_default="single"))
        if not columns["stock_id"]["nullable"]:
            batch.alter_column("stock_id", existing_type=Integer(), nullable=True)
