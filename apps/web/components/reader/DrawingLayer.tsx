"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { publicApi } from "@/lib/publicApi";
import { useDrawingStore } from "@/store/drawingStore";
import { useReaderStore } from "@/store/readerStore";
import type {
  DrawingStroke as DrawingStrokeType,
  DrawingStrokeColor,
  DrawingTool,
  RenderableDrawingStroke,
} from "@/types";

import DrawingCanvas from "./DrawingCanvas";
import DrawingEraser from "./DrawingEraser";
import DrawingSvg from "./DrawingSvg";

interface Props {
  documentId: string;
  pdfContainer: HTMLElement | null;
  readOnly?: boolean;
  shareToken?: string;
}

export default function DrawingLayer({ documentId, pdfContainer, readOnly = false, shareToken }: Props) {
  const activeTool = useReaderStore((s) => s.activeTool);
  const tool = useDrawingStore((s) => s.tool);
  const pen = useDrawingStore((s) => s.pen);
  const highlighter = useDrawingStore((s) => s.highlighter);
  // For the eraser branch this value is unused; default to pen so the type is
  // always defined.
  const current = tool === "highlighter" ? highlighter : pen;
  const queryClient = useQueryClient();

  const [pageElements, setPageElements] = useState<Map<number, HTMLElement>>(new Map());
  const [hosts, setHosts] = useState<Map<HTMLElement, HTMLDivElement>>(new Map());
  const [hoveredIds, setHoveredIds] = useState<Set<string>>(new Set());
  const hostsRef = useRef<Map<HTMLElement, HTMLDivElement>>(new Map());

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const ownerQuery = useQuery<DrawingStrokeType[]>({
    queryKey: ["drawings", documentId],
    queryFn: () => api.get(`/documents/${documentId}/drawings`).then((r) => r.data),
    enabled: !readOnly && !!documentId,
  });
  const sharedQuery = useQuery<RenderableDrawingStroke[]>({
    queryKey: ["shared-drawings", shareToken],
    queryFn: () => publicApi.get(`/share/${shareToken}/drawings`).then((r) => r.data),
    enabled: readOnly && !!shareToken,
  });
  const strokes: RenderableDrawingStroke[] = (readOnly ? sharedQuery.data : ownerQuery.data) ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: {
      page: number;
      points: number[][];
      color: DrawingStrokeColor;
      width: number;
      tool: DrawingTool;
    }) => api.post(`/documents/${documentId}/drawings`, data).then((r) => r.data),
    onSuccess: (stroke: DrawingStrokeType) => {
      queryClient.setQueryData<DrawingStrokeType[]>(["drawings", documentId], (prev = []) => [
        ...prev,
        stroke,
      ]);
    },
  });

  // Batch delete — optimistically removes from cache first so the UI is snappy,
  // then fires the requests in parallel. If a delete fails, the next refetch
  // will reconcile.
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.delete(`/drawings/${id}`)));
      return ids;
    },
    onMutate: (ids: string[]) => {
      const prev = queryClient.getQueryData<DrawingStrokeType[]>(["drawings", documentId]);
      const idSet = new Set(ids);
      queryClient.setQueryData<DrawingStrokeType[]>(["drawings", documentId], (curr = []) =>
        curr.filter((s) => !idSet.has(s.id)),
      );
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["drawings", documentId], ctx.prev);
    },
  });

  // ── Discover pdf.js page DOM via MutationObserver (mirrors StickyNoteLayer) ─
  const refreshPages = useCallback(() => {
    const root = pdfContainer ?? document.body;
    const nodes = root.querySelectorAll<HTMLElement>("[data-page-number]");

    nodes.forEach((node) => { node.style.position = "relative"; });

    const map = new Map<number, HTMLElement>();
    nodes.forEach((node) => {
      const n = parseInt(node.dataset.pageNumber ?? "0", 10);
      if (n > 0) map.set(n, node);
    });

    const live = new Set(map.values());
    map.forEach((pageEl) => {
      let host = hostsRef.current.get(pageEl);
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-drawing-layer", "");
        host.style.position = "absolute";
        host.style.inset = "0";
        host.style.pointerEvents = "none";
        // Above pdf.js .textLayer text spans (z:1) and react-pdf-highlighter
        // selection overlay so the canvas catches pointer events; sticky-layer
        // sits one level higher so its notes/overlay remain interactive on top.
        host.style.zIndex = "10";
        hostsRef.current.set(pageEl, host);
      }
      if (host.parentNode !== pageEl) pageEl.appendChild(host);
    });
    hostsRef.current.forEach((host, pageEl) => {
      if (!live.has(pageEl)) {
        host.remove();
        hostsRef.current.delete(pageEl);
      }
    });

    setPageElements((prev) => {
      if (
        map.size === prev.size &&
        [...map.entries()].every(([k, v]) => prev.get(k) === v)
      ) {
        return prev;
      }
      return map;
    });
    setHosts((prev) => {
      if (
        prev.size === hostsRef.current.size &&
        [...hostsRef.current.entries()].every(([k, v]) => prev.get(k) === v)
      ) {
        return prev;
      }
      return new Map(hostsRef.current);
    });
  }, [pdfContainer]);

  useEffect(() => {
    const root = pdfContainer ?? document.body;
    refreshPages();

    const isOwnNode = (node: Node) =>
      node instanceof HTMLElement &&
      (node.matches("[data-drawing-layer]") || !!node.closest("[data-drawing-layer]"));

    const observer = new MutationObserver((mutations) => {
      const isExternalChange = mutations.some(
        (m) => ![...m.addedNodes, ...m.removedNodes].every(isOwnNode)
      );
      if (isExternalChange) refreshPages();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pdfContainer, refreshPages]);

  const drawToolActive = !readOnly && activeTool === "draw";

  // ── Cursor on each page element (mirrors sticky pattern) ───────────────────
  // Setting cursor on the page itself ensures the crosshair persists even
  // before the canvas has finished mounting / resizing, and as a fallback if
  // a pdf.js child element (e.g. text span with cursor:text) somehow ends up
  // on top in a stacking edge case.
  useEffect(() => {
    if (!drawToolActive) return;
    pageElements.forEach((el) => {
      el.style.cursor = "crosshair";
    });
    return () => {
      pageElements.forEach((el) => {
        el.style.cursor = "";
      });
    };
  }, [drawToolActive, pageElements]);

  // ── Group strokes by page ──────────────────────────────────────────────────
  const strokesByPage = new Map<number, RenderableDrawingStroke[]>();
  strokes.forEach((s) => {
    const arr = strokesByPage.get(s.page) ?? [];
    arr.push(s);
    strokesByPage.set(s.page, arr);
  });

  return (
    <>
      {Array.from(pageElements.entries()).map(([pageNum, pageEl]) => {
        const host = hosts.get(pageEl);
        if (!host) return null;
        const pageStrokes = strokesByPage.get(pageNum) ?? [];
        return createPortal(
          <>
            <DrawingSvg strokes={pageStrokes} hoveredIds={hoveredIds} />
            {drawToolActive && (tool === "eraser" ? (
              <DrawingEraser
                pageEl={pageEl}
                strokes={pageStrokes}
                hoveredIds={hoveredIds}
                onHover={setHoveredIds}
                onErase={(ids) => deleteMutation.mutate(ids)}
              />
            ) : (
              <DrawingCanvas
                pageEl={pageEl}
                tool={tool}
                color={current.color}
                width={current.width}
                onStrokeComplete={(points) => {
                  createMutation.mutate({
                    page: pageNum,
                    points,
                    color: current.color,
                    width: current.width,
                    tool,
                  });
                }}
              />
            ))}
          </>,
          host,
          `drawing-${pageNum}`
        );
      })}
    </>
  );
}
