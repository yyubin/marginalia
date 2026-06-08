import pytest

from app.models.note import Note


class TestGetNote:
    async def test_returns_none_when_no_note_exists(self, client, auth_headers, highlight):
        response = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() is None

    async def test_returns_note_when_exists(self, client, auth_headers, highlight, note):
        response = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Test note content"
        assert data["highlight_id"] == str(highlight.id)

    async def test_other_user_highlight_returns_404(self, client, other_auth_headers, highlight):
        response = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, highlight):
        response = await client.get(f"/api/v1/highlights/{highlight.id}/note")
        assert response.status_code in (401, 403)


class TestCreateNote:
    async def test_creates_note_and_returns_201(self, client, auth_headers, highlight):
        response = await client.post(
            f"/api/v1/highlights/{highlight.id}/note",
            json={"content": "My new note"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "My new note"
        assert data["highlight_id"] == str(highlight.id)

    async def test_created_note_retrievable_via_get(self, client, auth_headers, highlight):
        await client.post(
            f"/api/v1/highlights/{highlight.id}/note",
            json={"content": "Persistent note"},
            headers=auth_headers,
        )
        response = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=auth_headers,
        )
        assert response.json()["content"] == "Persistent note"

    async def test_other_user_highlight_returns_404(self, client, other_auth_headers, highlight):
        response = await client.post(
            f"/api/v1/highlights/{highlight.id}/note",
            json={"content": "Unauthorized note"},
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_duplicate_note_returns_409(self, client, auth_headers, highlight, note):
        response = await client.post(
            f"/api/v1/highlights/{highlight.id}/note",
            json={"content": "Second note"},
            headers=auth_headers,
        )
        assert response.status_code == 409


class TestUpdateNote:
    async def test_updates_content(self, client, auth_headers, note):
        response = await client.patch(
            f"/api/v1/notes/{note.id}",
            json={"content": "Updated content"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["content"] == "Updated content"

    async def test_updated_content_persists(self, client, auth_headers, highlight, note):
        await client.patch(
            f"/api/v1/notes/{note.id}",
            json={"content": "Saved change"},
            headers=auth_headers,
        )
        get_resp = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=auth_headers,
        )
        assert get_resp.json()["content"] == "Saved change"

    async def test_other_user_note_returns_404(self, client, other_auth_headers, note):
        response = await client.patch(
            f"/api/v1/notes/{note.id}",
            json={"content": "Hijacked"},
            headers=other_auth_headers,
        )
        assert response.status_code == 404


class TestDeleteNote:
    async def test_deletes_note(self, client, auth_headers, note):
        response = await client.delete(
            f"/api/v1/notes/{note.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    async def test_deleted_note_returns_none_on_get(self, client, auth_headers, highlight, note):
        await client.delete(f"/api/v1/notes/{note.id}", headers=auth_headers)

        get_resp = await client.get(
            f"/api/v1/highlights/{highlight.id}/note",
            headers=auth_headers,
        )
        assert get_resp.json() is None

    async def test_other_user_note_returns_404(self, client, other_auth_headers, note):
        response = await client.delete(
            f"/api/v1/notes/{note.id}",
            headers=other_auth_headers,
        )
        assert response.status_code == 404
