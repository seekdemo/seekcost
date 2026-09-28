"""add_watchlist_and_stock_memos

Revision ID: d4c7a91b2e30
Revises: 9c2e4d6f8a10
Create Date: 2026-06-10 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4c7a91b2e30"
down_revision: Union[str, None] = "9c2e4d6f8a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watch_stocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("stage", sa.Enum("RADAR", "CONVICTION", "STRIKE", name="watchstage"), server_default="RADAR", nullable=False),
        sa.Column("sector", sa.String(length=256), nullable=False),
        sa.Column("industries", sa.JSON(), nullable=False),
        sa.Column("concepts", sa.JSON(), nullable=False),
        sa.Column("inspiration", sa.Text(), nullable=False),
        sa.Column("entry_reason", sa.Text(), nullable=False),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("invalidation", sa.Text(), nullable=False),
        sa.Column("current_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("price_change", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("price_change_pct", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("price_session", sa.String(length=32), nullable=False),
        sa.Column("fair_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("strike_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("target_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("planned_capital", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("tranches", sa.Integer(), nullable=False),
        sa.Column("first_entry_drop", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("add_on_drop", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("milestones", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "symbol", name="uq_watch_stock_user_symbol"),
    )
    op.create_index(op.f("ix_watch_stocks_user_id"), "watch_stocks", ["user_id"], unique=False)
    op.create_index(op.f("ix_watch_stocks_symbol"), "watch_stocks", ["symbol"], unique=False)
    op.create_index(op.f("ix_watch_stocks_stage"), "watch_stocks", ["stage"], unique=False)

    op.create_table(
        "stock_memos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stock_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("pinned", sa.Boolean(), nullable=False),
        sa.Column("converted_note_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["converted_note_id"], ["notes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_id"], ["watch_stocks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_memos_user_id"), "stock_memos", ["user_id"], unique=False)
    op.create_index(op.f("ix_stock_memos_stock_id"), "stock_memos", ["stock_id"], unique=False)
    op.create_index(op.f("ix_stock_memos_converted_note_id"), "stock_memos", ["converted_note_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_stock_memos_converted_note_id"), table_name="stock_memos")
    op.drop_index(op.f("ix_stock_memos_stock_id"), table_name="stock_memos")
    op.drop_index(op.f("ix_stock_memos_user_id"), table_name="stock_memos")
    op.drop_table("stock_memos")
    op.drop_index(op.f("ix_watch_stocks_stage"), table_name="watch_stocks")
    op.drop_index(op.f("ix_watch_stocks_symbol"), table_name="watch_stocks")
    op.drop_index(op.f("ix_watch_stocks_user_id"), table_name="watch_stocks")
    op.drop_table("watch_stocks")
    op.execute("DROP TYPE IF EXISTS watchstage")
