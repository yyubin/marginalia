"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { NewHighlight } from "react-pdf-highlighter";

import { api } from "@/lib/api";
import { useHighlightStore } from "@/store/highlightStore";
import { useSchemeStore } from "@/store/schemeStore";
import SchemePanel from "@/components/reader/SchemePanel";
import NotesPanel from "@/components/reader/NotesPanel";
import TranslatePanel from "@/components/reader/TranslatePanel";
import type { HighlightColor } from "@/types";
import type { AppHighlight } from "@/components/reader/PdfViewer";

// SSR 비활성화 — pdfjs는 browser-only
const PdfViewer = dynamic(() => import("@/components/reader/PdfViewer"), { ssr: false });

export default function ReaderPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { highlights, setHighlights, addHighlight, selectHighlight, updateHighlight, removeHighlight } = useHighlightStore();
  const { setItems } = useSchemeStore();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("PDF 뷰어");

  useEffect(() => {
    if (!localStorage.getItem("access_token")) router.push("/login");
  }, [router]);

  const { data: docData } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.get(`/documents/${documentId}`).then((r) => r.data),
    enabled: !!documentId,
  });
  useEffect(() => { if (docData?.title) setDocTitle(docData.title); }, [docData]);

  const { data: urlData } = useQuery({
    queryKey: ["document-url", documentId],
    queryFn: () => api.get(`/documents/${documentId}/url`).then((r) => r.data),
    enabled: !!documentId,
  });
  useEffect(() => { if (urlData?.url) setPdfUrl(urlData.url); }, [urlData]);

  const { data: highlightData } = useQuery<AppHighlight[]>({
    queryKey: ["highlights", documentId],
    queryFn: () => api.get(`/documents/${documentId}/highlights`).then((r) =>
      r.data.map((h: AppHighlight) => ({ ...h, comment: { text: "", emoji: "" } }))
    ),
    enabled: !!documentId,
  });
  useEffect(() => { if (highlightData) setHighlights(highlightData); }, [highlightData, setHighlights]);

  const { data: collectionData } = useQuery({
    queryKey: ["collection", documentId],
    queryFn: () => api.get(`/documents/${documentId}/collection`).then((r) => r.data),
    enabled: !!documentId,
  });
  useEffect(() => { if (collectionData?.items) setItems(collectionData.items); }, [collectionData, setItems]);

  async function handleHighlightUpdate(id: string, color: HighlightColor) {
    updateHighlight(id, { color });
    await api.patch(`/highlights/${id}`, { color });
  }

  async function handleHighlightDelete(id: string) {
    removeHighlight(id);
    await api.delete(`/highlights/${id}`);
    queryClient.invalidateQueries({ queryKey: ["highlights", documentId] });
    queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
  }

  async function handleHighlightCreate(highlight: NewHighlight, color: HighlightColor, addToScheme = false) {
    const { data } = await api.post(`/documents/${documentId}/highlights`, {
      position: highlight.position,
      content: highlight.content,
      color,
    });
    queryClient.invalidateQueries({ queryKey: ["highlights", documentId] });

    if (addToScheme) {
      await api.post(`/documents/${documentId}/collection/items`, { highlight_id: data.id });
      queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
    }
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
        {/* PDF 뷰어 */}
        {pdfUrl ? (
          <PdfViewer
            url={pdfUrl}
            highlights={highlights as AppHighlight[]}
            onHighlightCreate={handleHighlightCreate}
            onHighlightUpdate={handleHighlightUpdate}
            onHighlightDelete={handleHighlightDelete}
            onTranslate={(text) => setTranslateText(text)}
            onHighlightClick={(h) => selectHighlight(h)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            PDF 로딩 중...
          </div>
        )}

        {/* 우측 패널 */}
        <div className="w-80 flex flex-col border-l bg-white overflow-hidden shrink-0">
          <SchemePanel documentId={documentId} />
          {translateText ? (
            <TranslatePanel
              text={translateText}
              onClose={() => setTranslateText(null)}
              documentId={documentId}
            />
          ) : (
            <NotesPanel documentId={documentId} />
          )}
        </div>
      </div>
    </div>
  );
}
