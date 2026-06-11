from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    bookmarks,
    collections,
    documents,
    drawings,
    export,
    highlights,
    notes,
    search,
    settings,
    share,
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
router.include_router(drawings.router)
router.include_router(share.router)
router.include_router(export.router)
