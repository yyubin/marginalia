import uuid
from unittest.mock import patch

import pytest

from app.core.rate_limit import limiter


@pytest.fixture
def with_rate_limiting():
    """Enable rate limiting with a test-unique key prefix for counter isolation."""
    original_enabled = limiter.enabled
    original_prefix = limiter._key_prefix
    limiter.enabled = True
    limiter._key_prefix = f"test-{uuid.uuid4()}"
    yield
    limiter.enabled = original_enabled
    limiter._key_prefix = original_prefix


class TestLoginRateLimit:
    async def test_excessive_attempts_return_429(self, client, with_rate_limiting):
        for _ in range(10):
            await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})

        response = await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})
        assert response.status_code == 429

    async def test_429_response_is_json_with_detail(self, client, with_rate_limiting):
        for _ in range(10):
            await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})

        response = await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})
        assert response.status_code == 429
        data = response.json()
        assert "detail" in data

    async def test_within_limit_succeeds(self, client, with_rate_limiting):
        for _ in range(9):
            await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})

        response = await client.post("/api/v1/auth/login", json={"email": "x@x.com", "password": "wrong"})
        # 10th request should not be rate-limited (gets 401 from auth logic, not 429)
        assert response.status_code != 429


class TestSignupRateLimit:
    async def test_excessive_signups_return_429(self, client, with_rate_limiting):
        for i in range(5):
            await client.post(
                "/api/v1/auth/signup",
                json={"email": f"user{i}@ratelimit.com", "password": "password123", "name": f"User {i}"},
            )

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": "final@ratelimit.com", "password": "password123", "name": "Final"},
        )
        assert response.status_code == 429


class TestTranslateRateLimit:
    async def test_excessive_translate_requests_return_429(self, client, auth_headers, with_rate_limiting):
        for _ in range(10):
            await client.post(
                "/api/v1/translate",
                json={"text": "hello", "target_lang": "ko"},
                headers=auth_headers,
            )

        response = await client.post(
            "/api/v1/translate",
            json={"text": "hello", "target_lang": "ko"},
            headers=auth_headers,
        )
        assert response.status_code == 429


class TestUploadRateLimit:
    async def test_excessive_uploads_return_429(self, client, auth_headers, with_rate_limiting):
        with patch("app.api.v1.endpoints.documents.upload_file"):
            for _ in range(20):
                await client.post(
                    "/api/v1/documents",
                    files={"file": ("test.pdf", b"%PDF-1.4", "application/pdf")},
                    headers=auth_headers,
                )

        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("test.pdf", b"%PDF-1.4", "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 429


class TestLimiterConfiguration:
    def test_limiter_has_default_limit(self):
        assert limiter._default_limits

    def test_limiter_storage_is_configured(self):
        assert limiter._storage is not None
