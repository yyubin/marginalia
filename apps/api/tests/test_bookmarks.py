import pytest

from app.models.bookmark import Bookmark


class TestListBookmarks:
    async def test_empty_document_returns_empty_list(self, client, auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_existing_bookmarks(self, client, auth_headers, document, bookmark):
        response = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(bookmark.id)
        assert data[0]["page"] == bookmark.page
        assert data[0]["label"] == bookmark.label

    async def test_results_ordered_by_page(self, client, auth_headers, document, db, user):
        b10 = Bookmark(document_id=document.id, user_id=user.id, page=10)
        b3 = Bookmark(document_id=document.id, user_id=user.id, page=3)
        b7 = Bookmark(document_id=document.id, user_id=user.id, page=7)
        db.add_all([b10, b3, b7])
        await db.flush()

        response = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=auth_headers,
        )
        pages = [b["page"] for b in response.json()]
        assert pages == sorted(pages)

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}/bookmarks")
        assert response.status_code in (401, 403)


class TestCreateBookmark:
    async def test_creates_bookmark_with_label(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": 3, "label": "Introduction"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["page"] == 3
        assert data["label"] == "Introduction"
        assert data["document_id"] == str(document.id)

    async def test_creates_bookmark_without_label(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": 7},
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.json()["label"] is None

    async def test_duplicate_page_returns_409(self, client, auth_headers, document, bookmark):
        response = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": bookmark.page},
            headers=auth_headers,
        )
        assert response.status_code == 409

    async def test_same_page_different_users_is_allowed(self, client, auth_headers, other_auth_headers, document, db, user, other_user):
        # Create other_user's document
        from app.models.document import Document
        other_doc = Document(
            user_id=other_user.id, title="Other PDF",
            file_key="test/other.pdf", page_count=5,
        )
        db.add(other_doc)
        await db.flush()

        # Both users bookmark page 1 on their own documents
        r1 = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": 1},
            headers=auth_headers,
        )
        r2 = await client.post(
            f"/api/v1/documents/{other_doc.id}/bookmarks",
            json={"page": 1},
            headers=other_auth_headers,
        )
        assert r1.status_code == 201
        assert r2.status_code == 201

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": 1},
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_created_bookmark_appears_in_list(self, client, auth_headers, document):
        create_resp = await client.post(
            f"/api/v1/documents/{document.id}/bookmarks",
            json={"page": 99},
            headers=auth_headers,
        )
        bookmark_id = create_resp.json()["id"]

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=auth_headers,
        )
        ids = [b["id"] for b in list_resp.json()]
        assert bookmark_id in ids


class TestUpdateBookmark:
    async def test_updates_label(self, client, auth_headers, bookmark):
        response = await client.patch(
            f"/api/v1/bookmarks/{bookmark.id}",
            json={"label": "Updated Label"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["label"] == "Updated Label"

    async def test_clears_label_with_null(self, client, auth_headers, bookmark):
        response = await client.patch(
            f"/api/v1/bookmarks/{bookmark.id}",
            json={"label": None},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["label"] is None

    async def test_page_is_not_changed(self, client, auth_headers, bookmark):
        response = await client.patch(
            f"/api/v1/bookmarks/{bookmark.id}",
            json={"label": "New Label"},
            headers=auth_headers,
        )
        assert response.json()["page"] == bookmark.page

    async def test_other_user_bookmark_returns_404(self, client, other_auth_headers, bookmark):
        response = await client.patch(
            f"/api/v1/bookmarks/{bookmark.id}",
            json={"label": "Hijacked"},
            headers=other_auth_headers,
        )
        assert response.status_code == 404


class TestDeleteBookmark:
    async def test_deletes_bookmark(self, client, auth_headers, bookmark):
        response = await client.delete(
            f"/api/v1/bookmarks/{bookmark.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    async def test_deleted_bookmark_not_in_list(self, client, auth_headers, document, bookmark):
        await client.delete(f"/api/v1/bookmarks/{bookmark.id}", headers=auth_headers)

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/bookmarks",
            headers=auth_headers,
        )
        ids = [b["id"] for b in list_resp.json()]
        assert str(bookmark.id) not in ids

    async def test_other_user_bookmark_returns_404(self, client, other_auth_headers, bookmark):
        response = await client.delete(
            f"/api/v1/bookmarks/{bookmark.id}",
            headers=other_auth_headers,
        )
        assert response.status_code == 404
