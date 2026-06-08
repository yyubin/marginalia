"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useReaderStore } from "@/store/readerStore";
import StickyNote from "./StickyNote";
import type { StickyNote as StickyNoteType } from "@/types";

interface Props {
  documentId: string;
  pdfContainer: HTMLElement | null;
}

export default function StickyNoteLayer({ documentId, pdfContainer }: Props) {
  const activeTool = useReaderStore((s) => s.activeTool);
  const queryClient = useQueryClient();
  const [pageElements, setPageElements] = useState<Map<number, HTMLElement>>(new Map());
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  // ── Fetch notes ────────────────────────────────────────────────────────────
  const { data: notes = [] } = useQuery<StickyNoteType[]>({
    queryKey: ["sticky-notes", documentId],
    queryFn: () => api.get(`/documents/${documentId}/sticky-notes`).then((r) => r.data),
    enabled: !!documentId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: { page: number; x: number; y: number }) =>
      api.post(`/documents/${documentId}/sticky-notes`, data).then((r) => r.data),
    onSuccess: (note: StickyNoteType) => {
      queryClient.setQueryData<StickyNoteType[]>(["sticky-notes", documentId], (prev = []) => [
        ...prev,
        note,
      ]);
      setNewNoteId(note.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<StickyNoteType> & { id: string }) =>
      api.patch(`/sticky-notes/${id}`, data).then((r) => r.data),
    onSuccess: (updated: StickyNoteType) => {
      queryClient.setQueryData<StickyNoteType[]>(["sticky-notes", documentId], (prev = []) =>
        prev.map((n) => (n.id === updated.id ? updated : n))
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sticky-notes/${id}`),
    onSuccess: (_: unknown, id: string) => {
      queryClient.setQueryData<StickyNoteType[]>(["sticky-notes", documentId], (prev = []) =>
        prev.filter((n) => n.id !== id)
      );
    },
  });

  // ── Discover page DOM elements via MutationObserver ────────────────────────
  // Naively observing the container loops forever because our own portal
  // (wrapped in [data-sticky-layer]) mutates it too. We filter those out so we
  // only react to *external* DOM changes — e.g. pdf.js swapping page elements —
  // which lets us refresh immediately instead of polling and risking notes
  // flickering out of sync with the page DOM.
  const refreshPages = useCallback(() => {
    const root = pdfContainer ?? document.body;
    const nodes = root.querySelectorAll<HTMLElement>("[data-page-number]");

    // Ensure absolute-positioned sticky notes stay within each page's bounds
    nodes.forEach((node) => { node.style.position = "relative"; });

    setPageElements((prev) => {
      if (nodes.length === 0) return prev.size === 0 ? prev : new Map();

      const map = new Map<number, HTMLElement>();
      nodes.forEach((node) => {
        const n = parseInt(node.dataset.pageNumber ?? "0", 10);
        if (n > 0) map.set(n, node);
      });
      if (
        map.size === prev.size &&
        [...map.entries()].every(([k, v]) => prev.get(k) === v)
      ) {
        return prev;
      }
      return map;
    });
  }, [pdfContainer]);

  useEffect(() => {
    const root = pdfContainer ?? document.body;
    refreshPages(); // immediate check

    const isOwnNode = (node: Node) =>
      node instanceof HTMLElement &&
      (node.matches("[data-sticky-layer]") || !!node.closest("[data-sticky-layer]"));

    const observer = new MutationObserver((mutations) => {
      const isExternalChange = mutations.some(
        (m) => ![...m.addedNodes, ...m.removedNodes].every(isOwnNode)
      );
      if (isExternalChange) refreshPages();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pdfContainer, refreshPages]);

  // ── Cursor style when in sticky-note mode ─────────────────────────────────
  useEffect(() => {
    if (activeTool !== "sticky-note") return;
    pageElements.forEach((el) => {
      el.style.cursor = "crosshair";
    });
    return () => {
      pageElements.forEach((el) => {
        el.style.cursor = "";
      });
    };
  }, [activeTool, pageElements]);

  // ── Create note on page click ──────────────────────────────────────────────
  function handlePageClick(
    e: React.MouseEvent,
    pageEl: HTMLElement,
    pageNum: number
  ) {
    if (activeTool !== "sticky-note") return;
    if ((e.target as HTMLElement).closest("[data-sticky-note]")) return;
    const rect = pageEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    createMutation.mutate({ page: pageNum, x, y });
  }

  // ── Group notes by page ────────────────────────────────────────────────────
  const notesByPage = new Map<number, StickyNoteType[]>();
  notes.forEach((note) => {
    const arr = notesByPage.get(note.page) ?? [];
    arr.push(note);
    notesByPage.set(note.page, arr);
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {Array.from(pageElements.entries()).map(([pageNum, pageEl]) => {
        const pageNotes = notesByPage.get(pageNum) ?? [];
        return createPortal(
          <div data-sticky-layer="" className="contents">
            {/* Transparent click overlay — only shown in sticky-note mode */}
            {activeTool === "sticky-note" && (
              <div
                className="absolute inset-0"
                style={{ zIndex: 9 }}
                onClick={(e) => handlePageClick(e, pageEl, pageNum)}
              />
            )}

            {pageNotes.map((note) => (
              <StickyNote
                key={note.id}
                note={note}
                pageEl={pageEl}
                autoFocus={note.id === newNoteId}
                onUpdate={(data) => {
                  if (note.id === newNoteId) setNewNoteId(null);
                  updateMutation.mutate({ id: note.id, ...data });
                }}
                onDelete={() => deleteMutation.mutate(note.id)}
              />
            ))}
          </div>,
          pageEl,
          `sticky-${pageNum}`
        );
      })}
    </>
  );
}
