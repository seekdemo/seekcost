"""个人研究库 schema。"""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
from app.models.note import NoteFormat, NoteVisibility

ResearchKind = Literal["quick", "company", "thesis", "decision", "review"]
ResearchStatus = Literal["draft", "active", "validated", "invalidated", "archived"]
ResearchEntityType = Literal["watch_stock", "asset", "trade_plan", "transaction"]


class ResearchLinkIn(BaseModel):
    entity_type: ResearchEntityType
    entity_id: int = Field(..., gt=0)


class ResearchLinkOut(ResearchLinkIn):
    id: int


class NoteBase(BaseModel):
    title: str = Field(default="未命名研究", max_length=256)
    content: str = ""
    format: NoteFormat = NoteFormat.MARKDOWN
    visibility: NoteVisibility = NoteVisibility.PRIVATE
    kind: ResearchKind = "quick"
    status: ResearchStatus = "active"
    confidence: int | None = Field(default=None, ge=1, le=5)
    next_review_at: datetime | None = None
    starred: bool = False
    cover_image_url: str | None = None
    cover_color: str | None = Field(default=None, max_length=24)
    allow_comments: bool = True
    stock_symbols: list[str] = Field(default_factory=list)
    knowledge_tags: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    series: str | None = Field(default=None, max_length=128)
    series_id: int | None = None


class NoteCreate(NoteBase):
    created_at: datetime | None = None
    links: list[ResearchLinkIn] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=256)
    content: str | None = None
    format: NoteFormat | None = None
    visibility: NoteVisibility | None = None
    kind: ResearchKind | None = None
    status: ResearchStatus | None = None
    confidence: int | None = Field(default=None, ge=1, le=5)
    next_review_at: datetime | None = None
    starred: bool | None = None
    cover_image_url: str | None = None
    cover_color: str | None = Field(default=None, max_length=24)
    allow_comments: bool | None = None
    stock_symbols: list[str] | None = None
    knowledge_tags: list[str] | None = None
    tags: list[str] | None = None
    series: str | None = Field(default=None, max_length=128)
    series_id: int | None = None
    created_at: datetime | None = None
    links: list[ResearchLinkIn] | None = None


class NoteOut(NoteBase):
    id: int
    user_id: int
    comment_count: int = 0
    created_at: datetime
    updated_at: datetime
    links: list[ResearchLinkOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class NoteAuthorOut(BaseModel):
    id: int
    nickname: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class NoteFeedOut(NoteOut):
    author: NoteAuthorOut


class NoteFavoritesOut(BaseModel):
    note_ids: list[int] = Field(default_factory=list)
    series: list[str] = Field(default_factory=list)


class NoteSeriesFavoriteIn(BaseModel):
    series: str = Field(..., min_length=1, max_length=128)


class NoteSeriesCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    visibility: NoteVisibility = NoteVisibility.PRIVATE
    starred: bool = False


class NoteSeriesUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    visibility: NoteVisibility | None = None
    starred: bool | None = None


class NoteSeriesOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str
    visibility: NoteVisibility
    starred: bool = False
    note_count: int = 0
    created_at: datetime
    updated_at: datetime
    author: NoteAuthorOut

    model_config = {"from_attributes": True}


class NoteCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1200)
    parent_id: int | None = None
    quote_text: str | None = Field(default=None, max_length=500)
    quote_prefix: str | None = Field(default=None, max_length=200)
    quote_suffix: str | None = Field(default=None, max_length=200)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)
    block_id: str | None = Field(default=None, max_length=64)


class NoteCommentReactionIn(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)


class NoteCommentReactionOut(BaseModel):
    emoji: str
    count: int
    reacted: bool = False


class NoteCommentOut(BaseModel):
    id: int
    note_id: int
    user_id: int
    parent_id: int | None = None
    reply_to_user_id: int | None = None
    reply_to_author: NoteAuthorOut | None = None
    content: str
    quote_text: str | None = None
    quote_prefix: str | None = None
    quote_suffix: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    block_id: str | None = None
    anchor_status: str = "active"
    reactions: list[NoteCommentReactionOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    author: NoteAuthorOut

    model_config = {"from_attributes": True}
