"use client";

import { Eraser, Highlighter, Pen, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import {
  HIGHLIGHTER_WIDTHS,
  PEN_WIDTHS,
  useDrawingStore,
} from "@/store/drawingStore";
import type { DrawingStroke, DrawingStrokeColor } from "@/types";

import { DRAWING_COLOR_HEX } from "./DrawingSvg";

const COLORS: DrawingStrokeColor[] = [
  "black",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];

interface Props {
  documentId: string;
  currentPage: number;
}

export default function DrawingToolbar({ documentId, currentPage }: Props) {
  const tool = useDrawingStore((s) => s.tool);
  const pen = useDrawingStore((s) => s.pen);
  const highlighter = useDrawingStore((s) => s.highlighter);
  const setTool = useDrawingStore((s) => s.setTool);
  const setPenColor = useDrawingStore((s) => s.setPenColor);
  const setPenWidth = useDrawingStore((s) => s.setPenWidth);
  const setHighlighterColor = useDrawingStore((s) => s.setHighlighterColor);
  const setHighlighterWidth = useDrawingStore((s) => s.setHighlighterWidth);
  const queryClient = useQueryClient();

  const clearPageMutation = useMutation({
    mutationFn: () =>
      api.delete(`/documents/${documentId}/drawings`, { params: { page: currentPage } }),
    onSuccess: () => {
      queryClient.setQueryData<DrawingStroke[]>(
        ["drawings", documentId],
        (prev = []) => prev.filter((s) => s.page !== currentPage),
      );
    },
  });

  function handleClearPage() {
    if (!confirm(`${currentPage}쪽의 필기를 모두 지울까요?`)) return;
    clearPageMutation.mutate();
  }

  const isEraser = tool === "eraser";
  const current = tool === "highlighter" ? highlighter : pen;
  const widths: readonly number[] = tool === "highlighter" ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS;
  const setColor = tool === "highlighter" ? setHighlighterColor : setPenColor;
  const setWidth = tool === "highlighter" ? setHighlighterWidth : setPenWidth;

  return (
    <div
      className="flex items-center gap-2 bg-white rounded-full shadow-md border border-gray-200 px-2 py-1.5"
      role="toolbar"
      aria-label="필기 도구"
    >
      <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="펜">
        <Pen size={14} />
      </ToolButton>
      <ToolButton
        active={tool === "highlighter"}
        onClick={() => setTool("highlighter")}
        label="형광펜"
      >
        <Highlighter size={14} />
      </ToolButton>
      <ToolButton
        active={tool === "eraser"}
        onClick={() => setTool("eraser")}
        label="지우개"
      >
        <Eraser size={14} />
      </ToolButton>

      {isEraser ? (
        <>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={handleClearPage}
            disabled={clearPageMutation.isPending}
            aria-label="현재 페이지 모두 지우기"
            title="현재 페이지 모두 지우기"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-red-600 disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
        </>
      ) : (
        <>
          <div className="w-px h-4 bg-gray-200" />

          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`색상 ${c}`}
              title={c}
              className={`w-5 h-5 rounded-full border transition-transform ${
                current.color === c
                  ? "border-zinc-900 ring-2 ring-zinc-900/20 scale-110"
                  : "border-gray-300 hover:scale-110"
              }`}
              style={{ backgroundColor: DRAWING_COLOR_HEX[c] }}
            />
          ))}

          <div className="w-px h-4 bg-gray-200" />

          {widths.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              aria-label={`굵기 ${w}`}
              title={`굵기 ${w}`}
              className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                current.width === w ? "bg-zinc-900/10" : "hover:bg-gray-100"
              }`}
            >
              <span
                className="block rounded-full"
                style={{
                  width: Math.min(16, Math.max(2, w * (tool === "highlighter" ? 0.6 : 1.4))),
                  height: Math.min(16, Math.max(2, w * (tool === "highlighter" ? 0.6 : 1.4))),
                  backgroundColor: DRAWING_COLOR_HEX[current.color],
                  opacity: tool === "highlighter" ? 0.45 : 1,
                }}
              />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
        active ? "bg-zinc-900 text-white" : "hover:bg-gray-100 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
