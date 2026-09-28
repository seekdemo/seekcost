"""personal research fields and privacy migration

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("kind", sa.String(24), nullable=False, server_default="quick"))
    op.add_column("notes", sa.Column("status", sa.String(24), nullable=False, server_default="active"))
    op.add_column("notes", sa.Column("confidence", sa.Integer(), nullable=True))
    op.add_column("notes", sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notes", sa.Column("starred", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("notes", sa.Column("cover_image_url", sa.Text(), nullable=True))
    op.add_column("notes", sa.Column("cover_color", sa.String(24), nullable=True))
    op.create_index("ix_notes_kind", "notes", ["kind"])
    op.create_index("ix_notes_status", "notes", ["status"])
    op.create_index("ix_notes_next_review_at", "notes", ["next_review_at"])
    op.create_index("ix_notes_starred", "notes", ["starred"])

    op.add_column("note_series", sa.Column("starred", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_note_series_starred", "note_series", ["starred"])

    op.add_column("watch_stocks", sa.Column("business_summary", sa.Text(), nullable=False, server_default=""))
    op.add_column("watch_stocks", sa.Column("growth_drivers", sa.Text(), nullable=False, server_default=""))
    op.add_column("watch_stocks", sa.Column("fundamental_risks", sa.Text(), nullable=False, server_default=""))
    op.add_column("watch_stocks", sa.Column("fundamental_metrics", sa.JSON(), nullable=False, server_default="[]"))

    op.create_table(
        "research_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(24), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("note_id", "entity_type", "entity_id", name="uq_research_link_target"),
    )
    op.create_index("ix_research_links_note_id", "research_links", ["note_id"])
    op.create_index("ix_research_links_user_id", "research_links", ["user_id"])
    op.create_index("ix_research_links_entity_type", "research_links", ["entity_type"])
    op.create_index("ix_research_links_entity_id", "research_links", ["entity_id"])

    op.execute("UPDATE notes SET visibility = 'PRIVATE' WHERE visibility <> 'PRIVATE'")
    op.execute("UPDATE note_series SET visibility = 'PRIVATE' WHERE visibility <> 'PRIVATE'")
    op.execute(
        """
        UPDATE notes AS n SET starred = TRUE
        FROM note_favorites AS f
        WHERE f.note_id = n.id AND f.user_id = n.user_id
        """
    )
    op.execute(
        """
        UPDATE note_series AS s SET starred = TRUE
        FROM note_series_favorites AS f
        WHERE f.user_id = s.user_id
          AND (f.series = s.name OR f.series = 'id:' || CAST(s.id AS TEXT))
        """
    )


def downgrade() -> None:
    op.drop_table("research_links")
    op.drop_index("ix_note_series_starred", table_name="note_series")
    op.drop_column("note_series", "starred")
    for column in ("fundamental_metrics", "fundamental_risks", "growth_drivers", "business_summary"):
        op.drop_column("watch_stocks", column)
    for index in ("ix_notes_starred", "ix_notes_next_review_at", "ix_notes_status", "ix_notes_kind"):
        op.drop_index(index, table_name="notes")
    for column in ("cover_color", "cover_image_url", "starred", "next_review_at", "confidence", "status", "kind"):
        op.drop_column("notes", column)
