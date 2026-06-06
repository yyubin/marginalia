"use client";

import "react-pdf-highlighter/dist/style.css";

import { useCallback, useRef } from "react";
import { PdfHighlighter, PdfLoader, Highlight, Popup } from "react-pdf-highlighter";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";

import HighlightTip from "./HighlightTip";
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
  onTranslate: (text: string) => void;
  onHighlightClick: (highlight: AppHighlight) => void;
}

export default function PdfViewer({
  url,
  highlights,
  onHighlightCreate,
  onTranslate,
  onHighlightClick,
}: Props) {
  const scrollRef = useRef<(h: AppHighlight) => void>(() => {});

  const getHighlightById = useCallback(
    (id: string) => highlights.find((h) => h.id === id),
    [highlights]
  );

  return (
    <div className="flex-1 overflow-auto relative" style={{ background: "#e5e7eb" }}>
      <PdfLoader workerSrc={WORKER_SRC} url={url} beforeLoad={<Spinner />}>
        {(pdfDocument) => (
          <PdfHighlighter
            pdfDocument={pdfDocument}
            highlights={highlights}
            pdfScaleValue="page-width"
            onScrollChange={() => {}}
            scrollRef={(fn) => { scrollRef.current = fn; }}
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
                    <div className="bg-white border shadow rounded-lg px-3 py-1.5 text-xs text-gray-600 max-w-xs truncate">
                      {highlight.content.text ?? "이미지 하이라이트"}
                    </div>
                  }
                  onMouseOver={(popupContent) =>
                    setTip(highlight, () => popupContent)
                  }
                  onMouseOut={hideTip}
                  key={highlight.id}
                >
                  <div
                    onClick={() => onHighlightClick(appHighlight as AppHighlight)}
                    style={{
                      // 색상을 CSS 변수로 주입해 Highlight 내부 rect에 적용
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
