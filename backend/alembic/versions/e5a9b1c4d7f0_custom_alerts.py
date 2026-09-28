"""Private SMA alert rules and durable evidence notifications."""
from alembic import op
import sqlalchemy as sa

revision = "e5a9b1c4d7f0"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("custom_alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stock_id", sa.Integer(), sa.ForeignKey("watch_stocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("tolerance", sa.Float(), nullable=False),
        sa.Column("side", sa.String(12), nullable=False),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("inside", sa.Boolean(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_custom_alert_rules_user_id", "custom_alert_rules", ["user_id"])
    op.create_index("ix_custom_alert_rules_stock_id", "custom_alert_rules", ["stock_id"])
    op.create_table("alert_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("custom_alert_rules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stock_id", sa.Integer(), sa.ForeignKey("watch_stocks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rule_name", sa.String(100), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_alert_notifications_inbox", "alert_notifications", ["user_id", "read_at", "id"])


def downgrade():
    op.drop_table("alert_notifications")
    op.drop_table("custom_alert_rules")
