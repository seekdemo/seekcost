"""个人研究库 API。"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.asset import Asset
from app.models.note import Note, NoteComment, NoteCommentReaction, NoteFavorite, NoteSeries, NoteSeriesFavorite, NoteVisibility, ResearchLink
from app.models.trade_plan import TradePlan
from app.models.transaction import Transaction
from app.models.user import User
from app.models.watchlist import WatchStock
from app.schemas.note import (
    NoteAuthorOut,
    NoteCommentCreate,
    NoteCommentOut,
    NoteCommentReactionIn,
    NoteCommentReactionOut,
    NoteCreate,
    NoteFeedOut,
    NoteFavoritesOut,
    NoteOut,
    NoteSeriesFavoriteIn,
    NoteSeriesCreate,
    NoteSeriesOut,
    NoteSeriesUpdate,
    NoteUpdate,
    ResearchLinkIn,
    ResearchLinkOut,
)

router = APIRouter(prefix="/notes", tags=["研究"])
COMMENT_REACTIONS = ("👍", "❤️", "🔥", "💡", "👏")
RESEARCH_KINDS = {"quick", "company", "thesis", "decision", "review"}
RESEARCH_STATUSES = {"draft", "active", "validated", "invalidated", "archived"}
LINK_TYPES = {"watch_stock", "asset", "trade_plan", "transaction"}


def _author_out(user: User) -> NoteAuthorOut:
    return NoteAuthorOut(id=user.id, nickname=user.nickname or user.username, avatar_url=user.avatar_url)


def _feed_out(note: Note, author: User, comment_count: int) -> NoteFeedOut:
    data = NoteOut.model_validate(note).model_dump()
    data["comment_count"] = comment_count
    return NoteFeedOut(**data, author=_author_out(author))


def _series_out(series: NoteSeries, author: User, note_count: int) -> NoteSeriesOut:
    return NoteSeriesOut(
        id=series.id,
        user_id=series.user_id,
        name=series.name,
        description=series.description,
        visibility=series.visibility,
        starred=series.starred,
        note_count=note_count,
        created_at=series.created_at,
        updated_at=series.updated_at,
        author=_author_out(author),
    )


def _comment_out(
    comment: NoteComment,
    author: User,
    reply_to_author: User | None = None,
    reactions: list[NoteCommentReactionOut] | None = None,
) -> NoteCommentOut:
    return NoteCommentOut(
        id=comment.id,
        note_id=comment.note_id,
        user_id=comment.user_id,
        parent_id=comment.parent_id,
        reply_to_user_id=comment.reply_to_user_id,
        reply_to_author=_author_out(reply_to_author) if reply_to_author else None,
        content=comment.content,
        quote_text=comment.quote_text,
        quote_prefix=comment.quote_prefix,
        quote_suffix=comment.quote_suffix,
        start_offset=comment.start_offset,
        end_offset=comment.end_offset,
        block_id=comment.block_id,
        anchor_status=comment.anchor_status,
        reactions=reactions or [],
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author=_author_out(author),
    )


async def _reaction_summaries(db: AsyncSession, comment_ids: list[int], user_id: int) -> dict[int, list[NoteCommentReactionOut]]:
    if not comment_ids:
        return {}
    count_rows = (await db.execute(
        select(NoteCommentReaction.comment_id, NoteCommentReaction.emoji, func.count(NoteCommentReaction.id))
        .where(NoteCommentReaction.comment_id.in_(comment_ids))
        .group_by(NoteCommentReaction.comment_id, NoteCommentReaction.emoji)
    )).all()
    mine_rows = (await db.execute(
        select(NoteCommentReaction.comment_id, NoteCommentReaction.emoji)
        .where(NoteCommentReaction.comment_id.in_(comment_ids), NoteCommentReaction.user_id == user_id)
    )).all()
    mine = {(comment_id, emoji) for comment_id, emoji in mine_rows}
    output: dict[int, list[NoteCommentReactionOut]] = {}
    order = {emoji: index for index, emoji in enumerate(COMMENT_REACTIONS)}
    for comment_id, emoji, count in count_rows:
        output.setdefault(comment_id, []).append(NoteCommentReactionOut(emoji=emoji, count=int(count), reacted=(comment_id, emoji) in mine))
    for reactions in output.values():
        reactions.sort(key=lambda reaction: order.get(reaction.emoji, len(order)))
    return output


async def _get_visible_note(note_id: int, db: AsyncSession, user: User) -> Note:
    note = await db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, "研究不存在")
    return note


async def _get_visible_series(series_id: int, db: AsyncSession, user: User) -> NoteSeries:
    series = await db.get(NoteSeries, series_id)
    if not series or series.user_id != user.id:
        raise HTTPException(404, "研究专题不存在")
    return series


async def _links_for_notes(db: AsyncSession, note_ids: list[int], user_id: int) -> dict[int, list[ResearchLinkOut]]:
    if not note_ids:
        return {}
    rows = (await db.execute(
        select(ResearchLink).where(ResearchLink.user_id == user_id, ResearchLink.note_id.in_(note_ids))
        .order_by(ResearchLink.id)
    )).scalars().all()
    output: dict[int, list[ResearchLinkOut]] = {}
    for link in rows:
        output.setdefault(link.note_id, []).append(ResearchLinkOut(id=link.id, entity_type=link.entity_type, entity_id=link.entity_id))
    return output


def _note_out(note: Note, comment_count: int = 0, links: list[ResearchLinkOut] | None = None) -> NoteOut:
    data = NoteOut.model_validate(note).model_dump()
    data["comment_count"] = int(comment_count or 0)
    data["links"] = links or []
    return NoteOut(**data)


async def _validate_link_target(db: AsyncSession, user_id: int, link: ResearchLinkIn) -> None:
    target = None
    if link.entity_type == "watch_stock":
        target = await db.scalar(select(WatchStock.id).where(WatchStock.id == link.entity_id, WatchStock.user_id == user_id))
    elif link.entity_type == "asset":
        target = await db.scalar(select(Asset.id).where(Asset.id == link.entity_id, Asset.user_id == user_id))
    elif link.entity_type == "trade_plan":
        target = await db.scalar(
            select(TradePlan.id).join(Asset, Asset.id == TradePlan.asset_id)
            .where(TradePlan.id == link.entity_id, Asset.user_id == user_id)
        )
    elif link.entity_type == "transaction":
        target = await db.scalar(
            select(Transaction.id).join(Asset, Asset.id == Transaction.asset_id)
            .where(Transaction.id == link.entity_id, Asset.user_id == user_id)
        )
    if target is None:
        raise HTTPException(400, f"关联的 {link.entity_type} 不存在或不属于当前用户")


async def _sync_links(db: AsyncSession, note: Note, user: User, links: list[ResearchLinkIn]) -> None:
    unique = {(link.entity_type, link.entity_id): link for link in links}
    for link in unique.values():
        await _validate_link_target(db, user.id, link)
    await db.execute(delete(ResearchLink).where(ResearchLink.note_id == note.id, ResearchLink.user_id == user.id))
    for link in unique.values():
        db.add(ResearchLink(note_id=note.id, user_id=user.id, entity_type=link.entity_type, entity_id=link.entity_id))


async def _apply_series_assignment(data: dict, db: AsyncSession, user: User) -> None:
    if "series_id" in data:
        series_id = data.get("series_id")
        if series_id is None:
            data["series"] = None
            return
        series = await db.get(NoteSeries, series_id)
        if not series or series.user_id != user.id:
            raise HTTPException(400, "只能将研究加入自己的研究专题")
        data["series"] = series.name
        return
    if "series" not in data:
        return
    name = (data.get("series") or "").strip()
    if not name:
        data["series"] = None
        data["series_id"] = None
        return
    series = await db.scalar(select(NoteSeries).where(NoteSeries.user_id == user.id, NoteSeries.name == name))
    if series is None:
        series = NoteSeries(user_id=user.id, name=name, description="", visibility=NoteVisibility.PRIVATE)
        db.add(series)
        await db.flush()
    data["series"] = series.name
    data["series_id"] = series.id


@router.get("", response_model=list[NoteOut])
async def list_notes(
    kind: str | None = None,
    status: str | None = None,
    starred: bool | None = None,
    stock_id: int | None = None,
    series_id: int | None = None,
    tag: str | None = None,
    due_before: datetime | None = None,
    sort: str = Query(default="updated_at", pattern="^(updated_at|created_at|review_due)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment_counts = (
        select(NoteComment.note_id, func.count(NoteComment.id).label("comment_count"))
        .group_by(NoteComment.note_id)
        .subquery()
    )
    stmt = (
        select(Note, func.coalesce(comment_counts.c.comment_count, 0))
        .outerjoin(comment_counts, comment_counts.c.note_id == Note.id)
        .where(Note.user_id == user.id)
    )
    if kind:
        if kind not in RESEARCH_KINDS:
            raise HTTPException(400, "不支持的研究类型")
        stmt = stmt.where(Note.kind == kind)
    if status:
        if status not in RESEARCH_STATUSES:
            raise HTTPException(400, "不支持的研究状态")
        stmt = stmt.where(Note.status == status)
    if starred is not None:
        stmt = stmt.where(Note.starred == starred)
    if series_id is not None:
        stmt = stmt.where(Note.series_id == series_id)
    if tag:
        stmt = stmt.where(Note.tags.contains([tag]))
    if due_before is not None:
        stmt = stmt.where(Note.next_review_at.is_not(None), Note.next_review_at <= due_before)
    if stock_id is not None:
        stmt = stmt.join(
            ResearchLink,
            (ResearchLink.note_id == Note.id)
            & (ResearchLink.user_id == user.id)
            & (ResearchLink.entity_type == "watch_stock")
            & (ResearchLink.entity_id == stock_id),
        )
    sort_column = Note.next_review_at if sort == "review_due" else Note.created_at if sort == "created_at" else Note.updated_at
    sort_expr = sort_column.asc().nullslast() if order == "asc" else sort_column.desc().nullslast()
    stmt = stmt.order_by(sort_expr, Note.id.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()
    links_by_note = await _links_for_notes(db, [note.id for note, _ in rows], user.id)
    output: list[NoteOut] = []
    for note, comment_count in rows:
        output.append(_note_out(note, int(comment_count or 0), links_by_note.get(note.id)))
    return output


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = body.model_dump(exclude_none=True, exclude={"links"})
    links = body.links
    data["visibility"] = NoteVisibility.PRIVATE
    await _apply_series_assignment(data, db, user)
    note = Note(user_id=user.id, **data)
    db.add(note)
    await db.flush()
    await _sync_links(db, note, user, links)
    await db.commit()
    await db.refresh(note)
    saved_links = (await _links_for_notes(db, [note.id], user.id)).get(note.id, [])
    return _note_out(note, links=saved_links)


@router.get("/feed", response_model=list[NoteFeedOut])
async def list_note_feed(
    limit: int = 20,
    offset: int = 0,
    sort: str = "latest",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del limit, offset, sort, db, user
    raise HTTPException(410, "SeekCost 已收敛为个人研究系统，公开发现流已停止")


@router.get("/favorites", response_model=NoteFavoritesOut)
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note_ids = (await db.execute(select(Note.id).where(Note.user_id == user.id, Note.starred.is_(True)))).scalars().all()
    series = (await db.execute(select(NoteSeries.name).where(NoteSeries.user_id == user.id, NoteSeries.starred.is_(True)))).scalars().all()
    return NoteFavoritesOut(note_ids=list(note_ids), series=list(series))


@router.get("/visible/{note_id}", response_model=NoteFeedOut)
async def get_visible_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del note_id, db, user
    raise HTTPException(410, "跨用户研究访问已停止")


@router.get("/favorites/notes", response_model=list[NoteFeedOut])
async def list_favorite_notes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del db, user
    raise HTTPException(410, "跨用户收藏已停止，请使用研究星标")


@router.post("/favorites/{note_id}", status_code=204)
async def favorite_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_visible_note(note_id, db, user)
    note.starred = True
    await db.commit()


@router.delete("/favorites/{note_id}", status_code=204)
async def unfavorite_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_visible_note(note_id, db, user)
    note.starred = False
    await db.commit()


@router.post("/series/favorite", status_code=204)
async def favorite_series(
    body: NoteSeriesFavoriteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = body.series.strip()
    if not series:
        raise HTTPException(400, "研究专题名称不能为空")
    target = await db.scalar(select(NoteSeries).where(NoteSeries.user_id == user.id, NoteSeries.name == series))
    if not target:
        raise HTTPException(404, "研究专题不存在")
    target.starred = True
    await db.commit()


@router.delete("/series/favorite", status_code=204)
async def unfavorite_series(
    body: NoteSeriesFavoriteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = body.series.strip()
    if not series:
        raise HTTPException(400, "研究专题名称不能为空")
    target = await db.scalar(select(NoteSeries).where(NoteSeries.user_id == user.id, NoteSeries.name == series))
    if not target:
        raise HTTPException(404, "研究专题不存在")
    target.starred = False
    await db.commit()


@router.get("/series", response_model=list[NoteSeriesOut])
async def list_series(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note_counts = select(Note.series_id, func.count(Note.id).label("note_count")).group_by(Note.series_id).subquery()
    result = await db.execute(
        select(NoteSeries, func.coalesce(note_counts.c.note_count, 0))
        .outerjoin(note_counts, note_counts.c.series_id == NoteSeries.id)
        .where(NoteSeries.user_id == user.id)
        .order_by(NoteSeries.updated_at.desc(), NoteSeries.id.desc())
    )
    return [_series_out(series, user, int(note_count or 0)) for series, note_count in result.all()]


@router.post("/series", response_model=NoteSeriesOut, status_code=201)
async def create_series(
    body: NoteSeriesCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "研究专题名称不能为空")
    series = NoteSeries(user_id=user.id, name=name, description=body.description.strip(), visibility=NoteVisibility.PRIVATE, starred=body.starred)
    db.add(series)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "已有同名研究专题") from None
    await db.refresh(series)
    return _series_out(series, user, 0)


@router.get("/series/feed", response_model=list[NoteSeriesOut])
async def list_series_feed(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del limit, offset, db, user
    raise HTTPException(410, "公开研究专题已停止")


@router.get("/series/{series_id}/notes", response_model=list[NoteFeedOut])
async def list_series_notes(
    series_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = await _get_visible_series(series_id, db, user)
    comment_counts = (
        select(NoteComment.note_id, func.count(NoteComment.id).label("comment_count"))
        .group_by(NoteComment.note_id)
        .subquery()
    )
    stmt = (
        select(Note, User, func.coalesce(comment_counts.c.comment_count, 0))
        .join(User, User.id == Note.user_id)
        .outerjoin(comment_counts, comment_counts.c.note_id == Note.id)
        .where(Note.series_id == series.id, Note.user_id == user.id)
    )
    result = await db.execute(stmt.order_by(Note.created_at.desc(), Note.id.desc()))
    return [_feed_out(note, author, int(comment_count or 0)) for note, author, comment_count in result.all()]


@router.get("/series/{series_id}", response_model=NoteSeriesOut)
async def get_series(
    series_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = await _get_visible_series(series_id, db, user)
    author = await db.get(User, series.user_id)
    note_count = await db.scalar(select(func.count(Note.id)).where(Note.series_id == series.id))
    return _series_out(series, author, int(note_count or 0))


@router.patch("/series/{series_id}", response_model=NoteSeriesOut)
async def update_series(
    series_id: int,
    body: NoteSeriesUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = await db.get(NoteSeries, series_id)
    if not series or series.user_id != user.id:
        raise HTTPException(404, "研究专题不存在")
    data = body.model_dump(exclude_unset=True)
    data["visibility"] = NoteVisibility.PRIVATE
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(400, "研究专题名称不能为空")
        data["name"] = name
    if "description" in data:
        data["description"] = (data["description"] or "").strip()
    old_name = series.name
    for field, value in data.items():
        setattr(series, field, value)
    if series.name != old_name:
        await db.execute(update(Note).where(Note.series_id == series.id).values(series=series.name))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "已有同名研究专题") from None
    await db.refresh(series)
    note_count = await db.scalar(select(func.count(Note.id)).where(Note.series_id == series.id))
    return _series_out(series, user, int(note_count or 0))


@router.delete("/series/{series_id}", status_code=204)
async def delete_series(
    series_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    series = await db.get(NoteSeries, series_id)
    if not series or series.user_id != user.id:
        raise HTTPException(404, "研究专题不存在")
    await db.execute(update(Note).where(Note.series_id == series.id).values(series_id=None, series=None))
    await db.execute(delete(NoteSeriesFavorite).where(NoteSeriesFavorite.series == f"id:{series.id}"))
    await db.delete(series)
    await db.commit()


@router.get("/{note_id}/comments", response_model=list[NoteCommentOut])
async def list_note_comments(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_visible_note(note_id, db, user)
    result = await db.execute(
        select(NoteComment, User)
        .join(User, User.id == NoteComment.user_id)
        .where(NoteComment.note_id == note_id)
        .order_by(NoteComment.created_at.asc(), NoteComment.id.asc())
    )
    rows = result.all()
    reply_to_user_ids = {comment.reply_to_user_id for comment, _ in rows if comment.reply_to_user_id}
    reply_users: dict[int, User] = {}
    if reply_to_user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(reply_to_user_ids)))
        reply_users = {reply_user.id: reply_user for reply_user in users_result.scalars().all()}
    reactions = await _reaction_summaries(db, [comment.id for comment, _ in rows], user.id)
    return [_comment_out(comment, author, reply_users.get(comment.reply_to_user_id), reactions.get(comment.id)) for comment, author in rows]


@router.post("/{note_id}/comments", response_model=NoteCommentOut, status_code=201)
async def create_note_comment(
    note_id: int,
    body: NoteCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await _get_visible_note(note_id, db, user)
    if not note.allow_comments and note.user_id != user.id:
        raise HTTPException(403, "作者已关闭评论")
    parent_id = body.parent_id
    reply_to_user_id = None
    if parent_id is not None:
        parent = await db.get(NoteComment, parent_id)
        if not parent or parent.note_id != note_id:
            raise HTTPException(400, "回复的评论不存在")
        reply_to_user_id = parent.user_id
        parent_id = parent.parent_id or parent.id
    anchor = {} if parent_id is not None else {
        "quote_text": body.quote_text if body.quote_text and body.quote_text.strip() else None,
        "quote_prefix": body.quote_prefix,
        "quote_suffix": body.quote_suffix,
        "start_offset": body.start_offset,
        "end_offset": body.end_offset,
        "block_id": body.block_id,
    }
    if anchor.get("quote_text") and (body.start_offset is None or body.end_offset is None or body.end_offset <= body.start_offset):
        raise HTTPException(400, "划词评论位置无效")
    comment = NoteComment(note_id=note_id, user_id=user.id, parent_id=parent_id, reply_to_user_id=reply_to_user_id, content=body.content.strip(), **anchor)
    if not comment.content:
        raise HTTPException(400, "评论内容不能为空")
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _comment_out(comment, user)


@router.post("/comments/{comment_id}/reactions", response_model=list[NoteCommentReactionOut])
async def add_comment_reaction(
    comment_id: int,
    body: NoteCommentReactionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.emoji not in COMMENT_REACTIONS:
        raise HTTPException(400, "不支持的表情")
    comment = await db.get(NoteComment, comment_id)
    if not comment:
        raise HTTPException(404, "评论不存在")
    note = await _get_visible_note(comment.note_id, db, user)
    if not note.allow_comments and note.user_id != user.id:
        raise HTTPException(403, "作者已关闭评论")
    existing = await db.scalar(select(NoteCommentReaction.id).where(
        NoteCommentReaction.user_id == user.id,
        NoteCommentReaction.comment_id == comment_id,
        NoteCommentReaction.emoji == body.emoji,
    ))
    if existing is None:
        db.add(NoteCommentReaction(user_id=user.id, comment_id=comment_id, emoji=body.emoji))
        await db.commit()
    return (await _reaction_summaries(db, [comment_id], user.id)).get(comment_id, [])


@router.delete("/comments/{comment_id}/reactions", response_model=list[NoteCommentReactionOut])
async def remove_comment_reaction(
    comment_id: int,
    body: NoteCommentReactionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await db.get(NoteComment, comment_id)
    if not comment:
        raise HTTPException(404, "评论不存在")
    await _get_visible_note(comment.note_id, db, user)
    await db.execute(delete(NoteCommentReaction).where(
        NoteCommentReaction.user_id == user.id,
        NoteCommentReaction.comment_id == comment_id,
        NoteCommentReaction.emoji == body.emoji,
    ))
    await db.commit()
    return (await _reaction_summaries(db, [comment_id], user.id)).get(comment_id, [])


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_note_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await db.get(NoteComment, comment_id)
    if not comment:
        raise HTTPException(404, "评论不存在")
    note = await db.get(Note, comment.note_id)
    if comment.user_id != user.id and (not note or note.user_id != user.id):
        raise HTTPException(403, "无权删除该评论")
    # 根评论被删时，连同其回复与相关表情一并清除，避免留下孤儿数据
    reply_ids = list((await db.execute(
        select(NoteComment.id).where(NoteComment.parent_id == comment_id)
    )).scalars().all())
    target_ids = [comment_id, *reply_ids]
    await db.execute(delete(NoteCommentReaction).where(NoteCommentReaction.comment_id.in_(target_ids)))
    if reply_ids:
        await db.execute(delete(NoteComment).where(NoteComment.id.in_(reply_ids)))
    await db.delete(comment)
    await db.commit()


@router.get("/public/{note_id}", response_model=NoteOut)
async def get_public_note(note_id: int, db: AsyncSession = Depends(get_db)):
    del note_id, db
    raise HTTPException(410, "公开研究链接已停止")


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, "研究不存在")
    comment_count = await db.scalar(select(func.count(NoteComment.id)).where(NoteComment.note_id == note.id))
    links = (await _links_for_notes(db, [note.id], user.id)).get(note.id, [])
    return _note_out(note, int(comment_count or 0), links)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: int,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, "研究不存在")
    data = body.model_dump(exclude_unset=True, exclude={"links"})
    links = body.links if "links" in body.model_fields_set else None
    data["visibility"] = NoteVisibility.PRIVATE
    await _apply_series_assignment(data, db, user)
    for field, value in data.items():
        setattr(note, field, value)
    if links is not None:
        await _sync_links(db, note, user, links)
    await db.commit()
    await db.refresh(note)
    saved_links = (await _links_for_notes(db, [note.id], user.id)).get(note.id, [])
    comment_count = await db.scalar(select(func.count(NoteComment.id)).where(NoteComment.note_id == note.id))
    return _note_out(note, int(comment_count or 0), saved_links)


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, "研究不存在")
    await db.delete(note)
    await db.commit()
