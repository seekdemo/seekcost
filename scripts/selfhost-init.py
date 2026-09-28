#!/usr/bin/env python3
"""Generate local credentials without printing them or replacing existing files."""
import os
from pathlib import Path
import secrets


def initialize(root: Path):
    env = root / ".env"
    keydir = root / "deploy" / "secrets"
    key = keydir / "backup-password"
    if env.exists() or key.exists():
        raise SystemExit("Refusing to replace existing .env or backup key. Preserve them when upgrading.")
    template = (root / "deploy" / "selfhost.env.example").read_text()
    template = template.replace("POSTGRES_PASSWORD=\n", f"POSTGRES_PASSWORD={secrets.token_hex(32)}\n")
    template = template.replace("APP_DB_PASSWORD=\n", f"APP_DB_PASSWORD={secrets.token_hex(32)}\n")
    template = template.replace("SECRET_KEY=\n", f"SECRET_KEY={secrets.token_hex(32)}\n")
    keydir.mkdir(parents=True, exist_ok=True, mode=0o700)
    keydir.chmod(0o700)
    for path, content in ((key, secrets.token_hex(32) + "\n"), (env, template)):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
    print("Created .env and deploy/secrets/backup-password (0600). No credentials printed.")
    print("Store the backup password safely OFF this server. Without it encrypted backups cannot be restored.")


if __name__ == "__main__":
    initialize(Path(__file__).resolve().parents[1])
