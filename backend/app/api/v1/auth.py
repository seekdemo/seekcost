"""用户名密码认证与个人资料 API。"""
from datetime import datetime
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from pydantic import BaseModel, Field, field_validator

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import create_access_token, get_current_user, verify_password, hash_password
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["用户认证"])


class RegisterBody(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(default="", max_length=64)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        username = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{2,31}", username):
            raise ValueError("用户名须为 3–32 位字母、数字、下划线或连字符，且以字母或数字开头")
        return username

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("密码不能超过 72 个字节")
        return value

    @field_validator("nickname")
    @classmethod
    def normalize_nickname(cls, value: str) -> str:
        return value.strip()

class LoginBody(BaseModel):
    username: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    nickname: str
    theme: str = "emerald"
    default_currency: str = "CNY"
    nav_items: list[str] | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

class ProfileUpdate(BaseModel):
    nickname: str | None = None
    theme: str | None = None
    avatar_url: str | None = None
    default_currency: str | None = None
    nav_items: list[str] | None = None

class ChangePasswordBody(BaseModel):
    old_password: str = ""
    new_password: str


# ── 用户名密码注册 ─────────────────────────────────────
@router.get("/registration")
async def registration_status():
    return {"enabled": get_settings().ALLOW_REGISTRATION}


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterBody, db: AsyncSession = Depends(get_db)):
    if not get_settings().ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="此私人工作台已关闭公开注册，请联系部署者创建账户。 / Registration is disabled; contact the instance owner.")
    exists = (await db.execute(
        select(User).where(func.lower(User.username) == body.username.lower())
    )).scalars().first()
    if exists:
        raise HTTPException(status_code=409, detail="用户名已被使用")

    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        nickname=body.nickname or body.username,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id))


# ── 用户名密码登录 ─────────────────────────────────────
@router.post("/login", response_model=TokenOut)
async def login(body: LoginBody, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(func.lower(User.username) == body.username.strip().lower())
    )).scalars().first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return TokenOut(access_token=create_access_token(user.id))


# ── 当前用户信息 ───────────────────────────────────────
@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


# ── 更新个人资料 ───────────────────────────────────────
VALID_THEMES = {"light", "dark", "emerald", "blue", "violet", "rose", "amber", "cyan"}
VALID_NAV_ITEMS = {"/watchlist", "/research", "/notes", "/assets", "/dashboard", "/trade", "/import", "/finance", "/cash"}
import re
_CUSTOM_RE = re.compile(r"^custom:#[0-9a-fA-F]{6}$")

@router.patch("/profile", response_model=UserOut)
async def update_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.nickname is not None:
        user.nickname = body.nickname
    if body.theme is not None:
        if body.theme not in VALID_THEMES and not _CUSTOM_RE.match(body.theme):
            raise HTTPException(400, f"不支持的主题: {body.theme}")
        user.theme = body.theme
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url
    if body.default_currency is not None:
        if body.default_currency not in ("CNY", "USD", "HKD", "EUR", "GBP", "JPY"):
            raise HTTPException(400, f"不支持的货币: {body.default_currency}")
        user.default_currency = body.default_currency
    if body.nav_items is not None:
        normalized_nav = ["/research" if item == "/notes" else item for item in body.nav_items]
        invalid_items = set(normalized_nav) - VALID_NAV_ITEMS
        if invalid_items:
            raise HTTPException(400, f"不支持的导航项: {', '.join(sorted(invalid_items))}")
        user.nav_items = list(dict.fromkeys(normalized_nav))
    await db.commit()
    await db.refresh(user)
    return user


# ── 修改密码 ───────────────────────────────────────────
@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if len(body.new_password) < 8:
        raise HTTPException(400, "新密码至少 8 位")
    if len(body.new_password.encode("utf-8")) > 72:
        raise HTTPException(400, "新密码不能超过 72 个字节")
    if not body.old_password:
        raise HTTPException(400, "请输入当前密码")
    if not verify_password(body.old_password, user.hashed_password):
        raise HTTPException(400, "当前密码错误")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "密码修改成功"}
