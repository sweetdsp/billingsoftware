"""Application settings loaded from environment variables / ``.env``.

Every variable listed in the PRP "ENVIRONMENT VARIABLES" section is declared here.
Import the cached instance with ``from app.config import settings``.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

# Development-only placeholder. Refused when ENVIRONMENT=production.
DEV_SECRET_KEY = "dev-insecure-secret-key-change-me"  # noqa: S105 - dev placeholder, rejected in prod
MIN_PROD_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    """Typed application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # the shared .env also holds VITE_* and docker-only keys
    )

    # App
    APP_NAME: str = "Bill Maker"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    LOG_LEVEL: str = "INFO"
    APP_BASE_URL: str = "http://localhost:5173"
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/bill_maker"

    # Auth
    SECRET_KEY: SecretStr = SecretStr(DEV_SECRET_KEY)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, gt=0)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, gt=0)

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: SecretStr = SecretStr("")
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Resend
    RESEND_API_KEY: SecretStr = SecretStr("")
    RESEND_FROM_EMAIL: str = "billing@example.com"

    # Dodo Payments
    DODO_PAYMENTS_API_KEY: SecretStr = SecretStr("")
    DODO_PAYMENTS_WEBHOOK_SECRET: SecretStr = SecretStr("")
    DODO_PAYMENTS_ENVIRONMENT: Literal["test_mode", "live_mode"] = "test_mode"

    # Storage
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    UPLOAD_DIR: str = "./uploads"
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: SecretStr = SecretStr("")
    MAX_UPLOAD_MB: int = Field(default=5, gt=0)

    # Scheduler
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_CRON_HOUR: int = Field(default=6, ge=0, le=23)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        """Accept a comma-separated string (``a,b``) as well as a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _pin_postgres_driver(cls, value: str) -> str:
        """Pin the psycopg2 driver for bare ``postgresql://`` / ``postgres://`` URLs.

        SQLAlchemy 2.1 defaults the ``postgresql`` dialect to psycopg (v3); this
        project ships ``psycopg2-binary``, so make the driver explicit.
        """
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg2://" + value[len(prefix) :]
        return value

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        """Refuse insecure or incomplete configuration in production."""
        if self.ENVIRONMENT != "production":
            if self.SECRET_KEY.get_secret_value() == DEV_SECRET_KEY:
                logger.warning("Using the development SECRET_KEY; never do this in production.")
            return self
        secret = self.SECRET_KEY.get_secret_value()
        if secret == DEV_SECRET_KEY or len(secret) < MIN_PROD_SECRET_KEY_LENGTH:
            raise ValueError(
                "SECRET_KEY must be set to a random value of at least "
                f"{MIN_PROD_SECRET_KEY_LENGTH} characters when ENVIRONMENT=production"
            )
        if self.STORAGE_BACKEND == "s3" and not self.S3_BUCKET:
            raise ValueError("S3_BUCKET is required when STORAGE_BACKEND=s3")
        return self

    @property
    def is_production(self) -> bool:
        """True when running with ENVIRONMENT=production."""
        return self.ENVIRONMENT == "production"

    @property
    def max_upload_bytes(self) -> int:
        """Maximum upload size in bytes."""
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached settings instance."""
    return Settings()


settings = get_settings()
