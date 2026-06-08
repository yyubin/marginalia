from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.security import create_refresh_token, hash_password
from app.models.user import User


def _mock_google_client(email: str, name: str = "Google User", picture: str = ""):
    """Returns a patch context manager that mocks httpx.AsyncClient for Google API calls."""
    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.json.return_value = {"access_token": "fake-google-access-token"}

    userinfo_resp = MagicMock()
    userinfo_resp.json.return_value = {"email": email, "name": name, "picture": picture}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_resp)
    mock_client.get = AsyncMock(return_value=userinfo_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    return patch("app.api.v1.endpoints.auth.httpx.AsyncClient", return_value=mock_client)


class TestHealth:
    async def test_returns_ok(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestSignup:
    async def test_creates_user_and_returns_tokens(self, client):
        response = await client.post("/api/v1/auth/signup", json={
            "email": "brand_new@example.com",
            "password": "password123",
            "name": "Brand New",
        })
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_duplicate_email_returns_409(self, client, user):
        response = await client.post("/api/v1/auth/signup", json={
            "email": user.email,
            "password": "password123",
        })
        assert response.status_code == 409


class TestLogin:
    async def test_valid_credentials_return_tokens(self, client, db):
        u = User(
            email="logintest@example.com",
            password_hash=hash_password("mypassword"),
            provider="email",
        )
        db.add(u)
        await db.flush()

        response = await client.post("/api/v1/auth/login", json={
            "email": "logintest@example.com",
            "password": "mypassword",
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_wrong_password_returns_401(self, client, db):
        u = User(
            email="wrongpass@example.com",
            password_hash=hash_password("correct_password"),
            provider="email",
        )
        db.add(u)
        await db.flush()

        response = await client.post("/api/v1/auth/login", json={
            "email": "wrongpass@example.com",
            "password": "wrong_password",
        })
        assert response.status_code == 401

    async def test_unknown_email_returns_401(self, client):
        response = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "password",
        })
        assert response.status_code == 401

    async def test_google_user_without_password_returns_401(self, client, user):
        # user fixture is a google provider user with no password_hash
        response = await client.post("/api/v1/auth/login", json={
            "email": user.email,
            "password": "somepassword",
        })
        assert response.status_code == 401


class TestRefresh:
    async def test_valid_refresh_token_returns_new_tokens(self, client, user):
        token = create_refresh_token(str(user.id))
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_invalid_token_returns_401(self, client):
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not.a.valid.token"})
        assert response.status_code == 401

    async def test_access_token_rejected_as_refresh(self, client, user):
        from app.core.security import create_access_token
        access_token = create_access_token(str(user.id))
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert response.status_code == 401

    async def test_refresh_token_rejected_as_bearer(self, client, user):
        token = create_refresh_token(str(user.id))
        response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    async def test_suspended_user_cannot_refresh(self, client, db, user):
        user.is_suspended = True
        await db.flush()
        token = create_refresh_token(str(user.id))
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert response.status_code == 401


class TestLogout:
    async def test_returns_204(self, client, auth_headers):
        response = await client.post("/api/v1/auth/logout", headers=auth_headers)
        assert response.status_code == 204


class TestMe:
    async def test_returns_current_user(self, client, auth_headers, user):
        response = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(user.id)
        assert data["email"] == user.email
        assert data["is_admin"] is False

    async def test_reflects_admin_flag(self, client, admin_auth_headers, admin_user):
        response = await client.get("/api/v1/auth/me", headers=admin_auth_headers)
        assert response.json()["is_admin"] is True

    async def test_unauthenticated_returns_401_or_403(self, client):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code in (401, 403)


class TestGoogleOAuth:
    async def test_google_redirect_goes_to_google(self, client):
        response = await client.get("/api/v1/auth/google", follow_redirects=False)
        assert response.status_code in (302, 307)
        location = response.headers["location"]
        assert "accounts.google.com" in location
        assert "response_type=code" in location
        assert "scope=" in location

    async def test_google_redirect_sets_state_cookie(self, client):
        response = await client.get("/api/v1/auth/google", follow_redirects=False)
        assert "oauth_state" in response.cookies

    async def test_callback_with_mismatched_state_redirects_with_error(self, client):
        response = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "some-code", "state": "attacker-state"},
            cookies={"oauth_state": "real-state"},
            follow_redirects=False,
        )
        assert response.status_code in (302, 307)
        assert "invalid_state" in response.headers["location"]

    async def test_callback_with_missing_state_cookie_redirects_with_error(self, client):
        response = await client.get(
            "/api/v1/auth/google/callback",
            params={"code": "some-code", "state": "some-state"},
            follow_redirects=False,
        )
        assert response.status_code in (302, 307)
        assert "invalid_state" in response.headers["location"]

    async def test_callback_with_google_error_param_redirects(self, client):
        response = await client.get(
            "/api/v1/auth/google/callback",
            params={"error": "access_denied", "state": "state"},
            cookies={"oauth_state": "state"},
            follow_redirects=False,
        )
        assert response.status_code in (302, 307)
        assert "oauth_cancelled" in response.headers["location"]

    async def test_callback_creates_new_user_and_redirects_with_tokens(self, client):
        state = "valid-csrf-state"
        with _mock_google_client("newuser@gmail.com", "New Google User"):
            response = await client.get(
                "/api/v1/auth/google/callback",
                params={"code": "auth-code", "state": state},
                cookies={"oauth_state": state},
                follow_redirects=False,
            )
        assert response.status_code in (302, 307)
        assert response.headers["location"].endswith("/callback")
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies

    async def test_callback_existing_google_user_returns_tokens(self, client, user):
        state = "valid-csrf-state-2"
        with _mock_google_client(user.email, user.name or "Test"):
            response = await client.get(
                "/api/v1/auth/google/callback",
                params={"code": "auth-code", "state": state},
                cookies={"oauth_state": state},
                follow_redirects=False,
            )
        assert response.status_code in (302, 307)
        assert response.headers["location"].endswith("/callback")
        assert "access_token" in response.cookies

    async def test_callback_email_registered_with_other_provider_redirects_with_error(self, client, db):
        conflict_user = User(
            email="conflict@example.com",
            provider="email",
            password_hash=hash_password("somepassword"),
        )
        db.add(conflict_user)
        await db.flush()

        state = "valid-csrf-state-3"
        with _mock_google_client("conflict@example.com"):
            response = await client.get(
                "/api/v1/auth/google/callback",
                params={"code": "auth-code", "state": state},
                cookies={"oauth_state": state},
                follow_redirects=False,
            )
        assert response.status_code in (302, 307)
        assert "email_exists" in response.headers["location"]

    async def test_callback_suspended_user_redirects_with_error(self, client, db):
        suspended = User(email="suspended@example.com", provider="google", is_suspended=True)
        db.add(suspended)
        await db.flush()

        state = "valid-csrf-state-4"
        with _mock_google_client("suspended@example.com"):
            response = await client.get(
                "/api/v1/auth/google/callback",
                params={"code": "auth-code", "state": state},
                cookies={"oauth_state": state},
                follow_redirects=False,
            )
        assert response.status_code in (302, 307)
        assert "account_suspended" in response.headers["location"]
