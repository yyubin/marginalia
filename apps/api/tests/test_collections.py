import pytest

from app.models.collection import Collection, CollectionItem
from app.models.document import Document
from app.models.highlight import Highlight


POSITION = {"pageNumber": 1, "boundingRect": {}, "rects": []}


class TestGetCollection:
    async def test_creates_empty_collection_on_first_access(self, client, auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/collection",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["document_id"] == str(document.id)
        assert data["items"] == []

    async def test_second_get_returns_same_collection(self, client, auth_headers, document):
        r1 = await client.get(f"/api/v1/documents/{document.id}/collection", headers=auth_headers)
        r2 = await client.get(f"/api/v1/documents/{document.id}/collection", headers=auth_headers)
        assert r1.json()["id"] == r2.json()["id"]

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/collection",
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}/collection")
        assert response.status_code in (401, 403)


class TestAddCollectionItem:
    async def test_adds_highlight_to_collection(self, client, auth_headers, document, highlight):
        response = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["highlight_id"] == str(highlight.id)

    async def test_items_have_sequential_positions(self, client, auth_headers, document, db, user):
        h1 = Highlight(
            document_id=document.id, user_id=user.id,
            position={**POSITION, "pageNumber": 1}, content={"text": "first"}, color="yellow",
        )
        h2 = Highlight(
            document_id=document.id, user_id=user.id,
            position={**POSITION, "pageNumber": 2}, content={"text": "second"}, color="green",
        )
        db.add_all([h1, h2])
        await db.flush()

        await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(h1.id)},
            headers=auth_headers,
        )
        r2 = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(h2.id)},
            headers=auth_headers,
        )
        items = r2.json()["items"]
        positions = [item["position"] for item in items]
        assert positions == sorted(positions)
        assert positions[1] > positions[0]

    async def test_duplicate_highlight_returns_409(self, client, auth_headers, document, highlight):
        await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        response = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        assert response.status_code == 409

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document, highlight):
        response = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=other_auth_headers,
        )
        assert response.status_code == 404


class TestRemoveCollectionItem:
    async def test_removes_item_from_collection(self, client, auth_headers, document, highlight):
        add_resp = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        item_id = add_resp.json()["items"][0]["id"]

        del_resp = await client.delete(
            f"/api/v1/collection/items/{item_id}",
            headers=auth_headers,
        )
        assert del_resp.status_code == 204

    async def test_removed_item_not_in_collection(self, client, auth_headers, document, highlight):
        add_resp = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        item_id = add_resp.json()["items"][0]["id"]
        await client.delete(f"/api/v1/collection/items/{item_id}", headers=auth_headers)

        collection = await client.get(
            f"/api/v1/documents/{document.id}/collection",
            headers=auth_headers,
        )
        ids = [item["id"] for item in collection.json()["items"]]
        assert item_id not in ids

    async def test_other_user_item_returns_404(self, client, other_auth_headers, document, highlight, auth_headers):
        add_resp = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(highlight.id)},
            headers=auth_headers,
        )
        item_id = add_resp.json()["items"][0]["id"]

        del_resp = await client.delete(
            f"/api/v1/collection/items/{item_id}",
            headers=other_auth_headers,
        )
        assert del_resp.status_code == 404


class TestReorderCollectionItems:
    async def test_reorders_items(self, client, auth_headers, document, db, user):
        h1 = Highlight(
            document_id=document.id, user_id=user.id,
            position={**POSITION, "pageNumber": 1}, content={"text": "A"}, color="yellow",
        )
        h2 = Highlight(
            document_id=document.id, user_id=user.id,
            position={**POSITION, "pageNumber": 2}, content={"text": "B"}, color="blue",
        )
        db.add_all([h1, h2])
        await db.flush()

        r1 = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(h1.id)}, headers=auth_headers,
        )
        r2 = await client.post(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"highlight_id": str(h2.id)}, headers=auth_headers,
        )
        items = r2.json()["items"]
        item1_id = next(i["id"] for i in items if i["highlight_id"] == str(h1.id))
        item2_id = next(i["id"] for i in items if i["highlight_id"] == str(h2.id))

        # Swap positions
        reorder_resp = await client.patch(
            f"/api/v1/documents/{document.id}/collection/items",
            json={"items": [
                {"id": item1_id, "position": 2},
                {"id": item2_id, "position": 1},
            ]},
            headers=auth_headers,
        )
        assert reorder_resp.status_code == 200
        reordered = {i["id"]: i["position"] for i in reorder_resp.json()["items"]}
        assert reordered[item1_id] == 2
        assert reordered[item2_id] == 1
