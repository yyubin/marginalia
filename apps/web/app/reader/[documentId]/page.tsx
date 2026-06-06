"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHighlightStore } from "@/store/highlightStore";
import { useSchemeStore } from "@/store/schemeStore";
import SchemePanel from "@/components/reader/SchemePanel";
import NotesPanel from "@/components/reader/NotesPanel";
import type { Highlight } from "@/types";

export default function ReaderPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { highlights, setHighlights, addHighlight, removeHighlight } = useHighlightStore();
  const { setItems } = useSchemeStore();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) router.push("/login");
  }, [router]);

  // PDF presigned URL 조회
  const { data: urlData } = useQuery({
    queryKey: ["document-url", documentId],
    queryFn: () => api.get(`/documents/${documentId}/url`).then((r) => r.data),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (urlData?.url) setPdfUrl(urlData.url);
  }, [urlData]);

  // 하이라이트 목록 조회
  const { data: highlightData } = useQuery<Highlight[]>({
    queryKey: ["highlights", documentId],
    queryFn: () => api.get(`/documents/${documentId}/highlights`).then((r) => r.data),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (highlightData) setHighlights(highlightData);
  }, [highlightData, setHighlights]);

  // 스킴패널 조회
  const { data: collectionData } = useQuery({
    queryKey: ["collection", documentId],
    queryFn: () => api.get(`/documents/${documentId}/collection`).then((r) => r.data),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (collectionData?.items) setItems(collectionData.items);
  }, [collectionData, setItems]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b px-4 py-2 flex items-center gap-4 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-sm text-gray-500 hover:text-black">
          ← 대시보드
        </button>
        <h1 className="text-sm font-semibold truncate flex-1">PDF 뷰어</h1>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer area */}
        <div className="flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-4">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full max-w-4xl h-full min-h-[800px] rounded shadow-lg bg-white"
              title="PDF Viewer"
            />
          ) : (
            <div className="text-gray-400 mt-20">PDF 로딩 중...</div>
          )}
        </div>

        {/* Right panels */}
        <div className="w-80 flex flex-col border-l bg-white overflow-hidden shrink-0">
          <SchemePanel documentId={documentId} />
          <NotesPanel documentId={documentId} />
        </div>
      </div>
    </div>
  );
}
