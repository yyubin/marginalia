from unittest.mock import patch

import pytest

from app.core.config import settings
from app.models.document import Document
from app.models.user import User
from app.models.user_llm_key import UserLLMKey
from app.models.user_settings import UserSettings


class TestPermissions:
    async def test_non_admin_gets_403(self, client, auth_headers):
        response = await client.get("/api/v1/admin/users", headers=auth_headers)
        assert response.status_code == 403

    async def test_unauthenticated_gets_401_or_403(self, client):
        response = await client.get("/api/v1/admin/users")
        assert response.status_code in (401, 403)

    async def test_admin_can_access(self, client, admin_auth_headers):
        response = await client.get("/api/v1/admin/users", headers=admin_auth_headers)
        assert response.status_code == 200

    async def test_suspended_user_blocked_everywhere(self, client, admin_auth_headers, auth_headers, user):
        await client.post(f"/api/v1/admin/users/{user.id}/suspend", headers=admin_auth_headers)

        response = await client.get("/api/v1/documents", headers=auth_headers)
        assert response.status_code == 403


class TestListUsers:
    async def test_returns_paginated_list(self, client, admin_auth_headers, user, other_user):
        response = await client.get("/api/v1/admin/users", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 2
        emails = [item["email"] for item in data["items"]]
        assert user.email in emails
        assert other_user.email in emails

    async def test_includes_document_count(self, client, admin_auth_headers, user, document):
        response = await client.get("/api/v1/admin/users", headers=admin_auth_headers)
        items = {item["email"]: item for item in response.json()["items"]}
        assert items[user.email]["document_count"] == 1

    async def test_search_by_email(self, client, admin_auth_headers, user, other_user):
        response = await client.get(
            "/api/v1/admin/users", params={"q": "otheruser"}, headers=admin_auth_headers
        )
        emails = [item["email"] for item in response.json()["items"]]
        assert other_user.email in emails
        assert user.email not in emails

    async def test_page_size_limits_results(self, client, admin_auth_headers, user, other_user, admin_user):
        response = await client.get(
            "/api/v1/admin/users", params={"page": 1, "page_size": 1}, headers=admin_auth_headers
        )
        data = response.json()
        assert len(data["items"]) == 1
        assert data["page_size"] == 1


class TestGetUserDetail:
    async def test_returns_user_detail(self, client, admin_auth_headers, user, document):
        response = await client.get(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == user.email
        assert len(data["documents"]) == 1
        assert data["documents"][0]["id"] == str(document.id)
        assert data["max_documents"] == 3
        assert data["max_file_size_mb"] == 50
        assert data["llm_fallback_allowed"] == settings.DEFAULT_LLM_FALLBACK_ALLOWED
        assert data["llm_providers_configured"] == []

    async def test_reflects_registered_llm_providers(self, client, admin_auth_headers, db, user):
        db.add(UserLLMKey(user_id=user.id, provider="openai", encrypted_key="enc", key_preview="prev"))
        await db.flush()

        response = await client.get(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        assert response.json()["llm_providers_configured"] == ["openai"]

    async def test_reflects_override_limits(self, client, admin_auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, max_documents=10, max_file_size_mb=200))
        await db.flush()

        response = await client.get(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        data = response.json()
        assert data["max_documents"] == 10
        assert data["max_file_size_mb"] == 200

    async def test_nonexistent_user_returns_404(self, client, admin_auth_headers):
        response = await client.get(
            "/api/v1/admin/users/00000000-0000-0000-0000-000000000000", headers=admin_auth_headers
        )
        assert response.status_code == 404


class TestUpdateUserLimits:
    async def test_sets_override(self, client, admin_auth_headers, user):
        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/limits",
            json={"max_documents": 7, "max_file_size_mb": 150},
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["max_documents"] == 7
        assert data["max_file_size_mb"] == 150

    async def test_clears_override_with_null(self, client, admin_auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, max_documents=7, max_file_size_mb=150))
        await db.flush()

        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/limits",
            json={"max_documents": None, "max_file_size_mb": None},
            headers=admin_auth_headers,
        )
        data = response.json()
        assert data["max_documents"] == 3
        assert data["max_file_size_mb"] == 50

    async def test_creates_settings_row_if_missing(self, client, admin_auth_headers, user):
        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/limits",
            json={"max_documents": 5, "max_file_size_mb": 100},
            headers=admin_auth_headers,
        )
        assert response.status_code == 200

        get_resp = await client.get(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        assert get_resp.json()["max_documents"] == 5

    async def test_out_of_range_returns_422(self, client, admin_auth_headers, user):
        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/limits",
            json={"max_documents": 0, "max_file_size_mb": 50},
            headers=admin_auth_headers,
        )
        assert response.status_code == 422

    async def test_nonexistent_user_returns_404(self, client, admin_auth_headers):
        response = await client.patch(
            "/api/v1/admin/users/00000000-0000-0000-0000-000000000000/limits",
            json={"max_documents": 5, "max_file_size_mb": 100},
            headers=admin_auth_headers,
        )
        assert response.status_code == 404


