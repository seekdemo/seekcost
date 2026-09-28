"""Explicit operator-only provisioning: python -m app.core.site_admin grant USERNAME."""
import argparse
import asyncio
from sqlalchemy import select, func
from app.core.database import async_session
from app.models.user import User
from app.models.site_content import SiteAdmin, ContentAudit


async def provision(action, username):
    async with async_session() as db:
        user = await db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
        if user is None:
            raise SystemExit("User not found. Create the intended account through registration first.")
        existing = await db.get(SiteAdmin, user.id)
        if action == "grant" and existing is None:
            db.add(SiteAdmin(user_id=user.id))
        elif action == "revoke" and existing is not None:
            await db.delete(existing)
        else:
            print("No permission change needed.")
            return
        db.add(ContentAudit(actor_id=None, action=action, key=f"user:{user.id}", locale="", version=0))
        await db.commit()
        print(f"{action}: {user.username} (id={user.id}). No private investment access is granted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage public-content administrators using trusted server access.")
    parser.add_argument("action", choices=["grant", "revoke"])
    parser.add_argument("username")
    args = parser.parse_args()
    asyncio.run(provision(args.action, args.username))
