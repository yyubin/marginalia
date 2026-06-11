import csv
import io
import re
import unicodedata
from datetime import UTC, datetime

from sqlalchemy import Integer, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bookmark import Bookmark
from app.models.document import Document
from app.models.highlight import Highlight
from app.models.sticky_note import StickyNote


def _sanitize_filename(name: str) -> str:
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    return name[:100].strip() or "export"


def _page_number(highlight: Highlight) -> int:
    return highlight.position.get("pageNumber", 1)


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


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
    return output.getvalue().encode("utf-8-sig"), filename
