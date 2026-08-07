from pathlib import Path
from urllib.parse import urlsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    lastfm_api_key: str
    lastfm_api_secret: str
    database_url: str = "postgresql+asyncpg://listfm:listfm@localhost:5432/listfm"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    cookie_secure: bool = False

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    discord_oauth_client_id: str = ""
    discord_oauth_client_secret: str = ""
    oauth_redirect_base: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("jwt_secret must be at least 32 characters")
        return v

    @model_validator(mode="after")
    def validate_cookie_secure(self) -> "Settings":
        if self.cookie_secure:
            return self
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        for url in (self.frontend_url, self.oauth_redirect_base):
            host = urlsplit(url).hostname
            if host is not None and host not in local_hosts:
                raise ValueError(
                    "cookie_secure=False is only allowed for localhost deployments. "
                    + f"Non-local host '{host}' detected; set COOKIE_SECURE=true in production."
                )
        return self

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
