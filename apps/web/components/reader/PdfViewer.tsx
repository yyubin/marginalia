"use client";

import "react-pdf-highlighter/dist/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { PdfHighlighter, PdfLoader, Highlight, Popup } from "react-pdf-highlighter";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";
// PdfHighlighter는 class component이므로 ref로 viewer 접근 가능
type PdfHighlighterInstance = InstanceType<typeof PdfHighlighter>;

import HighlightTip, { HighlightEditTip } from "./HighlightTip";
import type { HighlightColor } from "@/types";

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
  url: string;
  highlights: AppHighlight[];
  onHighlightCreate: (highlight: NewHighlight, color: HighlightColor, addToScheme?: boolean) => void;
  onHighlightUpdate: (id: string, color: HighlightColor) => void;
  onHighlightDelete: (id: string) => void;
  onTranslate: (text: string) => void;
  onHighlightClick: (highlight: AppHighlight) => void;
  onPageChange?: (page: number) => void;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

export default function PdfViewer({
  url,
  highlights,
  onHighlightCreate,
  onHighlightUpdate,
  onHighlightDelete,
  onTranslate,
  onHighlightClick,
  onPageChange,
}: Props) {
  const scrollRef = useRef<(h: AppHighlight) => void>(() => {});
  const highlighterRef = useRef<PdfHighlighterInstance>(null);
  const cleanupPageTracking = useRef<(() => void) | null>(null);

  useEffect(() => () => { cleanupPageTracking.current?.(); }, []);
  // pdfScaleValue prop이 ResizeObserver 트리거 시 재적용되므로
  // 직접 조작과 함께 prop도 동기화해야 스케일이 유지됨
  const [scale, setScale] = useState<string>("page-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const getHighlightById = useCallback(
    (id: string) => highlights.find((h) => h.id === id),
    [highlights]
  );

  const applyScale = useCallback((value: string) => {
    const viewer = highlighterRef.current?.viewer;
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

  return (
    <div className="flex-1 overflow-auto relative" style={{ background: "#e5e7eb" }}>
      {/* 하단 컨트롤 바: 페이지 정보 + 줌 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white border shadow-lg rounded-full px-3 py-1">
        {totalPages > 0 && (
          <>
            <span className="text-xs text-gray-500 tabular-nums px-1">
              {currentPage} / {totalPages}
            </span>
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
      </div>

      <PdfLoader workerSrc={WORKER_SRC} url={url} beforeLoad={<Spinner />}>
        {(pdfDocument) => (
          <PdfHighlighter
            ref={highlighterRef}
            pdfDocument={pdfDocument}
            highlights={highlights}
            pdfScaleValue={scale}
            onScrollChange={() => {}}
            scrollRef={(fn) => {
              scrollRef.current = fn;
              if (cleanupPageTracking.current) return;
              const viewer = highlighterRef.current?.viewer;
              type InternalViewer = {
                pdfDocument?: { numPages?: number };
                eventBus?: {
                  on(e: string, h: (ev: { pageNumber: number }) => void): void;
                  off(e: string, h: (ev: { pageNumber: number }) => void): void;
                };
              };
              const internal = viewer as unknown as InternalViewer;
              // 전체 페이지 수 — 렌더 중 setState를 피하기 위해 여기서 설정
              const numPages = internal?.pdfDocument?.numPages;
              if (numPages) setTotalPages(numPages);
              // pdfjs EventBus pagechanging으로 현재 페이지 추적
              const eventBus = internal?.eventBus;
              if (!eventBus) return;
              const handler = ({ pageNumber }: { pageNumber: number }) => {
                setCurrentPage(pageNumber);
                onPageChange?.(pageNumber);
              };
              eventBus.on("pagechanging", handler);
              cleanupPageTracking.current = () => eventBus.off("pagechanging", handler);
            }}
            onSelectionFinished={(position, content, hideTipAndSelection, transformSelection) => (
              <HighlightTip
                onColorSelect={(color) => {
                  onHighlightCreate({ position, content, comment: { text: "", emoji: "" } }, color);
                  hideTipAndSelection();
                }}
                onAddToScheme={() => {
                  onHighlightCreate({ position, content, comment: { text: "", emoji: "" } }, "yellow", true);
                  hideTipAndSelection();
                }}
                onTranslate={() => {
                  if (content.text) onTranslate(content.text);
                  hideTipAndSelection();
                }}
              />
            )}
            highlightTransform={(highlight, _index, setTip, hideTip, _vts, _ss, isScrolledTo) => {
              const appHighlight = getHighlightById(highlight.id) ?? {
                ...highlight,
                color: "yellow" as HighlightColor,
              };

              const color = (appHighlight as AppHighlight).color ?? "yellow";
              const style = COLOR_STYLE[color as HighlightColor] ?? COLOR_STYLE.yellow;

              const component = (
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
                    onClick={() => {
                      onHighlightClick(appHighlight as AppHighlight);
                      setTip(highlight, () => (
                        <HighlightEditTip
                          currentColor={color}
                          onColorChange={(newColor) => {
                            onHighlightUpdate(highlight.id, newColor);
                            hideTip();
                          }}
                          onDelete={() => {
                            onHighlightDelete(highlight.id);
                            hideTip();
                          }}
                        />
                      ));
                    }}
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
        )}
      </PdfLoader>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-gray-400 text-sm">PDF 로딩 중...</div>
    </div>
  );
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
