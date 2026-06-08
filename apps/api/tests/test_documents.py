from unittest.mock import patch

import pytest

from app.models.document import Document


class TestListDocuments:
    async def test_empty_returns_empty_list(self, client, auth_headers):
        response = await client.get("/api/v1/documents", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_own_documents(self, client, auth_headers, document):
        response = await client.get("/api/v1/documents", headers=auth_headers)
        assert response.status_code == 200
        ids = [d["id"] for d in response.json()]
        assert str(document.id) in ids

    async def test_does_not_return_other_users_documents(self, client, auth_headers, other_user, db):
        other_doc = Document(user_id=other_user.id, title="Other PDF", file_key="test/other.pdf")
        db.add(other_doc)
        await db.flush()

        response = await client.get("/api/v1/documents", headers=auth_headers)
        ids = [d["id"] for d in response.json()]
        assert str(other_doc.id) not in ids

    async def test_ordered_by_created_at_desc(self, client, auth_headers, db, user):
        doc1 = Document(user_id=user.id, title="First", file_key="test/1.pdf")
        doc2 = Document(user_id=user.id, title="Second", file_key="test/2.pdf")
        db.add_all([doc1, doc2])
        await db.flush()

        response = await client.get("/api/v1/documents", headers=auth_headers)
        titles = [d["title"] for d in response.json()]
        assert titles.index("Second") < titles.index("First")

    async def test_unauthenticated_returns_403(self, client):
        response = await client.get("/api/v1/documents")
        assert response.status_code in (401, 403)


class TestUploadDocument:
    async def test_uploads_pdf_and_returns_201(self, client, auth_headers):
        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("test.pdf", b"%PDF-1.4 test content", "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "test.pdf"
        assert data["file_size"] == len(b"%PDF-1.4 test content")

    async def test_rejects_non_pdf(self, client, auth_headers):
        response = await client.post(
            "/api/v1/documents",
            files={"file": ("doc.txt", b"not a pdf", "text/plain")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_rejects_oversized_file(self, client, auth_headers):
        oversized = b"x" * (51 * 1024 * 1024)
        with patch("app.api.v1.endpoints.documents.upload_file"):
            response = await client.post(
                "/api/v1/documents",
                files={"file": ("big.pdf", oversized, "application/pdf")},
                headers=auth_headers,
            )
        assert response.status_code == 413

    async def test_appears_in_list_after_upload(self, client, auth_headers):
        with patch("app.api.v1.endpoints.documents.upload_file"):
            create_resp = await client.post(
                "/api/v1/documents",
                files={"file": ("new.pdf", b"%PDF-1.4", "application/pdf")},
                headers=auth_headers,
            )
        doc_id = create_resp.json()["id"]

        list_resp = await client.get("/api/v1/documents", headers=auth_headers)
        ids = [d["id"] for d in list_resp.json()]
        assert doc_id in ids

    async def test_unauthenticated_returns_403(self, client):
        response = await client.post(
            "/api/v1/documents",
            files={"file": ("test.pdf", b"%PDF", "application/pdf")},
        )
        assert response.status_code in (401, 403)


class TestGetDocument:
    async def test_returns_document(self, client, auth_headers, document):
        response = await client.get(f"/api/v1/documents/{document.id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(document.id)
        assert data["title"] == document.title

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(f"/api/v1/documents/{document.id}", headers=other_auth_headers)
        assert response.status_code == 404

    async def test_nonexistent_returns_404(self, client, auth_headers):
        response = await client.get(
            "/api/v1/documents/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}")
        assert response.status_code in (401, 403)


class TestDeleteDocument:
    async def test_deletes_document(self, client, auth_headers, document):
        with patch("app.api.v1.endpoints.documents.delete_file"):
            response = await client.delete(f"/api/v1/documents/{document.id}", headers=auth_headers)
        assert response.status_code == 204

    async def test_deleted_document_not_in_list(self, client, auth_headers, document):
        with patch("app.api.v1.endpoints.documents.delete_file"):
            await client.delete(f"/api/v1/documents/{document.id}", headers=auth_headers)
        list_resp = await client.get("/api/v1/documents", headers=auth_headers)
        ids = [d["id"] for d in list_resp.json()]
        assert str(document.id) not in ids

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        with patch("app.api.v1.endpoints.documents.delete_file"):
            response = await client.delete(f"/api/v1/documents/{document.id}", headers=other_auth_headers)
        assert response.status_code == 404

    async def test_nonexistent_returns_404(self, client, auth_headers):
        response = await client.delete(
            "/api/v1/documents/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestGetDocumentUrl:
    async def test_returns_presigned_url(self, client, auth_headers, document):
        with patch(
            "app.api.v1.endpoints.documents.generate_presigned_url",
            return_value="https://example.com/signed-url",
        ):
            response = await client.get(f"/api/v1/documents/{document.id}/url", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["url"] == "https://example.com/signed-url"
        assert data["expires_in"] == 3600

    async def test_updates_last_opened(self, client, auth_headers, document, db):
        assert document.last_opened is None
        with patch(
            "app.api.v1.endpoints.documents.generate_presigned_url",
            return_value="https://example.com/url",
        ):
            await client.get(f"/api/v1/documents/{document.id}/url", headers=auth_headers)
        await db.refresh(document)
        assert document.last_opened is not None

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(f"/api/v1/documents/{document.id}/url", headers=other_auth_headers)
        assert response.status_code == 404

    async def test_nonexistent_returns_404(self, client, auth_headers):
        response = await client.get(
            "/api/v1/documents/00000000-0000-0000-0000-000000000000/url",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}/url")
        assert response.status_code in (401, 403)
