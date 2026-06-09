"use client";

import "react-pdf-highlighter/dist/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { PdfHighlighter, PdfLoader, Highlight, Popup } from "react-pdf-highlighter";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";
import { Pencil, StickyNote as StickyNoteIcon } from "lucide-react";
import { useReaderStore } from "@/store/readerStore";
import StickyNoteLayer from "./StickyNoteLayer";
import DrawingLayer from "./DrawingLayer";
// PdfHighlighter는 class component이므로 ref로 viewer 접근 가능
type PdfHighlighterInstance = InstanceType<typeof PdfHighlighter>;
type PdfViewerLike = {
  container?: HTMLElement;
  currentPageNumber?: number;
  currentScale?: number;
  currentScaleValue?: string;
  pagesCount?: number;
  pdfDocument?: { numPages?: number };
  getPageView?: (pageIndex: number) => { div?: HTMLElement };
  eventBus?: {
    on(e: string, h: (ev: { pageNumber: number }) => void): void;
    off(e: string, h: (ev: { pageNumber: number }) => void): void;
  };
  scrollPageIntoView?: (args: { pageNumber: number }) => void;
};

import HighlightTip, { HighlightEditTip } from "./HighlightTip";
import type { HighlightColor } from "@/types";
import type { TranslateTarget } from "./TranslatePanel";

const WORKER_SRC = "/pdf.worker.min.mjs";

const COLOR_STYLE: Record<HighlightColor, string> = {
  yellow: "rgba(255, 237, 100, 0.45)",
  green:  "rgba(125, 222, 125, 0.45)",
  blue:   "rgba(116, 184, 255, 0.45)",
  pink:   "rgba(255, 182, 193, 0.45)",
  purple: "rgba(204, 153, 255, 0.45)",
};

export type AppHighlight = IHighlight & { color: HighlightColor };

