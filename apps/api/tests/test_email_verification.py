from app.models.user import User


class TestSignupSendsVerificationEmail:
    async def test_signup_stores_verification_token_in_redis(self, client, mock_redis_store):
        await client.post("/api/v1/auth/signup", json={
            "email": "newuser@verify.com",
            "password": "password123",
            "name": "New User",
        })
        tokens = [k for k in mock_redis_store if k.startswith("email_verify:")]
        assert len(tokens) == 1

    async def test_signup_user_starts_unverified(self, client, db):
        await client.post("/api/v1/auth/signup", json={
            "email": "unverified@test.com",
            "password": "password123",
            "name": "Unverified",
        })
        from app.services.user_service import get_user_by_email
        user = await get_user_by_email(db, "unverified@test.com")
        assert user is not None
        assert user.is_verified is False

    async def test_signup_still_returns_tokens(self, client):
        response = await client.post("/api/v1/auth/signup", json={
            "email": "tokenstest@test.com",
            "password": "password123",
        })
        assert response.status_code == 201
        assert "access_token" in response.json()


class TestVerifyEmail:
    async def test_valid_token_sets_user_verified(self, client, db, user, mock_redis_store):
        user.is_verified = False
        await db.flush()

        token = "valid-token-abc"
        mock_redis_store[f"email_verify:{token}"] = str(user.id)

        response = await client.get(f"/api/v1/auth/verify-email?token={token}", follow_redirects=False)
        assert response.status_code in (302, 307)
        assert "verified=true" in response.headers["location"]

        await db.refresh(user)
        assert user.is_verified is True

    async def test_valid_token_deletes_redis_key(self, client, db, user, mock_redis_store):
        user.is_verified = False
        await db.flush()

        token = "one-time-token"
        mock_redis_store[f"email_verify:{token}"] = str(user.id)

        await client.get(f"/api/v1/auth/verify-email?token={token}", follow_redirects=False)

        assert f"email_verify:{token}" not in mock_redis_store

    async def test_invalid_token_redirects_with_error(self, client):
        response = await client.get("/api/v1/auth/verify-email?token=bogus", follow_redirects=False)
        assert response.status_code in (302, 307)
        assert "invalid_token" in response.headers["location"]

    async def test_expired_token_not_in_redis_redirects_with_error(self, client, mock_redis_store):
        # Token is not in store (simulates TTL expiry)
        response = await client.get(
            "/api/v1/auth/verify-email?token=expired-token", follow_redirects=False
        )
        assert response.status_code in (302, 307)
        assert "invalid_token" in response.headers["location"]


class TestResendVerification:
    async def test_resend_stores_new_token(self, client, db, mock_redis_store):
        u = User(email="resend@test.com", provider="email", is_verified=False)
        db.add(u)
        await db.flush()

        response = await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": "resend@test.com"},
        )
        assert response.status_code == 204
        tokens = [k for k in mock_redis_store if k.startswith("email_verify:")]
        assert len(tokens) == 1

    async def test_resend_sets_cooldown_key(self, client, db, mock_redis_store):
        u = User(email="cooldown@test.com", provider="email", is_verified=False)
        db.add(u)
        await db.flush()

        await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": "cooldown@test.com"},
        )
        assert f"email_resend_cooldown:{u.id}" in mock_redis_store

    async def test_resend_during_cooldown_returns_429(self, client, db, mock_redis_store):
        u = User(email="oncooldown@test.com", provider="email", is_verified=False)
        db.add(u)
        await db.flush()

        mock_redis_store[f"email_resend_cooldown:{u.id}"] = "1"

        response = await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": "oncooldown@test.com"},
        )
        assert response.status_code == 429

    async def test_resend_for_unknown_email_returns_204_silently(self, client):
        response = await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": "nobody@test.com"},
        )
        assert response.status_code == 204

    async def test_resend_for_already_verified_returns_204_silently(self, client, user):
        # user fixture is already verified
        response = await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": user.email},
        )
        assert response.status_code == 204

    async def test_resend_for_google_user_returns_204_silently(self, client, user):
        response = await client.post(
            "/api/v1/auth/resend-verification",
            json={"email": user.email},
        )
        assert response.status_code == 204


class TestVerifiedUserGating:
    async def test_unverified_user_cannot_upload(self, client, db):
        from unittest.mock import patch

        u = User(email="unverified@gate.com", provider="email", is_verified=False)
        db.add(u)
        await db.flush()

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(str(u.id))}"}

        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("test.pdf", b"%PDF-1.4", "application/pdf")},
                headers=headers,
            )
        assert response.status_code == 403

    async def test_unverified_user_cannot_translate(self, client, db):
        u = User(email="unverified@translate.com", provider="email", is_verified=False)
        db.add(u)
        await db.flush()

        from app.core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(str(u.id))}"}

        response = await client.post(
            "/api/v1/translate",
            json={"text": "hello", "target_lang": "ko"},
            headers=headers,
        )
        assert response.status_code == 403
