from unittest.mock import patch

import pytest

from app.models.user_settings import UserSettings


class TestGetSettings:
    async def test_creates_default_settings_on_first_access(self, client, auth_headers):
        response = await client.get("/api/v1/settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["highlights_per_page"] == 50
        assert data["max_documents"] == 3
        assert data["max_file_size_mb"] == 50

    async def test_second_get_returns_same_settings(self, client, auth_headers):
        r1 = await client.get("/api/v1/settings", headers=auth_headers)
        r2 = await client.get("/api/v1/settings", headers=auth_headers)
        assert r1.json() == r2.json()

    async def test_unauthenticated_returns_403(self, client):
        response = await client.get("/api/v1/settings")
        assert response.status_code in (401, 403)

    async def test_override_values_are_exposed(self, client, auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, max_documents=10, max_file_size_mb=200))
        await db.flush()

        response = await client.get("/api/v1/settings", headers=auth_headers)
        data = response.json()
        assert data["max_documents"] == 10
        assert data["max_file_size_mb"] == 200


class TestUpdateSettings:
    async def test_updates_highlights_per_page(self, client, auth_headers):
        response = await client.patch(
            "/api/v1/settings",
            json={"highlights_per_page": 100},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["highlights_per_page"] == 100

    async def test_update_persists(self, client, auth_headers):
        await client.patch("/api/v1/settings", json={"highlights_per_page": 200}, headers=auth_headers)
        get_resp = await client.get("/api/v1/settings", headers=auth_headers)
        assert get_resp.json()["highlights_per_page"] == 200

    async def test_below_minimum_returns_422(self, client, auth_headers):
        response = await client.patch(
            "/api/v1/settings",
            json={"highlights_per_page": 5},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_above_maximum_returns_422(self, client, auth_headers):
        response = await client.patch(
            "/api/v1/settings",
            json={"highlights_per_page": 1000},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_cannot_override_upload_limits_via_update(self, client, auth_headers):
        response = await client.patch(
            "/api/v1/settings",
            json={"highlights_per_page": 80, "max_documents": 999, "max_file_size_mb": 999},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["max_documents"] == 3
        assert data["max_file_size_mb"] == 50


class TestUploadLimitOverrides:
    async def test_default_document_limit_blocks_at_global_max(self, client, auth_headers, document):
        with patch("app.api.v1.endpoints.documents.upload_file"):
            for _ in range(2):
                resp = await client.post(
                    "/api/v1/documents",
                    files={"file": ("test.pdf", b"%PDF-1.4 minimal", "application/pdf")},
                    headers=auth_headers,
                )
                assert resp.status_code == 201

            blocked = await client.post(
                "/api/v1/documents",
                files={"file": ("test.pdf", b"%PDF-1.4 minimal", "application/pdf")},
                headers=auth_headers,
            )
            assert blocked.status_code == 403
            assert "3개" in blocked.json()["detail"]

    async def test_override_raises_document_limit(self, client, auth_headers, db, user, document):
        db.add(UserSettings(user_id=user.id, max_documents=5))
        await db.flush()

        with patch("app.api.v1.endpoints.documents.upload_file"):
            for _ in range(3):
                resp = await client.post(
                    "/api/v1/documents",
                    files={"file": ("test.pdf", b"%PDF-1.4 minimal", "application/pdf")},
                    headers=auth_headers,
                )
                assert resp.status_code == 201

    async def test_override_lowers_document_limit(self, client, auth_headers, db, user, document):
        db.add(UserSettings(user_id=user.id, max_documents=1))
        await db.flush()

        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("test.pdf", b"%PDF-1.4 minimal", "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 403
        assert "1개" in response.json()["detail"]

    async def test_override_lowers_file_size_limit(self, client, auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, max_file_size_mb=1))
        await db.flush()

        oversized = b"x" * (2 * 1024 * 1024)
        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("big.pdf", oversized, "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 413
        assert "1MB" in response.json()["detail"]

    async def test_override_raises_file_size_limit_beyond_global_default(self, client, auth_headers, db, user):
        db.add(UserSettings(user_id=user.id, max_file_size_mb=10))
        await db.flush()

        bigger_than_patched_global_default = b"x" * (2 * 1024 * 1024)
        with patch("app.api.v1.endpoints.documents.settings.MAX_FILE_SIZE_MB", 1), \
                patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("ok.pdf", bigger_than_patched_global_default, "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 201
