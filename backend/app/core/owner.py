"""Trusted terminal provisioning; no default credentials or first-visitor admin."""
import argparse
import asyncio
import getpass
import sys

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.v1.auth import RegisterBody
from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User
from app.models.site_content import SiteAdmin, ContentAudit


async def create_owner(username: str, password: str):
    body = RegisterBody(username=username, password=password)
    async with async_session() as db:
        if await db.scalar(select(User.id).where(func.lower(User.username) == body.username.lower())):
            raise ValueError("Account already exists; this command never changes existing accounts.")
        user = User(username=body.username, nickname=body.username, hashed_password=hash_password(body.password))
        db.add(user)
        try:
            await db.flush()
            db.add(SiteAdmin(user_id=user.id))
            db.add(ContentAudit(actor_id=None, action="grant", key=f"user:{user.id}", locale="", version=0))
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ValueError("Account already exists; no changes made.") from None


def main():
    parser = argparse.ArgumentParser(description="Create a private account with public-content administration rights.")
    parser.add_argument("username")
    args = parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit("Use an interactive terminal; passwords must not be passed through arguments or pipes.")
    password = getpass.getpass("New password (8–72 bytes): ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match. No account was created.")
    try:
        asyncio.run(create_owner(args.username, password))
    except ValueError:
        # Validation errors may include input values: never print them with passwords.
        raise SystemExit("Account not created. Check username/password rules and whether the username already exists.") from None
    print("Account created. Sign in using your chosen credentials. No access to other users' investments was granted.")


if __name__ == "__main__":
    main()
