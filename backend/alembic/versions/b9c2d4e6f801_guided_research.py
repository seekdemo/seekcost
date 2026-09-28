"""Private versioned company research drafts."""
from alembic import op
import sqlalchemy as sa

revision = 'b9c2d4e6f801'
down_revision = 'a7c1d3e6f9b2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('research_guides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stock_id', sa.Integer(), sa.ForeignKey('watch_stocks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('step', sa.Integer(), nullable=False),
        sa.Column('mode', sa.String(16), nullable=False),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('published_version', sa.Integer(), nullable=True),
        sa.Column('note_id', sa.Integer(), sa.ForeignKey('notes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'stock_id', name='uq_research_guide_owner_stock'))
    op.create_index('ix_research_guides_user_id', 'research_guides', ['user_id'])
    op.create_index('ix_research_guides_stock_id', 'research_guides', ['stock_id'])


def downgrade():
    if op.get_bind().execute(sa.text('SELECT count(*) FROM research_guides')).scalar():
        raise RuntimeError('Refusing to drop saved company research; export explicitly first')
    op.drop_table('research_guides')
