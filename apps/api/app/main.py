import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.rate_limit import limiter, rate_limit_handler
from app.core.security import decode_token


def _before_send(event, hint):
    from fastapi import HTTPException

    exc_info = hint.get("exc_info")
    if exc_info:
        _, value, _ = exc_info
        if isinstance(value, HTTPException) and value.status_code < 500:
            return None
    return event


if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        auto_session_tracking=False,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        before_send=_before_send,
    )

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)


@app.middleware("http")
async def _sentry_user_context(request: Request, call_next):
    if settings.SENTRY_DSN:
        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if token:
            user_id = decode_token(token)
            if user_id:
                sentry_sdk.set_user({"id": user_id})
    return await call_next(request)


# Middleware stack (last registered = outermost layer):
# CORSMiddleware → SlowAPIMiddleware → _sentry_user_context → handler
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix=settings.API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}
