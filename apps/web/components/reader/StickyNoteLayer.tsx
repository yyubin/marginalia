"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const observerRef = useRef<MutationObserver | null>(null);

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

  // ── Discover page DOM elements ─────────────────────────────────────────────
  const refreshPageElements = useCallback(() => {
    if (!pdfContainer) return;
    const nodes = pdfContainer.querySelectorAll<HTMLElement>("[data-page-number]");
    const map = new Map<number, HTMLElement>();
    nodes.forEach((node) => {
      const pageNum = parseInt(node.dataset.pageNumber ?? "0", 10);
      if (pageNum > 0) map.set(pageNum, node);
    });
    setPageElements(map);
  }, [pdfContainer]);

  useEffect(() => {
    if (!pdfContainer) return;
    refreshPageElements();

    observerRef.current?.disconnect();
    const observer = new MutationObserver(refreshPageElements);
    observer.observe(pdfContainer, { childList: true, subtree: true });
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [pdfContainer, refreshPageElements]);

  // ── Click handler: create note in sticky-note mode ─────────────────────────
  useEffect(() => {
    if (activeTool !== "sticky-note") return;

    const handlers: Array<{ el: HTMLElement; fn: (e: MouseEvent) => void }> = [];

    pageElements.forEach((pageEl, pageNum) => {
      const fn = (e: MouseEvent) => {
        // Don't create note when clicking on an existing sticky note
        if ((e.target as HTMLElement).closest("[data-sticky-note]")) return;
        const rect = pageEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
        createMutation.mutate({ page: pageNum, x, y });
      };
      pageEl.addEventListener("click", fn);
      handlers.push({ el: pageEl, fn });
    });

    return () => handlers.forEach(({ el, fn }) => el.removeEventListener("click", fn));
  }, [activeTool, pageElements, createMutation]);

  // ── Cursor style on pages ─────────────────────────────────────────────────
  useEffect(() => {
    pageElements.forEach((pageEl) => {
      pageEl.style.cursor = activeTool === "sticky-note" ? "crosshair" : "";
    });
    return () => pageElements.forEach((pageEl) => { pageEl.style.cursor = ""; });
  }, [activeTool, pageElements]);

  // Group notes by page
  const notesByPage = new Map<number, StickyNoteType[]>();
  notes.forEach((note) => {
    const arr = notesByPage.get(note.page) ?? [];
    arr.push(note);
    notesByPage.set(note.page, arr);
  });

  return (
    <>
      {Array.from(pageElements.entries()).map(([pageNum, pageEl]) => {
        const pageNotes = notesByPage.get(pageNum) ?? [];
        return createPortal(
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "none", zIndex: 10 }}
            data-sticky-layer={pageNum}
          >
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
          pageEl
        );
      })}
    </>
  );
}
