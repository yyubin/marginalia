from unittest.mock import patch

import pytest

from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.models.user_llm_key import UserLLMKey
from app.models.user_settings import UserSettings


class _FakeProvider:
    def __init__(self, chunks=("안", "녕")):
        self.chunks = chunks
        self.calls = []

    async def stream_translate(self, api_key, text, target_lang, source_lang="auto"):
        self.calls.append({
            "api_key": api_key,
            "text": text,
            "target_lang": target_lang,
            "source_lang": source_lang,
        })
        for chunk in self.chunks:
            yield chunk


def _patch_provider():
    fake = _FakeProvider()
    return patch("app.services.translate_service.get_provider", return_value=fake), fake


class TestTranslate:
    async def test_streams_chunks_as_sse(self, client, db, user, auth_headers):
        db.add(
            UserLLMKey(
                user_id=user.id,
                provider="anthropic",
                encrypted_key=encrypt_secret("user-secret-key"),
                key_preview="user...key",
            )
        )
        await db.flush()

        ctx, fake = _patch_provider()
        with ctx:
            response = await client.post(
                "/api/v1/translate", json={"text": "hello", "target_lang": "ko"}, headers=auth_headers
            )
        assert response.status_code == 200
        body = response.text
        assert "event: meta" in body
        assert 'data: {"provider":' in body
        assert "event: delta" in body
        assert 'data: {"text": "안"}' in body
        assert 'data: {"text": "녕"}' in body
        assert body.strip().endswith("data: {}")
        assert fake.calls[0]["text"] == "hello"
        assert fake.calls[0]["target_lang"] == "ko"
        assert fake.calls[0]["source_lang"] == "auto"

    async def test_uses_registered_user_key_for_default_provider(self, client, db, user, auth_headers):
        db.add(
            UserLLMKey(
                user_id=user.id,
                provider="anthropic",
                encrypted_key=encrypt_secret("user-secret-key"),
                key_preview="user...key",
            )
        )
        await db.flush()

        ctx, fake = _patch_provider()
        with ctx:
            response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 200
        assert fake.calls[0]["api_key"] == "user-secret-key"

    async def test_uses_registered_non_anthropic_key_when_no_default_provider(self, client, db, user, auth_headers):
        db.add(
            UserLLMKey(
                user_id=user.id,
                provider="openai",
                encrypted_key=encrypt_secret("openai-secret-key"),
                key_preview="open...key",
            )
        )
        await db.flush()

        ctx, fake = _patch_provider()
        with ctx:
            response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 200
        assert fake.calls[0]["api_key"] == "openai-secret-key"

    async def test_uses_key_for_users_chosen_default_provider(self, client, db, user, auth_headers):
        db.add(UserSettings(user_id=user.id, default_llm_provider="openai"))
        db.add(
            UserLLMKey(
                user_id=user.id,
                provider="openai",
                encrypted_key=encrypt_secret("openai-secret-key"),
                key_preview="open...key",
            )
        )
        await db.flush()

        ctx, fake = _patch_provider()
        with ctx:
            response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 200
        assert fake.calls[0]["api_key"] == "openai-secret-key"

    async def test_returns_403_when_no_user_key_by_default(self, client, auth_headers):
        response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 403

    async def test_returns_403_when_no_key_and_fallback_explicitly_disallowed(self, client, db, user, auth_headers):
        db.add(UserSettings(user_id=user.id, llm_fallback_allowed=False))
        await db.flush()

        response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 403

    async def test_falls_back_to_server_key_when_admin_allows_it(self, client, db, user, auth_headers):
        db.add(UserSettings(user_id=user.id, llm_fallback_allowed=True))
        await db.flush()

        ctx, fake = _patch_provider()
        with ctx:
            response = await client.post("/api/v1/translate", json={"text": "hello"}, headers=auth_headers)
        assert response.status_code == 200
        assert fake.calls[0]["api_key"] == settings.ANTHROPIC_API_KEY

    async def test_unauthenticated_returns_401_or_403(self, client):
        response = await client.post("/api/v1/translate", json={"text": "hello"})
        assert response.status_code in (401, 403)
