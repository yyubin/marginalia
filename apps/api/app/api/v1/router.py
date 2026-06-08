from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    bookmarks,
    collections,
    documents,
    highlights,
    notes,
    search,
    settings,
    sticky_notes,
    translate,
)

router = APIRouter()
router.include_router(auth.router)
router.include_router(admin.router)
router.include_router(documents.router)
router.include_router(highlights.router)
router.include_router(notes.router)
router.include_router(collections.router)
router.include_router(translate.router)
router.include_router(settings.router)
router.include_router(bookmarks.router)
router.include_router(search.router)
router.include_router(sticky_notes.router)
