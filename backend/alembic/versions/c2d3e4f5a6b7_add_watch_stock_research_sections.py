"""add private watchlist company research sections"""
from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SECTION_KEYS = (
    "company_overview",
    "industry_moat",
    "growth_financials",
    "risks_invalidation",
    "valuation_decision",
)


def _json(value):
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    return json.loads(value) if isinstance(value, str) and value.startswith(("[", "{")) else value


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("watch_stock_research_sections"):
        op.create_table(
            "watch_stock_research_sections",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("stock_id", sa.Integer(), nullable=False),
            sa.Column("key", sa.String(length=32), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False, server_default=""),
            sa.Column("evidence", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("open_questions", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["stock_id"], ["watch_stocks.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "stock_id", "key", name="uq_watch_research_user_stock_key"),
        )
        op.create_index("ix_watch_stock_research_sections_user_id", "watch_stock_research_sections", ["user_id"])
        op.create_index("ix_watch_stock_research_sections_stock_id", "watch_stock_research_sections", ["stock_id"])
    stocks = bind.execute(sa.text("""
        SELECT id, user_id, sector, industries, concepts, entry_reason, business_summary,
               growth_drivers, fundamental_risks, fundamental_metrics, thesis, invalidation,
               fair_price, strike_price, target_price
        FROM watch_stocks
    """)).mappings()
    for stock in stocks:
        evidence = {
            "company_overview": [("Entry reason", stock["entry_reason"])],
            "industry_moat": [("Industries", _json(stock["industries"])), ("Concepts", _json(stock["concepts"]))],
            "growth_financials": [("Fundamental metrics", _json(stock["fundamental_metrics"]))],
            "risks_invalidation": [("Invalidation", stock["invalidation"])],
            "valuation_decision": [("Price anchors", {"fair_price": stock["fair_price"], "strike_price": stock["strike_price"], "target_price": stock["target_price"]})],
        }
        summaries = {
            "company_overview": stock["business_summary"] or "",
            "industry_moat": stock["sector"] or "",
            "growth_financials": stock["growth_drivers"] or "",
            "risks_invalidation": stock["fundamental_risks"] or "",
            "valuation_decision": stock["thesis"] or "",
        }
        for key in SECTION_KEYS:
            exists = bind.execute(sa.text(
                "SELECT 1 FROM watch_stock_research_sections WHERE user_id=:user_id AND stock_id=:stock_id AND key=:key"
            ), {"user_id": stock["user_id"], "stock_id": stock["id"], "key": key}).first()
            if exists:
                continue
            items = [{"label": label, "value": value} for label, value in evidence[key] if value not in (None, "", [], {})]
            bind.execute(sa.text("""
                INSERT INTO watch_stock_research_sections
                    (user_id, stock_id, key, summary, evidence, open_questions, review_note)
                VALUES (:user_id, :stock_id, :key, :summary, :evidence, '[]', '')
            """), {"user_id": stock["user_id"], "stock_id": stock["id"], "key": key,
                    "summary": summaries[key], "evidence": json.dumps(items, default=str)})


def downgrade() -> None:
    op.drop_index("ix_watch_stock_research_sections_stock_id", table_name="watch_stock_research_sections")
    op.drop_index("ix_watch_stock_research_sections_user_id", table_name="watch_stock_research_sections")
    op.drop_table("watch_stock_research_sections")
