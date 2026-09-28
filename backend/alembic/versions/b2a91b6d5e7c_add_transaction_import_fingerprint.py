"""add_transaction_import_fingerprint

Revision ID: b2a91b6d5e7c
Revises: ccff89f26dea
Create Date: 2026-04-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2a91b6d5e7c"
down_revision: Union[str, None] = "ccff89f26dea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("import_fingerprint", sa.String(length=128), nullable=True, comment="导入去重指纹（同一资产内唯一）"),
    )
    op.create_index(
        "ux_transactions_asset_import_fingerprint",
        "transactions",
        ["asset_id", "import_fingerprint"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_transactions_asset_import_fingerprint", table_name="transactions")
    op.drop_column("transactions", "import_fingerprint")
