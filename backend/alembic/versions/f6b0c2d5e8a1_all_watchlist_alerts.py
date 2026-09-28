"""All-watchlist scope with independent per-target entry/cooldown state."""
from alembic import op
import sqlalchemy as sa

revision = "f6b0c2d5e8a1"
down_revision = "e5a9b1c4d7f0"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("custom_alert_rules") as batch:
        batch.add_column(sa.Column("scope", sa.String(12), nullable=False, server_default="single"))
        batch.alter_column("stock_id", existing_type=sa.Integer(), nullable=True)
    op.create_table("custom_alert_rule_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("custom_alert_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stock_id", sa.Integer(), sa.ForeignKey("watch_stocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inside", sa.Boolean(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.UniqueConstraint("rule_id", "stock_id", name="uq_alert_rule_state_target"))
    op.create_index("ix_custom_alert_rule_states_stock_id", "custom_alert_rule_states", ["stock_id"])


def downgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM custom_alert_rules WHERE stock_id IS NULL")).scalar():
        raise RuntimeError("Convert or remove all-watchlist rules before downgrading; refusing data loss")
    op.drop_table("custom_alert_rule_states")
    with op.batch_alter_table("custom_alert_rules") as batch:
        batch.drop_column("scope")
        batch.alter_column("stock_id", existing_type=sa.Integer(), nullable=False)
