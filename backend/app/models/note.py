"""个人研究模型。"""
import enum
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class NoteFormat(str, enum.Enum):
    MARKDOWN = "markdown"
    RICH = "rich"


class NoteVisibility(str, enum.Enum):
    PRIVATE = "private"
    WORKSPACE = "workspace"
    PUBLIC = "public"


class NoteSeries(Base):
    __tablename__ = "note_series"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_note_series_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    visibility: Mapped[NoteVisibility] = mapped_column(Enum(NoteVisibility), default=NoteVisibility.PRIVATE, server_default="PRIVATE", index=True)
    starred: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(256), default="未命名研究")
    content: Mapped[str] = mapped_column(Text, default="")
    format: Mapped[NoteFormat] = mapped_column(Enum(NoteFormat), default=NoteFormat.MARKDOWN, server_default="MARKDOWN")
    visibility: Mapped[NoteVisibility] = mapped_column(Enum(NoteVisibility), default=NoteVisibility.PRIVATE, server_default="PRIVATE", index=True)
    kind: Mapped[str] = mapped_column(String(24), default="quick", server_default="quick", index=True)
    status: Mapped[str] = mapped_column(String(24), default="active", server_default="active", index=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    starred: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_color: Mapped[str | None] = mapped_column(String(24), nullable=True)
    allow_comments: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    stock_symbols: Mapped[list[str]] = mapped_column(JSON, default=list)
    knowledge_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    series: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    series_id: Mapped[int | None] = mapped_column(ForeignKey("note_series.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class ResearchLink(Base):
    """研究与投资对象的显式关联；目标归属由服务层校验。"""
    __tablename__ = "research_links"
    __table_args__ = (UniqueConstraint("note_id", "entity_type", "entity_id", name="uq_research_link_target"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String(24), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NoteComment(Base):
    __tablename__ = "note_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("note_comments.id", ondelete="CASCADE"), nullable=True, index=True)
    reply_to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_prefix: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quote_suffix: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_offset: Mapped[int | None] = mapped_column(nullable=True)
    end_offset: Mapped[int | None] = mapped_column(nullable=True)
    block_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anchor_status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    note = relationship("Note")
    user = relationship("User", foreign_keys=[user_id])
    reply_to_user = relationship("User", foreign_keys=[reply_to_user_id])


class NoteCommentReaction(Base):
    __tablename__ = "note_comment_reactions"
    __table_args__ = (UniqueConstraint("user_id", "comment_id", "emoji", name="uq_note_comment_reactions_user_comment_emoji"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    comment_id: Mapped[int] = mapped_column(ForeignKey("note_comments.id", ondelete="CASCADE"), index=True)
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NoteFavorite(Base):
    __tablename__ = "note_favorites"
    __table_args__ = (UniqueConstraint("user_id", "note_id", name="uq_note_favorites_user_note"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NoteSeriesFavorite(Base):
    __tablename__ = "note_series_favorites"
    __table_args__ = (UniqueConstraint("user_id", "series", name="uq_note_series_favorites_user_series"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    series: Mapped[str] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
