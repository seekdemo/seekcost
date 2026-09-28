"""Explicit, idempotent cleanup for local demo accounts.

The cleanup intentionally targets a username supplied by the caller. It never
guesses which account is safe to remove and it leaves the schema untouched.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.sell_batch_item import SellBatchItem  # noqa: F401 - register Transaction relationship target


@dataclass(frozen=True)
class CleanupReport:
    username: str
    user_id: int | None
    deleted: dict[str, int] = field(default_factory=dict)

    @property
    def total_deleted(self) -> int:
        return sum(self.deleted.values())

    def as_dict(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "user_id": self.user_id,
            "deleted": dict(self.deleted),
            "total_deleted": self.total_deleted,
        }


@dataclass(frozen=True)
class _Operation:
    table: str
    where: str
    params: dict[str, Any]


# All identifiers are static, reviewed table names. Keeping the list explicit
# makes this safe for both SQLite and PostgreSQL and prevents broad table wipes.
TABLES = (
    "research_guides",
    "site_admins",
    "alert_notifications",
    "custom_alert_rule_states",
    "custom_alert_rules",
    "note_comment_reactions",
    "note_comments",
    "research_links",
    "note_favorites",
    "note_series_favorites",
    "stock_memos",
    "watch_stock_research_sections",
    "investment_tools",
    "earnings_events",
    "quant_signal_snapshots",
    "quant_strategy_qualifications",
    "quant_strategy_settings",
    "watch_stocks",
    "asset_tags",
    "ibkr_lots",
    "sell_batch_items",
    "profit_allocations",
    "transactions",
    "trade_plans",
    "asset_fundings",
    "funding_transactions",
    "funding_pools",
    "cash_accounts",
    "ibkr_cash_flows",
    "income_records",
    "salary_configs",
    "liabilities",
    "harbor_goals",
    "harbor",
    "tags",
    "share_likes",
    "comments",
    "shares",
    "follows",
    "notifications",
    "assets",
    "users",
)


async def _existing_tables(db: AsyncSession) -> set[str]:
    return await db.run_sync(lambda session: set(inspect(session.connection()).get_table_names()))


async def _values(db: AsyncSession, table: str, where: str, params: dict[str, Any]) -> list[int]:
    result = await db.execute(text(f'SELECT "id" FROM "{table}" WHERE {where}'), params)
    return [int(row[0]) for row in result.all()]


def _in_clause(column: str, values: list[int], prefix: str) -> tuple[str, dict[str, int]]:
    if not values:
        return "1 = 0", {}
    names = [f":{prefix}_{index}" for index in range(len(values))]
    return f'"{column}" IN ({", ".join(names)})', {
        name[1:]: value for name, value in zip(names, values)
    }


def _combine(*parts: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    valid = [(where, params) for where, params in parts if where != "1 = 0"]
    if not valid:
        return "1 = 0", {}
    return " OR ".join(f"({where})" for where, _ in valid), {
        key: value for _, params in valid for key, value in params.items()
    }


async def _owned_ids(db: AsyncSession, table: str, user_id: int, tables: set[str]) -> list[int]:
    if table not in tables:
        return []
    return await _values(db, table, '"user_id" = :user_id', {"user_id": user_id})


async def _operations(db: AsyncSession, user: User, tables: set[str]) -> list[_Operation]:
    user_id = int(user.id)
    note_ids = await _owned_ids(db, "notes", user_id, tables)
    series_ids = await _owned_ids(db, "note_series", user_id, tables)
    stock_ids = await _owned_ids(db, "watch_stocks", user_id, tables)
    asset_ids = await _owned_ids(db, "assets", user_id, tables)
    pool_ids = await _owned_ids(db, "funding_pools", user_id, tables)
    share_ids = await _owned_ids(db, "shares", user_id, tables)

    tx_ids: list[int] = []
    if "transactions" in tables and asset_ids:
        tx_ids = await _values(db, "transactions", *_in_clause("asset_id", asset_ids, "asset"))
    comment_ids: list[int] = []
    if "note_comments" in tables and note_ids:
        comment_ids = await _values(db, "note_comments", *_in_clause("note_id", note_ids, "note"))

    operations: list[_Operation] = []

    def add(table: str, where: str, params: dict[str, Any]) -> None:
        if table in tables and where != "1 = 0":
            operations.append(_Operation(table, where, params))

    user_part = ('"user_id" = :user_id', {"user_id": user_id})
    add("research_guides", *user_part)
    add("site_admins", *user_part)
    add("alert_notifications", *user_part)
    add("custom_alert_rule_states", '"rule_id" IN (SELECT "id" FROM "custom_alert_rules" WHERE "user_id" = :user_id)', {"user_id": user_id})
    add("custom_alert_rules", *user_part)
    add("note_comment_reactions", *_combine(user_part, _in_clause("comment_id", comment_ids, "comment")))
    add("note_comments", *_combine(user_part, _in_clause("note_id", note_ids, "note")))
    add("research_links", *_combine(user_part, _in_clause("note_id", note_ids, "note")))
    add("note_favorites", *_combine(user_part, _in_clause("note_id", note_ids, "note")))
    add("note_series_favorites", *user_part)
    add("notes", *user_part)
    add("note_series", *user_part)

    add("stock_memos", *_combine(user_part, _in_clause("stock_id", stock_ids, "stock")))
    add("watch_stock_research_sections", *_combine(user_part, _in_clause("stock_id", stock_ids, "stock")))
    add("investment_tools", *user_part)
    add("earnings_events", *_combine(user_part, _in_clause("stock_id", stock_ids, "stock")))
    add("quant_signal_snapshots", *_combine(user_part, _in_clause("stock_id", stock_ids, "stock")))
    add("quant_strategy_qualifications", *_combine(user_part, _in_clause("stock_id", stock_ids, "stock")))
    add("quant_strategy_settings", *user_part)
    add("watch_stocks", *user_part)

    add("asset_tags", *_in_clause("asset_id", asset_ids, "asset"))
    add("ibkr_lots", *_in_clause("asset_id", asset_ids, "asset"))
    sell_or_buy = _combine(_in_clause("sell_tx_id", tx_ids, "tx"), _in_clause("buy_tx_id", tx_ids, "buy"))
    add("sell_batch_items", *sell_or_buy)
    add("profit_allocations", *_combine(_in_clause("transaction_id", tx_ids, "tx"), _in_clause("target_asset_id", asset_ids, "target")))
    add("transactions", *_combine(_in_clause("asset_id", asset_ids, "asset"), _in_clause("source_tx_id", tx_ids, "source")))
    add("trade_plans", *_in_clause("asset_id", asset_ids, "asset"))
    add("asset_fundings", *_combine(user_part, _in_clause("asset_id", asset_ids, "asset"), _in_clause("pool_id", pool_ids, "pool")))
    add("funding_transactions", *_combine(user_part, _in_clause("funding_id", pool_ids, "funding"), _in_clause("pool_id", pool_ids, "pool"), _in_clause("related_asset_id", asset_ids, "related_asset")))
    add("funding_pools", *user_part)
    add("assets", *user_part)

    add("cash_accounts", *user_part)
    add("ibkr_cash_flows", *user_part)
    add("income_records", *user_part)
    add("salary_configs", *user_part)
    add("liabilities", *user_part)
    add("harbor_goals", *user_part)
    add("harbor", *user_part)
    add("tags", *user_part)

    add("share_likes", *_combine(user_part, _in_clause("share_id", share_ids, "share")))
    add("comments", *_combine(user_part, _in_clause("share_id", share_ids, "share")))
    add("shares", *user_part)
    if "follows" in tables:
        add("follows", *_combine(("\"follower_id\" = :user_id", {"user_id": user_id}), ("\"following_id\" = :user_id_following", {"user_id_following": user_id})))
    if "notifications" in tables:
        add("notifications", *_combine(("\"user_id\" = :user_id", {"user_id": user_id}), ("\"from_user_id\" = :user_id_from", {"user_id_from": user_id})))
    add("users", '"id" = :user_id', {"user_id": user_id})
    return operations


async def _find_user(db: AsyncSession, username: str) -> User | None:
    return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()


async def _run(db: AsyncSession, username: str, mutate: bool) -> CleanupReport:
    user = await _find_user(db, username)
    if user is None:
        return CleanupReport(username=username, user_id=None)
    tables = await _existing_tables(db)
    operations = await _operations(db, user, tables)
    if mutate and "content_audit" in tables:
        # Keep public audit history, detach a deleted account even with SQLite FK enforcement off.
        await db.execute(text('UPDATE "content_audit" SET "actor_id" = NULL WHERE "actor_id" = :user_id'), {"user_id": user.id})
    counts: dict[str, int] = {}
    for index, operation in enumerate(operations):
        params = dict(operation.params)
        params.setdefault("_cleanup_operation", index)
        result = await db.execute(
            text(f'SELECT COUNT(*) FROM "{operation.table}" WHERE {operation.where}'),
            params,
        )
        count = int(result.scalar_one())
        if count:
            counts[operation.table] = counts.get(operation.table, 0) + count
        if mutate:
            await db.execute(
                text(f'DELETE FROM "{operation.table}" WHERE {operation.where}'),
                params,
            )
    if mutate:
        await db.commit()
    return CleanupReport(username=username, user_id=int(user.id), deleted=counts)


async def preview_user_cleanup(db: AsyncSession, username: str) -> CleanupReport:
    return await _run(db, username, mutate=False)


async def clear_user_data(db: AsyncSession, username: str) -> CleanupReport:
    return await _run(db, username, mutate=True)
