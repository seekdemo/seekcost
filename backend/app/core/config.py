from pydantic import model_validator
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-only-change-me"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/seekcost"
    SQL_ECHO: bool = False
    ALLOW_REGISTRATION: bool = True
    SQLITE_BACKUP_DIR: str = ""
    SQLITE_BACKUP_INTERVAL_SECONDS: int = Field(default=3600, ge=60)

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.APP_ENV.lower() == "production":
            if self.SECRET_KEY in {"dev-only-change-me", "replace-with-a-random-string-at-least-32-characters"} or len(self.SECRET_KEY) < 32:
                raise ValueError("生产环境必须配置至少 32 位的 SECRET_KEY")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
