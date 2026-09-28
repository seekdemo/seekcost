"""Public content drafts, publication and explicit administrator membership."""
from alembic import op
import sqlalchemy as sa

revision = "a7c1d3e6f9b2"
down_revision = "f6b0c2d5e8a1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("site_admins",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("site_content",
        sa.Column("key", sa.String(40), primary_key=True),
        sa.Column("locale", sa.String(12), primary_key=True),
        sa.Column("draft", sa.JSON(), nullable=False),
        sa.Column("published", sa.JSON(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("content_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("locale", sa.String(12), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade():
    for table in ("site_admins", "site_content", "content_audit"):
        if op.get_bind().execute(sa.text(f"SELECT count(*) FROM {table}")).scalar():
            raise RuntimeError("Refusing to drop public content, permissions or audit history; export and migrate explicitly")
    op.drop_table("content_audit")
    op.drop_table("site_content")
    op.drop_table("site_admins")
