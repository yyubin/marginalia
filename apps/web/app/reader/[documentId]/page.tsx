"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import axios from "axios";
import type { NewHighlight } from "react-pdf-highlighter";

import { api } from "@/lib/api";
import { useHighlightStore } from "@/store/highlightStore";
import { useBookmarkStore } from "@/store/bookmarkStore";
import SchemePanel from "@/components/reader/SchemePanel";
import NotesPanel from "@/components/reader/NotesPanel";
import TranslatePanel from "@/components/reader/TranslatePanel";
import BookmarkPanel from "@/components/reader/BookmarkPanel";
import type { Highlight as StoredHighlight, HighlightColor, UserSettings } from "@/types";
import type { AppHighlight } from "@/components/reader/PdfViewer";
import type { TranslateTarget } from "@/components/reader/TranslatePanel";

const PdfViewer = dynamic(() => import("@/components/reader/PdfViewer"), { ssr: false });

export default function ReaderPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { highlights, setHighlights, addHighlight, selectHighlight, updateHighlight, removeHighlight } = useHighlightStore();
  const { setBookmarks } = useBookmarkStore();
  const [translateTarget, setTranslateTarget] = useState<TranslateTarget | null>(null);
  const [loadedHighlightsDocumentId, setLoadedHighlightsDocumentId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ highlight: AppHighlight; nonce: number } | null>(null);
  const [pageTarget, setPageTarget] = useState<{ page: number; nonce: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [bottomTab, setBottomTab] = useState<"notes" | "bookmarks">("notes");

  // 하이라이트 점진적 로드를 위한 상태
  const loadedUntilPageRef = useRef(0); // 마지막으로 로드한 PDF 페이지 번호
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) router.push("/login");
  }, [router]);

  const { data: docData } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.get(`/documents/${documentId}`).then((r) => r.data),
    enabled: !!documentId,
  });
  const docTitle = docData?.title ?? "PDF 뷰어";

  const { data: urlData } = useQuery({
    queryKey: ["document-url", documentId],
    queryFn: () => api.get(`/documents/${documentId}/url`).then((r) => r.data),
    enabled: !!documentId,
  });
  const pdfUrl = urlData?.url ?? null;

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then((r) => r.data),
  });

  const highlightPageLimit = settings?.highlights_per_page ?? 50;

  // 초기 하이라이트 로드
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;

    api.get(`/documents/${documentId}/highlights`, { params: { pdf_page_from: 1, limit: highlightPageLimit } })
      .then((r) => {
        if (cancelled) return;
        const data: AppHighlight[] = r.data.map((h: AppHighlight) => ({
          ...h,
          comment: { text: "", emoji: "" },
        }));
        setHighlights(data);
        loadedUntilPageRef.current = data.length > 0
          ? Math.max(...data.map((h) => (h.position as { pageNumber: number }).pageNumber))
          : Infinity;
        setLoadedHighlightsDocumentId(documentId);
      })
      .catch(() => {
        if (cancelled) return;
        setHighlights([]);
        loadedUntilPageRef.current = Infinity;
        setLoadedHighlightsDocumentId(documentId);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, highlightPageLimit, setHighlights]);

  // 북마크 초기 로드
  useEffect(() => {
    if (!documentId) return;
    api.get(`/documents/${documentId}/bookmarks`)
      .then((r) => setBookmarks(r.data))
      .catch(() => setBookmarks([]));
  }, [documentId, setBookmarks]);

  // PDF 현재 페이지가 바뀌면 추가 하이라이트를 로드
  const handlePageChange = useCallback(async (currentPage: number) => {
    setCurrentPage(currentPage);
    if (!settings) return;
    if (isLoadingMoreRef.current) return;
    if (currentPage <= loadedUntilPageRef.current) return; // 이미 로드된 범위

    isLoadingMoreRef.current = true;
    try {
      const pdf_page_from = loadedUntilPageRef.current + 1;
      const { data } = await api.get(`/documents/${documentId}/highlights`, {
        params: { pdf_page_from, limit: highlightPageLimit },
      });

      const newHighlights: AppHighlight[] = data.map((h: AppHighlight) => ({
        ...h,
        comment: { text: "", emoji: "" },
      }));

      newHighlights.forEach((h) => addHighlight(h));

      if (newHighlights.length > 0) {
        loadedUntilPageRef.current = Math.max(
          ...newHighlights.map((h) => (h.position as { pageNumber: number }).pageNumber)
        );
      } else {
        loadedUntilPageRef.current = Infinity; // 더 이상 로드할 게 없음
      }
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [documentId, settings, highlightPageLimit, addHighlight]);

  async function handleHighlightUpdate(id: string, color: HighlightColor) {
    updateHighlight(id, { color });
    await api.patch(`/highlights/${id}`, { color });
  }

  async function handleHighlightDelete(id: string) {
    removeHighlight(id);
    await api.delete(`/highlights/${id}`);
    queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
  }

  async function handleHighlightAddToScheme(id: string) {
    try {
      await api.post(`/documents/${documentId}/collection/items`, { highlight_id: id });
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 409) {
        throw error;
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
    }
  }

  async function handleHighlightCreate(highlight: NewHighlight, color: HighlightColor, addToScheme = false) {
    const { data } = await api.post(`/documents/${documentId}/highlights`, {
      position: highlight.position,
      content: highlight.content,
      color,
    });
    // invalidate 대신 직접 추가 (점진적 로드 상태 유지)
    addHighlight({ ...data, comment: { text: "", emoji: "" } });

    if (addToScheme) {
      await api.post(`/documents/${documentId}/collection/items`, { highlight_id: data.id });
      queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
    }
  }

  function handleBookmarkNavigate(page: number) {
    setPageTarget({ page, nonce: Date.now() });
  }

  function handleHighlightNavigate(highlight: AppHighlight | StoredHighlight) {
    const appHighlight = {
      ...highlight,
      comment: "comment" in highlight ? highlight.comment : { text: "", emoji: "" },
    } as AppHighlight;
    selectHighlight(appHighlight);
    setScrollTarget({ highlight: appHighlight, nonce: Date.now() });
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b px-4 py-2 flex items-center gap-4 shrink-0 z-10">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-black"
        >
          ← 대시보드
        </button>
        <h1 className="text-sm font-semibold truncate flex-1">{docTitle}</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {pdfUrl ? (
          <PdfViewer
            url={pdfUrl}
            highlights={highlights as AppHighlight[]}
            highlightsReady={loadedHighlightsDocumentId === documentId}
            scrollTarget={scrollTarget}
            pageTarget={pageTarget}
            onHighlightCreate={handleHighlightCreate}
            onHighlightUpdate={handleHighlightUpdate}
            onHighlightDelete={handleHighlightDelete}
            onHighlightAddToScheme={handleHighlightAddToScheme}
            onTranslate={(target) => setTranslateTarget(target)}
            onHighlightClick={(h) => selectHighlight(h)}
            onPageChange={handlePageChange}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            PDF 로딩 중...
          </div>
        )}

        <div className="w-80 flex flex-col border-l bg-white overflow-hidden shrink-0">
          <SchemePanel documentId={documentId} onHighlightClick={handleHighlightNavigate} />
          {translateTarget ? (
            <TranslatePanel
              target={translateTarget}
              onClose={() => setTranslateTarget(null)}
              onHighlightSaved={(highlight) => {
                const appHighlight = { ...(highlight as AppHighlight), comment: { text: "", emoji: "" } };
                addHighlight(appHighlight);
                selectHighlight(appHighlight);
                setBottomTab("notes");
              }}
              documentId={documentId}
            />
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex border-b shrink-0">
                <button
                  onClick={() => setBottomTab("notes")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    bottomTab === "notes"
                      ? "text-black border-b-2 border-black"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  메모
                </button>
                <button
                  onClick={() => setBottomTab("bookmarks")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    bottomTab === "bookmarks"
                      ? "text-black border-b-2 border-black"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  북마크
                </button>
              </div>
              {bottomTab === "notes" ? (
                <NotesPanel documentId={documentId} onHighlightClick={handleHighlightNavigate} />
              ) : (
                <BookmarkPanel
                  documentId={documentId}
                  currentPage={currentPage}
                  onNavigate={handleBookmarkNavigate}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
