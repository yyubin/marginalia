import uuid
from enum import Enum
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.user import User
from app.services import export_service

router = APIRouter(tags=["export"])


class ExportFormat(str, Enum):
    markdown = "markdown"
    csv = "csv"


_CONTENT_TYPES = {
    ExportFormat.markdown: "text/markdown; charset=utf-8",
    ExportFormat.csv: "text/csv; charset=utf-8",
}


@router.get("/documents/{doc_id}/export")
async def export_document(
    doc_id: uuid.UUID,
    format: ExportFormat = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        if format == ExportFormat.markdown:
            content_str, filename = await export_service.export_markdown(db, doc)
            body = content_str.encode("utf-8")
        else:
            body, filename = await export_service.export_csv(db, doc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export 처리 중 오류가 발생했습니다",
        ) from exc

    encoded = quote(filename, safe="")
    return Response(
        content=body,
        media_type=_CONTENT_TYPES[format],
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
