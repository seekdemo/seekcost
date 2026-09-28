"""separate realized pnl from positive profit recovery

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column(
            "total_realized_pnl",
            sa.Numeric(precision=18, scale=4),
            nullable=False,
            server_default="0",
            comment="累计净已实现盈亏（盈利与亏损均计入）",
        ),
    )
    # 历史版本曾把 IBKR 的净已实现盈亏写进 total_cashed。先原样复制，
    # 避免迁移时丢失券商口径；后续本地交易重算和 IBKR 导入会分别校准新字段。
    op.execute("UPDATE assets SET total_realized_pnl = total_cashed")


def downgrade() -> None:
    op.drop_column("assets", "total_realized_pnl")
