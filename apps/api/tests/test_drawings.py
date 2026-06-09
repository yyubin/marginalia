import pytest

from app.models.drawing_stroke import DrawingStroke

POINTS = [[10.0, 20.0, 0.5], [12.0, 22.0, 0.6], [15.0, 25.0, 0.7]]


@pytest.fixture
async def stroke(db, user, document):
    s = DrawingStroke(
        document_id=document.id,
        user_id=user.id,
        page=1,
        points=POINTS,
        color="black",
        width=2.0,
        tool="pen",
    )
    db.add(s)
    await db.flush()
    return s


class TestListDrawings:
    async def test_empty_document_returns_empty_list(self, client, auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_existing_strokes(self, client, auth_headers, document, stroke):
        response = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(stroke.id)
        assert data[0]["color"] == "black"
        assert data[0]["page"] == 1
        assert data[0]["points"] == POINTS

    async def test_page_filter(self, client, auth_headers, document, db, user):
        s1 = DrawingStroke(
            document_id=document.id, user_id=user.id, page=1,
            points=[[1.0, 1.0]], color="black", width=2.0,
        )
        s5 = DrawingStroke(
            document_id=document.id, user_id=user.id, page=5,
            points=[[2.0, 2.0]], color="red", width=3.0,
        )
        db.add_all([s1, s5])
        await db.flush()

        response = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            params={"page": 5},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["page"] == 5

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_unauthenticated_returns_401_or_403(self, client, document):
        response = await client.get(f"/api/v1/documents/{document.id}/drawings")
        assert response.status_code in (401, 403)


class TestCreateDrawing:
    async def test_creates_and_returns_stroke(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 2, "points": POINTS, "color": "red", "width": 3.0},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["color"] == "red"
        assert data["page"] == 2
        assert data["width"] == 3.0
        assert data["points"] == POINTS
        assert data["document_id"] == str(document.id)

    async def test_default_color_width_and_tool(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["color"] == "black"
        assert data["width"] == 2.0
        assert data["tool"] == "pen"

    async def test_creates_highlighter(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS, "tool": "highlighter", "color": "yellow", "width": 12.0},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["tool"] == "highlighter"
        assert data["color"] == "yellow"
        assert data["width"] == 12.0

    async def test_accepts_new_colors(self, client, auth_headers, document):
        for color in ("orange", "purple"):
            response = await client.post(
                f"/api/v1/documents/{document.id}/drawings",
                json={"page": 1, "points": POINTS, "color": color},
                headers=auth_headers,
            )
            assert response.status_code == 201, f"Expected 201 for color={color}"
            assert response.json()["color"] == color

    async def test_invalid_tool_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS, "tool": "marker"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_invalid_color_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS, "color": "rainbow"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_empty_points_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_out_of_range_point_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": [[150.0, 50.0]]},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_invalid_pressure_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": [[10.0, 10.0, 2.0]]},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_width_out_of_range_returns_422(self, client, auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS, "width": 100.0},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_too_many_points_returns_422(self, client, auth_headers, document):
        many = [[float(i % 100), float(i % 100)] for i in range(1001)]
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": many},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 1, "points": POINTS},
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_created_stroke_appears_in_list(self, client, auth_headers, document):
        create_resp = await client.post(
            f"/api/v1/documents/{document.id}/drawings",
            json={"page": 3, "points": POINTS, "color": "blue"},
            headers=auth_headers,
        )
        stroke_id = create_resp.json()["id"]

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        ids = [s["id"] for s in list_resp.json()]
        assert stroke_id in ids


class TestDeleteDrawing:
    async def test_deletes_stroke(self, client, auth_headers, stroke):
        response = await client.delete(
            f"/api/v1/drawings/{stroke.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    async def test_deleted_stroke_not_in_list(self, client, auth_headers, document, stroke):
        await client.delete(f"/api/v1/drawings/{stroke.id}", headers=auth_headers)

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        ids = [s["id"] for s in list_resp.json()]
        assert str(stroke.id) not in ids

    async def test_other_user_stroke_returns_404(self, client, other_auth_headers, stroke):
        response = await client.delete(
            f"/api/v1/drawings/{stroke.id}",
            headers=other_auth_headers,
        )
        assert response.status_code == 404


class TestClearDrawings:
    async def test_clears_all_pages(self, client, auth_headers, document, db, user):
        for page in (1, 2, 3):
            db.add(DrawingStroke(
                document_id=document.id, user_id=user.id, page=page,
                points=[[10.0, 10.0]], color="black", width=2.0,
            ))
        await db.flush()

        response = await client.delete(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        assert response.status_code == 204

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        assert list_resp.json() == []

    async def test_clears_single_page(self, client, auth_headers, document, db, user):
        for page in (1, 2, 3):
            db.add(DrawingStroke(
                document_id=document.id, user_id=user.id, page=page,
                points=[[10.0, 10.0]], color="black", width=2.0,
            ))
        await db.flush()

        response = await client.delete(
            f"/api/v1/documents/{document.id}/drawings",
            params={"page": 2},
            headers=auth_headers,
        )
        assert response.status_code == 204

        list_resp = await client.get(
            f"/api/v1/documents/{document.id}/drawings",
            headers=auth_headers,
        )
        remaining_pages = sorted(s["page"] for s in list_resp.json())
        assert remaining_pages == [1, 3]

    async def test_other_user_document_returns_404(self, client, other_auth_headers, document):
        response = await client.delete(
            f"/api/v1/documents/{document.id}/drawings",
            headers=other_auth_headers,
        )
        assert response.status_code == 404
