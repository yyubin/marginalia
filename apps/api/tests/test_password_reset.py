import pytest

from app.core.security import hash_password, verify_password
from app.models.user import User


class TestForgotPassword:
    async def test_valid_email_stores_reset_token(self, client, db, mock_redis_store):
        u = User(
            email="forgot@test.com",
            provider="email",
            password_hash=hash_password("oldpassword1"),
            is_verified=True,
        )
        db.add(u)
        await db.flush()

        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "forgot@test.com"},
        )
        assert response.status_code == 204
        tokens = [k for k in mock_redis_store if k.startswith("password_reset:")]
        assert len(tokens) == 1

    async def test_unknown_email_returns_204_silently(self, client):
        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody@test.com"},
        )
        assert response.status_code == 204

    async def test_google_user_email_returns_204_without_token(self, client, user, mock_redis_store):
        # Google users don't have passwords — no reset token should be issued
        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": user.email},
        )
        assert response.status_code == 204
        tokens = [k for k in mock_redis_store if k.startswith("password_reset:")]
        assert len(tokens) == 0


class TestResetPassword:
    async def test_valid_token_changes_password(self, client, db, mock_redis_store):
        u = User(
            email="reset@test.com",
            provider="email",
            password_hash=hash_password("oldpassword1"),
            is_verified=True,
        )
        db.add(u)
        await db.flush()

        token = "valid-reset-token"
        mock_redis_store[f"password_reset:{token}"] = str(u.id)

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "newpassword9"},
        )
        assert response.status_code == 200

        await db.refresh(u)
        assert verify_password("newpassword9", u.password_hash)

    async def test_valid_token_is_deleted_after_use(self, client, db, user, mock_redis_store):
        token = "single-use-token"
        mock_redis_store[f"password_reset:{token}"] = str(user.id)

        await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "newpassword9"},
        )
        assert f"password_reset:{token}" not in mock_redis_store

    async def test_invalid_token_returns_400(self, client):
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "bad-token", "new_password": "newpassword9"},
        )
        assert response.status_code == 400

    async def test_expired_token_returns_400(self, client, mock_redis_store):
        # Token not in store simulates expiry
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "expired-token", "new_password": "newpassword9"},
        )
        assert response.status_code == 400

    async def test_weak_password_rejected(self, client, db, user, mock_redis_store):
        token = "weak-pass-token"
        mock_redis_store[f"password_reset:{token}"] = str(user.id)

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "weak"},
        )
        assert response.status_code == 422

    async def test_old_password_no_longer_works_after_reset(self, client, db, mock_redis_store):
        u = User(
            email="oldpass@test.com",
            provider="email",
            password_hash=hash_password("oldpassword1"),
            is_verified=True,
        )
        db.add(u)
        await db.flush()

        token = "change-pass-token"
        mock_redis_store[f"password_reset:{token}"] = str(u.id)

        await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "newpassword9"},
        )

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "oldpass@test.com", "password": "oldpassword1"},
        )
        assert login_resp.status_code == 401

    async def test_new_password_works_after_reset(self, client, db, mock_redis_store):
        u = User(
            email="newpass@test.com",
            provider="email",
            password_hash=hash_password("oldpassword1"),
            is_verified=True,
        )
        db.add(u)
        await db.flush()

        token = "new-pass-token"
        mock_redis_store[f"password_reset:{token}"] = str(u.id)

        await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "newpassword9"},
        )

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "newpass@test.com", "password": "newpassword9"},
        )
        assert login_resp.status_code == 200
