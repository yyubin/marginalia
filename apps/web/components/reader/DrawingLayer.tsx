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
  RenderableDrawingStroke,
} from "@/types";

import DrawingCanvas from "./DrawingCanvas";
import DrawingSvg from "./DrawingSvg";

interface Props {
  documentId: string;
  pdfContainer: HTMLElement | null;
  readOnly?: boolean;
  shareToken?: string;
}

export default function DrawingLayer({ documentId, pdfContainer, readOnly = false, shareToken }: Props) {
  const activeTool = useReaderStore((s) => s.activeTool);
  const color = useDrawingStore((s) => s.color);
  const width = useDrawingStore((s) => s.width);
  const queryClient = useQueryClient();

  const [pageElements, setPageElements] = useState<Map<number, HTMLElement>>(new Map());
  const [hosts, setHosts] = useState<Map<HTMLElement, HTMLDivElement>>(new Map());
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
    mutationFn: (data: { page: number; points: number[][]; color: DrawingStrokeColor; width: number }) =>
      api.post(`/documents/${documentId}/drawings`, data).then((r) => r.data),
    onSuccess: (stroke: DrawingStrokeType) => {
      queryClient.setQueryData<DrawingStrokeType[]>(["drawings", documentId], (prev = []) => [
        ...prev,
        stroke,
      ]);
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
        // Lower than sticky-layer (which is set to 2) so committed strokes
        // render under sticky notes; the canvas opts back into events itself.
        host.style.zIndex = "1";
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
            <DrawingSvg strokes={pageStrokes} />
            {drawToolActive && (
              <DrawingCanvas
                pageEl={pageEl}
                color={color}
                width={width}
                onStrokeComplete={(points) => {
                  createMutation.mutate({ page: pageNum, points, color, width });
                }}
              />
            )}
          </>,
          host,
          `drawing-${pageNum}`
        );
      })}
    </>
  );
}
