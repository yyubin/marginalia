from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import create_access_token
from app.main import app
from app.models.bookmark import Bookmark
from app.models.document import Document
from app.models.highlight import Highlight
from app.models.note import Note
from app.models.user import User


@pytest.fixture(autouse=True)
def disable_rate_limiting():
    original = limiter._enabled
    limiter._enabled = False
    yield
    limiter._enabled = original


@pytest.fixture(autouse=True)
def mock_redis_store():
    """In-memory Redis mock. Tests that inspect stored tokens can request this fixture."""
    store: dict[str, str] = {}

    async def fake_set(key: str, value: str, ttl_seconds: int) -> None:
        store[key] = value

    async def fake_get(key: str) -> str | None:
        return store.get(key)

    async def fake_delete(key: str) -> None:
        store.pop(key, None)

    async def fake_exists(key: str) -> bool:
        return key in store

    async def fake_send_email(*args, **kwargs) -> None:
        pass

    with (
        patch("app.api.v1.endpoints.auth.redis_set", new=fake_set),
        patch("app.api.v1.endpoints.auth.redis_get", new=fake_get),
        patch("app.api.v1.endpoints.auth.redis_delete", new=fake_delete),
        patch("app.api.v1.endpoints.auth.redis_exists", new=fake_exists),
        patch("app.core.email.send_email", new=fake_send_email),
    ):
        yield store


@pytest.fixture
async def db():
    """Each test runs inside a transaction that is rolled back on teardown."""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(
            conn,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        yield session
        await session.close()
        await conn.rollback()
    await engine.dispose()


@pytest.fixture
async def client(db):
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def user(db):
    u = User(email="testuser@example.com", name="Test User", provider="google", is_verified=True)
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def auth_headers(user):
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def other_user(db):
    u = User(email="otheruser@example.com", name="Other User", provider="google", is_verified=True)
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def other_auth_headers(other_user):
    token = create_access_token(str(other_user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def admin_user(db):
    u = User(email="admin@example.com", name="Admin User", provider="google", is_admin=True, is_verified=True)
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def admin_auth_headers(admin_user):
    token = create_access_token(str(admin_user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def document(db, user):
    doc = Document(
        user_id=user.id,
        title="Test PDF",
        file_key="test/sample.pdf",
        page_count=10,
    )
    db.add(doc)
    await db.flush()
    return doc


@pytest.fixture
async def highlight(db, user, document):
    h = Highlight(
        document_id=document.id,
        user_id=user.id,
        position={"pageNumber": 1, "boundingRect": {}, "rects": []},
        content={"text": "test highlight text"},
        color="yellow",
    )
    db.add(h)
    await db.flush()
    return h


@pytest.fixture
async def note(db, user, highlight, document):
    n = Note(
        highlight_id=highlight.id,
        document_id=document.id,
        user_id=user.id,
        content="Test note content",
    )
    db.add(n)
    await db.flush()
    return n


@pytest.fixture
async def bookmark(db, user, document):
    b = Bookmark(
        document_id=document.id,
        user_id=user.id,
        page=5,
        label="Test bookmark",
    )
    db.add(b)
    await db.flush()
    return b