class TestUpdateLLMFallback:
    async def test_sets_override_to_false(self, client, admin_auth_headers, user):
        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/llm-fallback",
            json={"llm_fallback_allowed": False},
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["llm_fallback_allowed"] is False

    async def test_sets_override_to_true(self, client, admin_auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, llm_fallback_allowed=False))
        await db.flush()

        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/llm-fallback",
            json={"llm_fallback_allowed": True},
            headers=admin_auth_headers,
        )
        assert response.json()["llm_fallback_allowed"] is True

    async def test_clears_override_with_null(self, client, admin_auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, llm_fallback_allowed=False))
        await db.flush()

        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/llm-fallback",
            json={"llm_fallback_allowed": None},
            headers=admin_auth_headers,
        )
        assert response.json()["llm_fallback_allowed"] == settings.DEFAULT_LLM_FALLBACK_ALLOWED

    async def test_creates_settings_row_if_missing(self, client, admin_auth_headers, user):
        response = await client.patch(
            f"/api/v1/admin/users/{user.id}/llm-fallback",
            json={"llm_fallback_allowed": False},
            headers=admin_auth_headers,
        )
        assert response.status_code == 200

        get_resp = await client.get(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        assert get_resp.json()["llm_fallback_allowed"] is False

    async def test_nonexistent_user_returns_404(self, client, admin_auth_headers):
        response = await client.patch(
            "/api/v1/admin/users/00000000-0000-0000-0000-000000000000/llm-fallback",
            json={"llm_fallback_allowed": False},
            headers=admin_auth_headers,
        )
        assert response.status_code == 404


class TestSuspendUser:
    async def test_suspends_user(self, client, admin_auth_headers, user):
        response = await client.post(f"/api/v1/admin/users/{user.id}/suspend", headers=admin_auth_headers)
        assert response.status_code == 200
        assert response.json()["is_suspended"] is True

    async def test_unsuspends_user(self, client, admin_auth_headers, user):
        await client.post(f"/api/v1/admin/users/{user.id}/suspend", headers=admin_auth_headers)
        response = await client.post(f"/api/v1/admin/users/{user.id}/unsuspend", headers=admin_auth_headers)
        assert response.status_code == 200
        assert response.json()["is_suspended"] is False

    async def test_cannot_suspend_self(self, client, admin_auth_headers, admin_user):
        response = await client.post(
            f"/api/v1/admin/users/{admin_user.id}/suspend", headers=admin_auth_headers
        )
        assert response.status_code == 400

    async def test_suspended_user_loses_api_access(self, client, admin_auth_headers, auth_headers, user):
        await client.post(f"/api/v1/admin/users/{user.id}/suspend", headers=admin_auth_headers)
        response = await client.get("/api/v1/documents", headers=auth_headers)
        assert response.status_code == 403


class TestDeleteUser:
    async def test_deletes_user_and_cascades_documents(self, client, admin_auth_headers, db, user, document):
        document_id = document.id
        with patch("app.api.v1.endpoints.admin.delete_file"):
            response = await client.delete(f"/api/v1/admin/users/{user.id}", headers=admin_auth_headers)
        assert response.status_code == 204

        remaining_user = await db.get(User, user.id)
        assert remaining_user is None
        remaining_doc = await db.get(Document, document_id)
        assert remaining_doc is None

    async def test_cannot_delete_self(self, client, admin_auth_headers, admin_user):
        response = await client.delete(f"/api/v1/admin/users/{admin_user.id}", headers=admin_auth_headers)
        assert response.status_code == 400

    async def test_nonexistent_user_returns_404(self, client, admin_auth_headers):
        response = await client.delete(
            "/api/v1/admin/users/00000000-0000-0000-0000-000000000000", headers=admin_auth_headers
        )
        assert response.status_code == 404


class TestStats:
    async def test_returns_aggregate_counts(self, client, admin_auth_headers, user, other_user, document):
        response = await client.get("/api/v1/admin/stats", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] >= 2
        assert data["total_documents"] >= 1
        assert data["total_storage_bytes"] >= 0
        assert "signups_last_7_days" in data
        assert "new_documents_last_7_days" in data
