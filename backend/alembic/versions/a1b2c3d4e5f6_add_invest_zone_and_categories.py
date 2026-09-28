"""add invest zone and new categories

Revision ID: a1b2c3d4e5f6
Revises: ccc3f8f02c5b
Create Date: 2026-04-10 16:00:00.000000
"""
from alembic import op

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = 'ccc3f8f02c5b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: 向已有 ENUM 类型添加新值（大写，与已有 ACTIVE/BASE 一致）
    # AssetZone: 新增 INVEST
    op.execute("ALTER TYPE assetzone ADD VALUE IF NOT EXISTS 'INVEST'")

    # AssetCategory: 新增4个能力投资类别
    op.execute("ALTER TYPE assetcategory ADD VALUE IF NOT EXISTS 'COURSE'")
    op.execute("ALTER TYPE assetcategory ADD VALUE IF NOT EXISTS 'TOOL'")
    op.execute("ALTER TYPE assetcategory ADD VALUE IF NOT EXISTS 'TRAFFIC'")
    op.execute("ALTER TYPE assetcategory ADD VALUE IF NOT EXISTS 'OTHER_INVEST'")


def downgrade() -> None:
    # PostgreSQL 不支持直接删除 ENUM 值
    # 如需回滚需要重建 ENUM 类型，此处仅留空
    pass