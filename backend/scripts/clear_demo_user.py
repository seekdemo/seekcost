"""Clear one explicitly named local demo account.

Usage:
    python -m scripts.clear_demo_user --username seekdemo --dry-run
    python -m scripts.clear_demo_user --username seekdemo --confirm
"""

from __future__ import annotations

import argparse
import asyncio
import json

from app.core.database import async_session
from app.core.demo_cleanup import clear_user_data, preview_user_cleanup


async def run(args: argparse.Namespace) -> None:
    async with async_session() as db:
        if args.dry_run:
            report = await preview_user_cleanup(db, args.username)
        else:
            if args.confirm != "DELETE-DEMO":
                raise SystemExit('Mutation requires --confirm DELETE-DEMO (or use --dry-run).')
            report = await clear_user_data(db, args.username)
    print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Clear one named SeekCost demo account")
    parser.add_argument("--username", required=True)
    parser.add_argument("--confirm", default="")
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
