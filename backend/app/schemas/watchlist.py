"""股票池、速记与财报日历 schema"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from app.models.watchlist import EarningsStatus, WatchStage
from app.models.watchlist_research import WatchResearchSectionKey


class MilestoneIn(BaseModel):
    id: str | None = None
    date: str = ""
    title: str = ""
    done: bool = False


class WatchStockBase(BaseModel):
    symbol: str = Field(..., max_length=32)
    name: str = ""
    stage: WatchStage = WatchStage.RADAR
    sector: str = ""
    industries: list[str] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)
    inspiration: str = ""
    entry_reason: str = ""
    business_summary: str = ""
    growth_drivers: str = ""
    fundamental_risks: str = ""
    fundamental_metrics: list[dict] = Field(default_factory=list)
    thesis: str = ""
    invalidation: str = ""
    current_price: float = 0
    price_change: float | None = None
    price_change_pct: float | None = None
    price_session: str = ""
    fair_price: float = 0
    strike_price: float = 0
    target_price: float = 0
    planned_capital: float = 0
    tranches: int = 3
    first_entry_drop: float = 0
    add_on_drop: float = 10
    notes: str = ""
    milestones: list[dict] = Field(default_factory=list)


class WatchStockCreate(WatchStockBase):
    pass


class WatchStockUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    stage: WatchStage | None = None
    sector: str | None = None
    industries: list[str] | None = None
    concepts: list[str] | None = None
    inspiration: str | None = None
    entry_reason: str | None = None
    business_summary: str | None = None
    growth_drivers: str | None = None
    fundamental_risks: str | None = None
    fundamental_metrics: list[dict] | None = None
    thesis: str | None = None
    invalidation: str | None = None
    current_price: float | None = None
    price_change: float | None = None
    price_change_pct: float | None = None
    price_session: str | None = None
    fair_price: float | None = None
    strike_price: float | None = None
    target_price: float | None = None
    planned_capital: float | None = None
    tranches: int | None = None
    first_entry_drop: float | None = None
    add_on_drop: float | None = None
    notes: str | None = None
    milestones: list[dict] | None = None


class WatchStockOut(WatchStockBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResearchEvidenceItem(BaseModel):
    label: str = ""
    value: Any = ""
    source: str | None = None
    url: str | None = None
    excerpt: str | None = None
    as_of: str | None = None


class ResearchQuestionItem(BaseModel):
    question: str
    status: Literal["open", "validated", "discarded"] = "open"
    answer: str = ""


class WatchStockResearchSectionOut(BaseModel):
    id: int
    user_id: int
    stock_id: int
    key: WatchResearchSectionKey
    summary: str
    evidence: list[ResearchEvidenceItem] = Field(default_factory=list)
    open_questions: list[ResearchQuestionItem] = Field(default_factory=list)
    reviewed_at: datetime | None = None
    next_review_at: datetime | None = None
    review_note: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WatchStockResearchSectionUpdate(BaseModel):
    summary: str | None = None
    evidence: list[ResearchEvidenceItem] | None = None
    open_questions: list[ResearchQuestionItem] | None = None
    reviewed_at: datetime | None = None
    next_review_at: datetime | None = None
    review_note: str | None = None


class WatchStockBulkImport(BaseModel):
    items: list[WatchStockCreate]


class WatchStockBulkImportOut(BaseModel):
    imported: int
    skipped: int
    items: list[WatchStockOut]


class ClassificationGroupPreview(BaseModel):
    key: str
    source_filename: str
    suggested_name: str
    row_count: int
    matched_count: int
    unmatched_count: int
    already_assigned_count: int
    sample_symbols: list[str] = Field(default_factory=list)


class ClassificationPreviewOut(BaseModel):
    session_id: str
    file_count: int
    group_count: int
    matched_stock_count: int
    unmatched_count: int
    groups: list[ClassificationGroupPreview]
    unmatched_symbols: list[str] = Field(default_factory=list)


class ClassificationApplyGroup(BaseModel):
    key: str
    label: str = Field(..., max_length=64)
    selected: bool = True


class ClassificationApplyIn(BaseModel):
    session_id: str
    groups: list[ClassificationApplyGroup] = Field(..., min_length=1, max_length=50)


class ClassificationApplyOut(BaseModel):
    updated_count: int
    assignments_added: int
    unchanged_count: int
    items: list[WatchStockOut]


class EarningsEventCreate(BaseModel):
    stock_id: int
    event_date: date
    fiscal_period: str = Field(default="", max_length=64)
    status: EarningsStatus = EarningsStatus.ESTIMATED
    note: str = ""


class EarningsEventUpdate(BaseModel):
    event_date: date | None = None
    fiscal_period: str | None = Field(default=None, max_length=64)
    status: EarningsStatus | None = None
    note: str | None = None


class EarningsEventOut(BaseModel):
    id: int
    user_id: int
    stock_id: int
    symbol: str
    name: str
    event_date: date
    fiscal_period: str
    status: EarningsStatus
    note: str
    source: str
    synced_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EarningsSyncOut(BaseModel):
    checked: int
    created: int
    updated: int
    unchanged: int
    manual_protected: int
    unavailable: int
    skipped: int
    provider_errors: list[str] = Field(default_factory=list)


class StockMemoBase(BaseModel):
    stock_id: int
    content: str
    pinned: bool = False


class StockMemoCreate(StockMemoBase):
    pass


class StockMemoUpdate(BaseModel):
    content: str | None = None
    pinned: bool | None = None
    converted_note_id: int | None = None


class StockMemoOut(StockMemoBase):
    id: int
    user_id: int
    converted_note_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WatchStockResearchProfileOut(BaseModel):
    stock_id: int
    research_sections: list[WatchStockResearchSectionOut] = Field(default_factory=list)
    stock: WatchStockOut | None = None
    memos: list[StockMemoOut] = Field(default_factory=list)
    linked_research: list[dict[str, Any]] = Field(default_factory=list)
