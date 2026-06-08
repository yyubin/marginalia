from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "Marginalia API"
    DEBUG: bool = False
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_EXPIRE_DAYS: int = 30

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "marginalia-docs"
    R2_PUBLIC_URL: str = ""

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    FRONTEND_URL: str = "http://localhost:3000"

    # Public web origin used to build shareable links (e.g. https://app.example.com)
    WEB_BASE_URL: str = "http://localhost:3000"

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # LLM BYOK (bring-your-own-key)
    LLM_KEY_ENCRYPTION_SECRET: str = ""
    DEFAULT_LLM_FALLBACK_ALLOWED: bool = False

    # Upload limits
    MAX_DOCUMENTS_PER_USER: int = 3
    MAX_FILE_SIZE_MB: int = 50

    # Redis (rate limiting + email tokens)
    REDIS_URL: str = ""  # empty = in-memory fallback; "rediss://..." for Upstash

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True

    # Email (Resend)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Marginalia <onboarding@resend.dev>"

    # Cookie settings
    COOKIE_SECURE: bool = False       # True in production (HTTPS only)
    COOKIE_SAMESITE: str = "lax"      # "none" when API and frontend are on different domains
    COOKIE_DOMAIN: str = ""           # e.g. ".example.com" for subdomain sharing

    # Password policy
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_LETTER: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True

    # Monitoring (GlitchTip / Sentry)
    SENTRY_DSN: str = ""
    ENVIRONMENT: str = "development"
    SENTRY_TRACES_SAMPLE_RATE: float = 0.01

    # LLM translation
    TRANSLATE_TIMEOUT_SECONDS: int = 30


settings = Settings()
