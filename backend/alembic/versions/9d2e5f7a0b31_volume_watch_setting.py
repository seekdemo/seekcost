"""Add per-user completed-session volume threshold."""
from alembic import op
import sqlalchemy as sa

revision = "9d2e5f7a0b31"
down_revision = "c2d3e4f5a601"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "volume_watch_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False, server_default="1.5"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_volume_watch_user"),
    )
    op.create_index("ix_volume_watch_settings_user_id", "volume_watch_settings", ["user_id"])


def downgrade():
    op.drop_index("ix_volume_watch_settings_user_id", table_name="volume_watch_settings")
    op.drop_table("volume_watch_settings")
