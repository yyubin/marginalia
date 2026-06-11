import asyncio
import csv
import io
import re
import unicodedata
from datetime import UTC, datetime

import fitz
from sqlalchemy import Integer, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bookmark import Bookmark
from app.models.document import Document
from app.models.drawing_stroke import DrawingStroke
from app.models.highlight import Highlight
from app.models.sticky_note import StickyNote

HIGHLIGHT_COLORS: dict[str, tuple[float, float, float]] = {
    "yellow": (1.0, 0.98, 0.2),
    "green":  (0.4, 0.9, 0.3),
    "blue":   (0.3, 0.7, 1.0),
    "pink":   (1.0, 0.4, 0.7),
    "purple": (0.7, 0.3, 1.0),
}

DRAWING_COLORS: dict[str, tuple[float, float, float]] = {
    "black":  (0.0, 0.0, 0.0),
    "red":    (0.9, 0.1, 0.1),
    "orange": (1.0, 0.55, 0.0),
    "yellow": (1.0, 0.9, 0.0),
    "green":  (0.1, 0.75, 0.1),
    "blue":   (0.1, 0.4, 0.9),
    "purple": (0.6, 0.1, 0.8),
}

STICKY_ICON_COLORS: dict[str, tuple[float, float, float]] = {
    "yellow": (1.0, 0.85, 0.0),
    "green":  (0.3, 0.8, 0.3),
    "blue":   (0.3, 0.6, 0.9),
    "pink":   (1.0, 0.5, 0.7),
}


def _sanitize_filename(name: str) -> str:
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    return name[:100].strip() or "export"


def _page_number(highlight: Highlight) -> int:
    return highlight.position.get("pageNumber", 1)


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


# ── Data fetchers ─────────────────────────────────────────────────────────────

async def _fetch_annotations(db: AsyncSession, doc: Document):
    highlights_result = await db.execute(
        select(Highlight)
        .options(selectinload(Highlight.note))
        .where(Highlight.document_id == doc.id, Highlight.user_id == doc.user_id)
        .order_by(
            cast(Highlight.position["pageNumber"].astext, Integer),
            Highlight.created_at,
        )
    )
    highlights = list(highlights_result.scalars().all())

    stickies_result = await db.execute(
        select(StickyNote)
        .where(StickyNote.document_id == doc.id, StickyNote.user_id == doc.user_id)
        .order_by(StickyNote.page, StickyNote.created_at)
    )
    sticky_notes = list(stickies_result.scalars().all())

    bookmarks_result = await db.execute(
        select(Bookmark)
        .where(Bookmark.document_id == doc.id, Bookmark.user_id == doc.user_id)
        .order_by(Bookmark.page)
    )
    bookmarks = list(bookmarks_result.scalars().all())

    return highlights, sticky_notes, bookmarks


async def _fetch_drawings(db: AsyncSession, doc: Document) -> list[DrawingStroke]:
    result = await db.execute(
        select(DrawingStroke)
        .where(DrawingStroke.document_id == doc.id, DrawingStroke.user_id == doc.user_id)
        .order_by(DrawingStroke.page, DrawingStroke.created_at)
    )
    return list(result.scalars().all())


# ── Markdown export ───────────────────────────────────────────────────────────

async def export_markdown(db: AsyncSession, doc: Document) -> tuple[str, str]:
    highlights, sticky_notes, bookmarks = await _fetch_annotations(db, doc)

    lines: list[str] = [
        f"# {doc.title}",
        f"*Exported: {_today()}*",
        "",
        "---",
        "",
    ]

    if highlights:
        lines.append("## Highlights")
        lines.append("")
        by_page: dict[int, list[Highlight]] = {}
        for h in highlights:
            by_page.setdefault(_page_number(h), []).append(h)

        for page in sorted(by_page):
            lines.append(f"### Page {page}")
            lines.append("")
            for h in by_page[page]:
                text = h.content.get("text", "").strip()
                if text:
                    lines.append(f"> \"{text}\" `{h.color}`")
                    if h.note and h.note.content.strip():
                        lines.append(">")
                        lines.append(f"> 📝 {h.note.content.strip()}")
                    lines.append("")

    if bookmarks:
        lines.append("## Bookmarks")
        lines.append("")
        for b in bookmarks:
            label = f" — {b.label}" if b.label else ""
            lines.append(f"- Page {b.page}{label}")
        lines.append("")

    if sticky_notes:
        lines.append("## Sticky Notes")
        lines.append("")
        for s in sticky_notes:
            content = s.content.strip()
            if content:
                lines.append(f"- Page {s.page} `{s.color}`")
                for ln in content.splitlines():
                    lines.append(f"  {ln}")
        lines.append("")

    filename = f"{_sanitize_filename(doc.title)}_{_today()}.md"
    return "\n".join(lines), filename


# ── CSV export ────────────────────────────────────────────────────────────────

