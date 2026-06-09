import asyncio
import uuid

import fitz  # PyMuPDF

from app.core.database import AsyncSessionLocal
from app.models.document import Document
from app.services.r2_service import upload_file_async


def _render_first_page(pdf_bytes: bytes) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(1.0, 1.0), alpha=False)
    return pix.tobytes("jpeg", jpg_quality=85)


async def generate_and_upload_thumbnail(
    doc_id: uuid.UUID,
    user_id: uuid.UUID,
    pdf_bytes: bytes,
) -> None:
    try:
        # fitz rendering is CPU-bound — run off the event loop
        img_bytes = await asyncio.to_thread(_render_first_page, pdf_bytes)
    except Exception:
        return

    thumb_key = f"{user_id}/{doc_id}_thumb.jpg"
    try:
        await upload_file_async(img_bytes, thumb_key, content_type="image/jpeg")
    except Exception:
        return

    # BackgroundTask runs after the request context closes, so open a fresh session
    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, doc_id)
        if doc:
            doc.thumbnail_key = thumb_key
            await db.commit()
