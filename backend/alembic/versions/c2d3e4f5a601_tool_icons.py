"""Optional manual icon URL; null means automatic discovery."""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a601'
down_revision = 'b9c2d4e6f801'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('investment_tools', sa.Column('icon_url', sa.String(2048), nullable=True))


def downgrade():
    op.drop_column('investment_tools', 'icon_url')
