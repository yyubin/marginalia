import pytest

from app.models.highlight import Highlight

POSITION = {"pageNumber": 1, "boundingRect": {}, "rects": []}
CONTENT = {"text": "selected text"}


class TestListHighlights:
    async def test_empty_document_returns_empty_list(self, client, auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_existing_highlights(self, client, auth_headers, document, highlight):
        response = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(highlight.id)
        assert data[0]["color"] == "yellow"

    async def test_page_filter_excludes_earlier_pages(self, client, auth_headers, document, db, user):
        h1 = Highlight(
            document_id=document.id, user_id=user.id,
            position={"pageNumber": 1, "boundingRect": {}, "rects": []},
            content={"text": "page 1"}, color="yellow",
        )
        h5 = Highlight(
            document_id=document.id, user_id=user.id,
            position={"pageNumber": 5, "boundingRect": {}, "rects": []},
            content={"text": "page 5"}, color="green",
        )
        db.add_all([h1, h5])
        await db.flush()

        response = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            params={"pdf_page_from": 5},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["position"]["pageNumber"] == 5

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}/highlights")
        assert response.status_code in (401, 403)


class TestCreateHighlight:
    async def test_creates_and_returns_highlight(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/highlights",
            json={"position": POSITION, "content": CONTENT, "color": "blue"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["color"] == "blue"
        assert data["content"]["text"] == "selected text"
        assert data["document_id"] == str(document.id)

    async def test_default_color_is_yellow(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/highlights",
            json={"position": POSITION, "content": CONTENT},
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.json()["color"] == "yellow"

    async def test_invalid_color_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/highlights",
            json={"position": POSITION, "content": CONTENT, "color": "magenta"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/highlights",
            json={"position": POSITION, "content": CONTENT},
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_created_highlight_appears_in_list(self, client, auth_headers, document):
        create_resp = await client.post(
            f"/api/v1/documents/{document.id}/highlights",
            json={"position": POSITION, "content": CONTENT, "color": "pink"},
            headers=auth_headers,
        )
        highlight_id = create_resp.json()["id"]

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            headers=auth_headers,
        )
        ids = [h["id"] for h in list_resp.json()]
        assert highlight_id in ids


class TestUpdateHighlightColor:
    async def test_updates_color(self, client, auth_headers, highlight):
        response = await client.patch(
            f"/api/v1/highlights/{highlight.id}",
            json={"color": "green"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["color"] == "green"

    async def test_all_valid_colors_accepted(self, client, auth_headers, highlight):
        for color in ("yellow", "green", "blue", "pink", "purple"):
            response = await client.patch(
                f"/api/v1/highlights/{highlight.id}",
                json={"color": color},
                headers=auth_headers,
            )
            assert response.status_code == 200, f"Expected 200 for color={color}"

    async def test_invalid_color_returns_422(self, client, auth_headers, highlight):
        response = await client.patch(
            f"/api/v1/highlights/{highlight.id}",
            json={"color": "rainbow"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_other_user_highlight_returns_404(self, client, other_auth_headers, highlight):
        response = await client.patch(
            f"/api/v1/highlights/{highlight.id}",
            json={"color": "blue"},
            headers=other_auth_headers,
        )
        assert response.status_code == 404


class TestDeleteHighlight:
    async def test_deletes_highlight(self, client, auth_headers, highlight):
        response = await client.delete(
            f"/api/v1/highlights/{highlight.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    async def test_deleted_highlight_not_in_list(self, client, auth_headers, document, highlight):
        await client.delete(f"/api/v1/highlights/{highlight.id}", headers=auth_headers)

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/highlights",
            headers=auth_headers,
        )
        ids = [h["id"] for h in list_resp.json()]
        assert str(highlight.id) not in ids

    async def test_other_user_highlight_returns_404(self, client, other_auth_headers, highlight):
        response = await client.delete(
            f"/api/v1/highlights/{highlight.id}",
            headers=other_auth_headers,
        )
        assert response.status_code == 404
