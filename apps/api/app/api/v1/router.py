from fastapi import APIRouter

from app.api.v1.endpoints import auth, collections, documents, highlights, notes, settings, translate

router = APIRouter()
router.include_router(auth.router)
router.include_router(documents.router)
router.include_router(highlights.router)
router.include_router(notes.router)
router.include_router(collections.router)
router.include_router(translate.router)
router.include_router(settings.router)
