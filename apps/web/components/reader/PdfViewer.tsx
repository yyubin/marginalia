"use client";

import "react-pdf-highlighter/dist/style.css";

import { useCallback, useRef } from "react";
import { PdfHighlighter, PdfLoader, Highlight, Popup } from "react-pdf-highlighter";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";

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
}

export default function PdfViewer({
  url,
  highlights,
  onHighlightCreate,
  onHighlightUpdate,
  onHighlightDelete,
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