async def export_csv(db: AsyncSession, doc: Document) -> tuple[bytes, str]:
    highlights, sticky_notes, bookmarks = await _fetch_annotations(db, doc)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["type", "page", "text", "color", "note", "created_at"])

    for h in highlights:
        text = h.content.get("text", "").strip()
        note_content = h.note.content.strip() if h.note else ""
        writer.writerow(["highlight", _page_number(h), text, h.color, note_content, h.created_at.isoformat()])

    for s in sticky_notes:
        writer.writerow(["sticky_note", s.page, s.content.strip(), s.color, "", s.created_at.isoformat()])

    for b in bookmarks:
        writer.writerow(["bookmark", b.page, b.label or "", "", "", b.created_at.isoformat()])

    filename = f"{_sanitize_filename(doc.title)}_{_today()}.csv"
    # UTF-8 BOM for Excel compatibility
    return output.getvalue().encode("utf-8-sig"), filename


# ── PDF export ────────────────────────────────────────────────────────────────

async def export_pdf(db: AsyncSession, doc: Document) -> tuple[bytes, str]:
    highlights, sticky_notes, _ = await _fetch_annotations(db, doc)
    drawings = await _fetch_drawings(db, doc)

    # Extract plain data before passing to thread (SQLAlchemy objects are session-bound)
    h_data = [
        {
            "page": _page_number(h),
            "position": h.position,
            "color": h.color,
        }
        for h in highlights
    ]
    s_data = [
        {"page": s.page, "x": s.x, "y": s.y, "content": s.content, "color": s.color}
        for s in sticky_notes
    ]
    d_data = [
        {"page": d.page, "points": d.points, "color": d.color, "width": d.width, "tool": d.tool}
        for d in drawings
    ]

    result_bytes = await asyncio.to_thread(_render_pdf, doc.file_key, h_data, s_data, d_data)
    filename = f"{_sanitize_filename(doc.title)}_{_today()}_annotated.pdf"
    return result_bytes, filename


def _render_pdf(
    file_key: str,
    highlights: list[dict],
    sticky_notes: list[dict],
    drawings: list[dict],
) -> bytes:
    from app.services.r2_service import download_file

    pdf_bytes = download_file(file_key)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_num = page_idx + 1
        pw = page.rect.width
        ph = page.rect.height

        _apply_highlights(page, pw, ph, [h for h in highlights if h["page"] == page_num])
        _apply_drawings(page, pw, ph, [d for d in drawings if d["page"] == page_num])
        _apply_sticky_notes(page, pw, ph, [s for s in sticky_notes if s["page"] == page_num])

    result = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return result


def _apply_highlights(page: fitz.Page, pw: float, ph: float, highlights: list[dict]) -> None:
    for h in highlights:
        pos = h["position"]
        bounding = pos.get("boundingRect", {})
        vp_w = bounding.get("width") or pw
        vp_h = bounding.get("height") or ph
        rects_data = pos.get("rects") or [bounding]

        quads: list[fitz.Rect] = []
        for r in rects_data:
            x1 = r.get("x1", 0) / vp_w * pw
            y1 = r.get("y1", 0) / vp_h * ph
            x2 = r.get("x2", 0) / vp_w * pw
            y2 = r.get("y2", 0) / vp_h * ph
            if x2 > x1 and y2 > y1:
                quads.append(fitz.Rect(x1, y1, x2, y2))

        if not quads:
            continue

        annot = page.add_highlight_annot(quads)
        color = HIGHLIGHT_COLORS.get(h["color"], (1.0, 0.98, 0.2))
        annot.set_colors(stroke=color)
        annot.update()


def _apply_drawings(page: fitz.Page, pw: float, ph: float, drawings: list[dict]) -> None:
    for d in drawings:
        points = d["points"]
        if len(points) < 2:
            continue

        converted = [(p[0] / 100.0 * pw, p[1] / 100.0 * ph) for p in points]
        color = DRAWING_COLORS.get(d["color"], (0.0, 0.0, 0.0))
        opacity = 0.4 if d["tool"] == "highlighter" else 1.0

        shape = page.new_shape()
        shape.draw_polyline(converted)
        shape.finish(
            color=color,
            width=d["width"],
            fill=None,
            lineCap=1,
            lineJoin=1,
            stroke_opacity=opacity,
        )
        shape.commit()


def _apply_sticky_notes(page: fitz.Page, pw: float, ph: float, sticky_notes: list[dict]) -> None:
    for s in sticky_notes:
        content = s.get("content", "").strip()
        if not content:
            continue

        sx = s["x"] / 100.0 * pw
        sy = s["y"] / 100.0 * ph
        icon_color = STICKY_ICON_COLORS.get(s["color"], (1.0, 0.85, 0.0))

        # PDF text annotations (sticky notes) are the standard PDF way to embed
        # popup notes — they support Unicode natively and appear as colored icons.
        annot = page.add_text_annot(fitz.Point(sx, sy), content, icon="Note")
        annot.set_colors(stroke=icon_color)
        annot.update()