interface Props {
  documentId: string;
  url: string;
  highlights: AppHighlight[];
  highlightsReady: boolean;
  scrollTarget: { highlight: AppHighlight; nonce: number } | null;
  pageTarget: { page: number; nonce: number } | null;
  onHighlightCreate?: (highlight: NewHighlight, color: HighlightColor, addToScheme?: boolean) => void;
  onHighlightUpdate?: (id: string, color: HighlightColor) => void;
  onHighlightDelete?: (id: string) => void;
  onHighlightAddToScheme?: (id: string) => void;
  onTranslate?: (target: TranslateTarget) => void;
  onHighlightClick?: (highlight: AppHighlight) => void;
  onPageChange?: (page: number) => void;
  // Public read-only share view: no creation/edit UI; sticky notes load via token.
  readOnly?: boolean;
  shareToken?: string;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

export default function PdfViewer({
  documentId,
  url,
  highlights,
  highlightsReady,
  scrollTarget,
  pageTarget,
  onHighlightCreate,
  onHighlightUpdate,
  onHighlightDelete,
  onHighlightAddToScheme,
  onTranslate,
  onHighlightClick,
  onPageChange,
  readOnly = false,
  shareToken,
}: Props) {
  const scrollRef = useRef<(h: AppHighlight) => void>(() => {});
  const highlighterRef = useRef<PdfHighlighterInstance>(null);
  const cleanupPageTracking = useRef<(() => void) | null>(null);
  const currentPageRef = useRef(1);
  const onPageChangeRef = useRef(onPageChange);
  const [pdfContainer, setPdfContainer] = useState<HTMLElement | null>(null);
  const { activeTool, toggleStickyNoteTool, toggleDrawTool } = useReaderStore();

  useEffect(() => () => { cleanupPageTracking.current?.(); }, []);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // pdfScaleValue prop이 ResizeObserver 트리거 시 재적용되므로
  // 직접 조작과 함께 prop도 동기화해야 스케일이 유지됨
  const [scale, setScale] = useState<string>("page-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(0);

  const getHighlightById = useCallback(
    (id: string) => highlights.find((h) => h.id === id),
    [highlights]
  );

  const handlePdfReady = useCallback((pageCount: number) => {
    setTotalPages(pageCount);
    setCurrentPage((page) => Math.min(page, pageCount));
    setPageInput((page) => {
      const pageNumber = Number(page);
      if (!Number.isFinite(pageNumber) || pageNumber < 1) return "1";
      return String(Math.min(pageNumber, pageCount));
    });
  }, []);

  const updateCurrentPage = useCallback((page: number) => {
    const nextPage = Math.max(1, Math.floor(page));
    if (currentPageRef.current === nextPage) return;

    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    onPageChangeRef.current?.(nextPage);
  }, []);

  const getVisiblePageNumber = useCallback((viewer: PdfViewerLike) => {
    const container = viewer.container;
    if (!container) return null;

    const pageNodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-page-number]")
    );
    if (pageNodes.length === 0) return null;

    const containerRect = container.getBoundingClientRect();
    const viewportCenter = containerRect.top + containerRect.height / 2;
    let bestPage: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const pageNode of pageNodes) {
      const pageNumber = Number(pageNode.dataset.pageNumber);
      if (!Number.isFinite(pageNumber)) continue;

      const pageRect = pageNode.getBoundingClientRect();
      if (pageRect.bottom < containerRect.top || pageRect.top > containerRect.bottom) {
        continue;
      }

      const pageCenter = pageRect.top + pageRect.height / 2;
      const distance = Math.abs(pageCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = pageNumber;
      }
    }

    return bestPage;
  }, []);

  const syncViewerPageState = useCallback(() => {
    const viewer = highlighterRef.current?.viewer as PdfViewerLike | undefined;
    if (!viewer) return;

    const pageCount = viewer.pagesCount ?? viewer.pdfDocument?.numPages ?? 0;
    if (pageCount) setTotalPages(pageCount);

    const visiblePage = getVisiblePageNumber(viewer);
    const pageNumber = visiblePage ?? viewer.currentPageNumber;
    if (pageNumber) updateCurrentPage(pageNumber);
  }, [getVisiblePageNumber, updateCurrentPage]);

  const attachPageTracking = useCallback(() => {
    if (cleanupPageTracking.current) return true;

    const viewer = highlighterRef.current?.viewer as PdfViewerLike | undefined;
    if (!viewer) return false;

    syncViewerPageState();
    if (viewer.container) setPdfContainer(viewer.container);

    const eventBus = viewer.eventBus;
    const scrollContainer = viewer.container;
    if (!eventBus && !scrollContainer) return false;

    const handler = ({ pageNumber }: { pageNumber: number }) => {
      updateCurrentPage(pageNumber);
    };
    const scrollHandler = () => {
      syncViewerPageState();
    };

    eventBus?.on("pagechanging", handler);
    eventBus?.on("updateviewarea", scrollHandler);
    scrollContainer?.addEventListener("scroll", scrollHandler, { passive: true });

    cleanupPageTracking.current = () => {
      eventBus?.off("pagechanging", handler);
      eventBus?.off("updateviewarea", scrollHandler);
      scrollContainer?.removeEventListener("scroll", scrollHandler);
    };

    return true;
  }, [syncViewerPageState, updateCurrentPage]);

  const setHighlighterRef = useCallback((node: PdfHighlighterInstance | null) => {
    highlighterRef.current = node;
    if (!node) {
      cleanupPageTracking.current?.();
      cleanupPageTracking.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      attachPageTracking();
    });
  }, [attachPageTracking]);

  useEffect(() => {
    if (!highlightsReady) return;

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      if (attachPageTracking() || attempts >= 30) {
        window.clearInterval(intervalId);
      }
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [attachPageTracking, highlightsReady]);

  const navigateViewerToPage = useCallback((page: number) => {
    const viewer = highlighterRef.current?.viewer as PdfViewerLike | undefined;
    if (!viewer) return;

    const pageCount = totalPages || viewer.pagesCount || viewer.pdfDocument?.numPages || page;
    const targetPage = Math.min(pageCount, Math.max(1, Math.floor(page)));

    try {
      if (viewer.scrollPageIntoView) {
        viewer.scrollPageIntoView({ pageNumber: targetPage });
      } else {
        // pdf.js exposes page navigation as an imperative viewer property.
        // eslint-disable-next-line react-hooks/immutability
        viewer.currentPageNumber = targetPage;
      }
    } catch {
      const pageNode = viewer.container?.querySelector<HTMLElement>(
        `[data-page-number="${targetPage}"]`
      );
      pageNode?.scrollIntoView({ block: "start" });
    }
  }, [totalPages]);

  const goToPage = useCallback((page: number) => {
    const targetPage = Math.min(totalPages, Math.max(1, Math.floor(page)));
    navigateViewerToPage(targetPage);
    updateCurrentPage(targetPage);
  }, [navigateViewerToPage, totalPages, updateCurrentPage]);

  const applyScale = useCallback((value: string) => {
    const viewer = highlighterRef.current?.viewer;
    // pdf.js exposes scale as an imperative viewer property.
    // eslint-disable-next-line react-hooks/immutability
    if (viewer) viewer.currentScaleValue = value;
    setScale(value);
  }, []);

  const zoomIn = useCallback(() => {
    const viewer = highlighterRef.current?.viewer;
    if (!viewer) return;
    const next = Math.min(ZOOM_MAX, Math.round((viewer.currentScale + ZOOM_STEP) * 100) / 100);
    applyScale(String(next));
  }, [applyScale]);

  const zoomOut = useCallback(() => {
    const viewer = highlighterRef.current?.viewer;
    if (!viewer) return;
    const next = Math.max(ZOOM_MIN, Math.round((viewer.currentScale - ZOOM_STEP) * 100) / 100);
    applyScale(String(next));
  }, [applyScale]);

  const resetZoom = useCallback(() => applyScale("page-width"), [applyScale]);

  const canScrollToPage = useCallback((pageNumber: number) => {
    const viewer = highlighterRef.current?.viewer as PdfViewerLike | undefined;
    const pageView = viewer?.getPageView?.(pageNumber - 1);
    const pageNode = pageView?.div;
    return Boolean(pageNode?.isConnected && pageNode.offsetParent);
  }, []);

  useEffect(() => {
    if (!highlightsReady || !scrollTarget) return;
    let timeoutId: number | undefined;
    const highlight = scrollTarget.highlight;
    const pageNumber = (highlight.position as { pageNumber: number }).pageNumber;

    navigateViewerToPage(pageNumber);

    function tryScroll(attempt = 0) {
      if (!canScrollToPage(pageNumber)) {
        if (attempt < 10) timeoutId = window.setTimeout(() => tryScroll(attempt + 1), 80);
        return;
      }

      try {
        scrollRef.current(highlight);
      } catch {
        if (attempt < 10) timeoutId = window.setTimeout(() => tryScroll(attempt + 1), 80);
      }
    }

    timeoutId = window.setTimeout(() => tryScroll(), 120);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [canScrollToPage, highlightsReady, navigateViewerToPage, scrollTarget]);

  useEffect(() => {
    if (!pageTarget) return;
    const animationFrameId = window.requestAnimationFrame(() => {
      goToPage(pageTarget.page);
    });
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [pageTarget, goToPage]);

  useEffect(() => {
    return () => {
      scrollRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut]);

  const scaleLabel = scale === "page-width"
    ? "맞춤"
    : `${Math.round(parseFloat(scale) * 100)}%`;

  const pageInputValue = totalPages > 0 ? pageInput : "";

  return (
    <div className="flex-1 overflow-auto relative" style={{ background: "#e5e7eb" }}>
      <div className="fixed bottom-4 left-1/2 lg:left-[calc((100vw-20rem)/2)] -translate-x-1/2 z-[9999] flex items-center gap-1 bg-white border shadow-lg rounded-full px-3 py-1">
        {totalPages > 0 && (
          <>
            <form
              className="flex items-center gap-1 text-xs text-gray-500 tabular-nums"
              onSubmit={(e) => {
                e.preventDefault();
                goToPage(Number(pageInput));
              }}
            >
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-700"
                title="이전 페이지"
              >
                ‹
              </button>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInputValue}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(String(currentPage))}
                className="w-12 h-6 rounded-full border border-gray-200 px-2 text-center text-xs text-gray-700 outline-none focus:border-gray-400"
                aria-label="페이지 번호"
              />
              <span>/ {totalPages}</span>
              <button
                type="submit"
                className="h-6 px-2 rounded-full hover:bg-gray-100 text-gray-700"
                title="페이지로 이동"
              >
                이동
              </button>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-700"
                title="다음 페이지"
              >
                ›
              </button>
            </form>
            <div className="w-px h-3.5 bg-gray-200 mx-1" />
          </>
        )}
        <button
          onClick={zoomOut}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700 text-lg leading-none"
          title="축소 (Ctrl + 스크롤)"
        >
          −
        </button>
        <button
          onClick={resetZoom}
          className="min-w-[48px] text-xs text-gray-600 hover:bg-gray-100 rounded-full px-2 py-1 text-center"
          title="너비 맞춤으로 초기화"
        >
          {scaleLabel}
        </button>
        <button
          onClick={zoomIn}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700 text-lg leading-none"
          title="확대 (Ctrl + 스크롤)"
        >
          +
        </button>
        {!readOnly && (
          <>
            <div className="w-px h-3.5 bg-gray-200 mx-1" />
            <button
              onClick={toggleStickyNoteTool}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                activeTool === "sticky-note"
                  ? "bg-yellow-400 text-white"
                  : "hover:bg-gray-100 text-gray-500"
              }`}
              title="스티커 메모 추가 (클릭 후 PDF를 클릭)"
            >
              <StickyNoteIcon size={14} />
            </button>
            <button
              onClick={toggleDrawTool}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                activeTool === "draw"
                  ? "bg-zinc-900 text-white"
                  : "hover:bg-gray-100 text-gray-500"
              }`}
              title="필기 (PDF 위에 직접 그리기)"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>

      <DrawingLayer
        documentId={documentId}
        pdfContainer={pdfContainer}
        readOnly={readOnly}
        shareToken={shareToken}
      />
      <StickyNoteLayer
        documentId={documentId}
        pdfContainer={pdfContainer}
        readOnly={readOnly}
        shareToken={shareToken}
      />
      <PdfLoader workerSrc={WORKER_SRC} url={url} beforeLoad={<Spinner />}>
        {(pdfDocument) => (
          <>
            <PdfDocumentState totalPages={pdfDocument.numPages} onReady={handlePdfReady} />
            {highlightsReady ? (
              <PdfHighlighter
              ref={setHighlighterRef}
              pdfDocument={pdfDocument}
              highlights={highlights}
              pdfScaleValue={scale}
              onScrollChange={syncViewerPageState}
              scrollRef={(fn) => {
                scrollRef.current = fn;
                if (!attachPageTracking()) {
                  window.requestAnimationFrame(() => {
                    attachPageTracking();
                  });
                }
              }}
              onSelectionFinished={readOnly ? () => null : (position, content, hideTipAndSelection) => {
                const selectedText = content.text?.trim() ?? "";

                return (
                  <HighlightTip
                    canTranslate={selectedText.length > 0}
                    onColorSelect={(color) => {
                      onHighlightCreate?.({ position, content, comment: { text: "", emoji: "" } }, color);
                      hideTipAndSelection();
                    }}
                    onAddToScheme={() => {
                      onHighlightCreate?.({ position, content, comment: { text: "", emoji: "" } }, "yellow", true);
                      hideTipAndSelection();
                    }}
                    onTranslate={() => {
                      if (selectedText) {
                        onTranslate?.({
                          kind: "selection",
                          text: selectedText,
                          position,
                          content,
                          color: "blue",
                        });
                      }
                      hideTipAndSelection();
                    }}
                  />
                );
              }}
              highlightTransform={(highlight, _index, setTip, hideTip, _vts, _ss, isScrolledTo) => {
              const appHighlight = getHighlightById(highlight.id) ?? {
                ...highlight,
                color: "yellow" as HighlightColor,
              };

              const color = (appHighlight as AppHighlight).color ?? "yellow";
              const style = COLOR_STYLE[color as HighlightColor] ?? COLOR_STYLE.yellow;
              const highlightText = highlight.content.text?.trim() ?? "";

              const openEditTip = () => {
                onHighlightClick?.(appHighlight as AppHighlight);
                setTip(highlight, () => (
                  <HighlightEditTip
                    currentColor={color}
                    onColorChange={(newColor) => {
                      onHighlightUpdate?.(highlight.id, newColor);
                      hideTip();
                    }}
                    onAddToScheme={() => {
                      onHighlightAddToScheme?.(highlight.id);
                      hideTip();
                    }}
                    canTranslate={highlightText.length > 0}
                    onTranslate={() => {
                      if (highlightText) {
                        onTranslate?.({
                          kind: "highlight",
                          text: highlightText,
                          highlightId: highlight.id,
                        });
                      }
                      hideTip();
                    }}
                    onDelete={() => {
                      onHighlightDelete?.(highlight.id);
                      hideTip();
                    }}
                  />
                ));
              };

              const component = highlight.content.image ? (
                <div
                  className="Highlight__part"
                  style={{
                    ...highlight.position.boundingRect,
                    position: "absolute",
                    backgroundColor: style,
                    cursor: "pointer",
                    filter: isScrolledTo ? "brightness(0.85)" : undefined,
                  }}
                />
              ) : (
                <Highlight
                  isScrolledTo={isScrolledTo}
                  position={highlight.position}
                  comment={highlight.comment}
                />
              );

              return (
                <Popup
                  popupContent={
                    <HoverPreview text={highlight.content.text ?? "이미지 하이라이트"} />
                  }
                  onMouseOver={(popupContent) =>
                    setTip(highlight, () => popupContent)
                  }
                  onMouseOut={hideTip}
                  key={highlight.id}
                >
                  <div
                    onClick={readOnly ? undefined : openEditTip}
                    style={{
                      ["--highlight-color" as string]: style,
                    }}
                    className="highlight-color-override"
                  >
                    {component}
                  </div>
                </Popup>
              );
              }}
              enableAreaSelection={(e) => e.altKey}
              />
            ) : (
              <Spinner />
            )}
          </>
        )}
      </PdfLoader>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-gray-400 text-sm">PDF 불러오는 중...</div>
    </div>
  );
}

function PdfDocumentState({
  totalPages,
  onReady,
}: {
  totalPages: number;
  onReady: (totalPages: number) => void;
}) {
  useEffect(() => {
    onReady(totalPages);
  }, [totalPages, onReady]);

  return null;
}

// react-pdf-highlighter의 Popup이 popupContent에 onUpdate 같은 내부 prop을 주입하는데
// 이게 DOM까지 전달되면 React 경고가 발생하므로 명시적으로 걸러냄
function HoverPreview({ text, ...rest }: { text: string } & Record<string, unknown>) {
  void rest;
  return (
    <div className="bg-white border shadow rounded-lg px-3 py-1.5 text-xs text-gray-600 max-w-xs truncate">
      {text}
    </div>
  );
}
