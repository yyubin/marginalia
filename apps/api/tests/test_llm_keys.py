from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.user_llm_key import UserLLMKey


_PROVIDER_CLASS_NAMES = {
    "anthropic": "AnthropicProvider",
    "openai": "OpenAIProvider",
    "google": "GoogleProvider",
}


def _mock_validation(provider: str, is_valid: bool):
    return patch(
        f"app.services.llm_providers.{_PROVIDER_CLASS_NAMES[provider]}.validate_key",
        new=AsyncMock(return_value=is_valid),
    )


class TestUpsertLLMKey:
    async def test_registers_valid_key_encrypted_and_masked(self, client, auth_headers, db, user):
        with _mock_validation("anthropic", True):
            response = await client.put(
                "/api/v1/settings/llm-keys/anthropic",
                json={"api_key": "sk-ant-1234567890"},
                headers=auth_headers,
            )
        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "anthropic"
        assert "1234567890" not in data["key_preview"]

        row = await db.scalar(
            select(UserLLMKey).where(UserLLMKey.user_id == user.id, UserLLMKey.provider == "anthropic")
        )
        assert row is not None
        assert row.encrypted_key != "sk-ant-1234567890"
        assert decrypt_secret(row.encrypted_key) == "sk-ant-1234567890"

    async def test_invalid_key_returns_422_and_is_not_stored(self, client, auth_headers, db, user):
        with _mock_validation("anthropic", False):
            response = await client.put(
                "/api/v1/settings/llm-keys/anthropic",
                json={"api_key": "bad-key"},
                headers=auth_headers,
            )
        assert response.status_code == 422

        row = await db.scalar(select(UserLLMKey).where(UserLLMKey.user_id == user.id))
        assert row is None

    async def test_unsupported_provider_returns_400(self, client, auth_headers):
        response = await client.put(
            "/api/v1/settings/llm-keys/cohere",
            json={"api_key": "whatever"},
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_replacing_key_updates_existing_row(self, client, auth_headers, db, user):
        with _mock_validation("anthropic", True):
            await client.put(
                "/api/v1/settings/llm-keys/anthropic",
                json={"api_key": "first-key-value"},
                headers=auth_headers,
            )
            response = await client.put(
                "/api/v1/settings/llm-keys/anthropic",
                json={"api_key": "second-key-value"},
                headers=auth_headers,
            )
        assert response.status_code == 200

        rows = (await db.execute(select(UserLLMKey).where(UserLLMKey.user_id == user.id))).scalars().all()
        assert len(rows) == 1
        assert decrypt_secret(rows[0].encrypted_key) == "second-key-value"

    async def test_unauthenticated_returns_401_or_403(self, client):
        response = await client.put("/api/v1/settings/llm-keys/anthropic", json={"api_key": "x"})
        assert response.status_code in (401, 403)


class TestDeleteLLMKey:
    async def test_deletes_registered_key(self, client, auth_headers, db, user):
        db.add(UserLLMKey(user_id=user.id, provider="anthropic", encrypted_key="enc", key_preview="prev"))
        await db.flush()

        response = await client.delete("/api/v1/settings/llm-keys/anthropic", headers=auth_headers)
        assert response.status_code == 204

        row = await db.scalar(
            select(UserLLMKey).where(UserLLMKey.user_id == user.id, UserLLMKey.provider == "anthropic")
        )
        assert row is None

    async def test_returns_404_when_not_registered(self, client, auth_headers):
        response = await client.delete("/api/v1/settings/llm-keys/anthropic", headers=auth_headers)
        assert response.status_code == 404

    async def test_unsupported_provider_returns_400(self, client, auth_headers):
        response = await client.delete("/api/v1/settings/llm-keys/cohere", headers=auth_headers)
        assert response.status_code == 400


class TestDefaultLLMProvider:
    async def test_sets_default_provider(self, client, auth_headers):
        response = await client.put(
            "/api/v1/settings/llm-provider", json={"provider": "openai"}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["default_llm_provider"] == "openai"

    async def test_clears_with_null(self, client, auth_headers):
        await client.put("/api/v1/settings/llm-provider", json={"provider": "openai"}, headers=auth_headers)

        response = await client.put(
            "/api/v1/settings/llm-provider", json={"provider": None}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["default_llm_provider"] is None

    async def test_unsupported_provider_returns_400(self, client, auth_headers):
        response = await client.put(
            "/api/v1/settings/llm-provider", json={"provider": "cohere"}, headers=auth_headers
        )
        assert response.status_code == 400


class TestSettingsResponseIncludesLLMInfo:
    async def test_includes_llm_fields_with_defaults(self, client, auth_headers):
        response = await client.get("/api/v1/settings", headers=auth_headers)
        data = response.json()
        assert data["default_llm_provider"] is None
        assert data["llm_fallback_allowed"] == settings.DEFAULT_LLM_FALLBACK_ALLOWED
        assert data["llm_keys"] == []

    async def test_lists_registered_keys_masked_only(self, client, auth_headers, db, user):
        db.add(UserLLMKey(user_id=user.id, provider="openai", encrypted_key="super-secret-cipher", key_preview="sk-p...abcd"))
        await db.flush()

        response = await client.get("/api/v1/settings", headers=auth_headers)
        keys = response.json()["llm_keys"]
        assert len(keys) == 1
        assert keys[0]["provider"] == "openai"
        assert keys[0]["key_preview"] == "sk-p...abcd"
        assert "encrypted_key" not in keys[0]
        assert "super-secret-cipher" not in response.text
