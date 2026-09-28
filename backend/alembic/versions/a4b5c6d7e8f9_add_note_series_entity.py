"""add note series entity

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_series",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("visibility", sa.Enum("PRIVATE", "WORKSPACE", "PUBLIC", name="noteseriesvisibility"), server_default="PRIVATE", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_note_series_user_name"),
    )
    op.create_index(op.f("ix_note_series_user_id"), "note_series", ["user_id"], unique=False)
    op.create_index(op.f("ix_note_series_visibility"), "note_series", ["visibility"], unique=False)

    connection = op.get_bind()
    connection.execute(sa.text(
        "INSERT INTO note_series (user_id, name, description, visibility, created_at, updated_at) "
        "SELECT user_id, series, '', 'PRIVATE', MIN(created_at), MAX(updated_at) "
        "FROM notes WHERE series IS NOT NULL AND TRIM(series) <> '' GROUP BY user_id, series"
    ))

    with op.batch_alter_table("notes") as batch_op:
        batch_op.add_column(sa.Column("series_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_notes_series_id", "note_series", ["series_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index(op.f("ix_notes_series_id"), ["series_id"], unique=False)

    connection.execute(sa.text(
        "UPDATE notes SET series_id = ("
        "SELECT note_series.id FROM note_series "
        "WHERE note_series.user_id = notes.user_id AND note_series.name = notes.series"
        ") WHERE series IS NOT NULL AND TRIM(series) <> ''"
    ))


def downgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_index(op.f("ix_notes_series_id"))
        batch_op.drop_constraint("fk_notes_series_id", type_="foreignkey")
        batch_op.drop_column("series_id")
    op.drop_index(op.f("ix_note_series_visibility"), table_name="note_series")
    op.drop_index(op.f("ix_note_series_user_id"), table_name="note_series")
    op.drop_table("note_series")
