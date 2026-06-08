"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import { publicApi } from "@/lib/publicApi";
import type { AppHighlight } from "@/components/reader/PdfViewer";
import type { SharedDocumentMeta } from "@/types";

const PdfViewer = dynamic(() => import("@/components/reader/PdfViewer"), { ssr: false });

// Public share endpoints cap a single highlight fetch at 500. For a read-only
// view we load one generous batch from page 1 rather than paginating on scroll.
const HIGHLIGHT_LIMIT = 500;

export default function SharedReader({ token }: { token: string }) {
  const [highlights, setHighlights] = useState<AppHighlight[]>([]);
  const [highlightsReady, setHighlightsReady] = useState(false);

  const meta = useQuery<SharedDocumentMeta>({
    queryKey: ["share-meta", token],
    queryFn: () => publicApi.get(`/share/${token}`).then((r) => r.data),
    retry: false,
  });

  const urlQuery = useQuery<{ url: string }>({
    queryKey: ["share-url", token],
    queryFn: () => publicApi.get(`/share/${token}/url`).then((r) => r.data),
    enabled: meta.isSuccess,
    retry: false,
  });
  const pdfUrl = urlQuery.data?.url ?? null;

  useEffect(() => {
    if (!meta.isSuccess) return;
    let cancelled = false;
    publicApi
      .get(`/share/${token}/highlights`, { params: { pdf_page_from: 1, limit: HIGHLIGHT_LIMIT } })
      .then((r) => {
        if (cancelled) return;
        setHighlights(
          (r.data as AppHighlight[]).map((h) => ({ ...h, comment: { text: "", emoji: "" } }))
        );
      })
      .catch(() => {
        if (!cancelled) setHighlights([]);
      })
      .finally(() => {
        if (!cancelled) setHighlightsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, meta.isSuccess]);

  const notFound = meta.isError && axios.isAxiosError(meta.error) && meta.error.response?.status === 404;

  if (notFound) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-2 bg-gray-100 text-center px-6">
        <p className="text-lg font-semibold text-gray-700">공유를 찾을 수 없습니다</p>
        <p className="text-sm text-gray-400">링크가 만료되었거나 공유가 비활성화되었습니다.</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b px-4 py-2 flex items-center gap-3 shrink-0 z-10">
        <h1 className="text-sm font-semibold truncate flex-1">{meta.data?.title ?? "PDF 뷰어"}</h1>
        <span className="text-[11px] text-gray-400 border rounded-full px-2 py-0.5 shrink-0">
          읽기 전용 공유
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {pdfUrl ? (
          <PdfViewer
            documentId=""
            url={pdfUrl}
            highlights={highlights}
            highlightsReady={highlightsReady}
            scrollTarget={null}
            pageTarget={null}
            readOnly
            shareToken={token}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            PDF 불러오는 중...
          </div>
        )}
      </div>
    </div>
  );
}
