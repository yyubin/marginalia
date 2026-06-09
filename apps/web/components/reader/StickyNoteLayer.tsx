"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { publicApi } from "@/lib/publicApi";
import { useReaderStore } from "@/store/readerStore";
import StickyNote from "./StickyNote";
import type { RenderableStickyNote, StickyNote as StickyNoteType } from "@/types";

interface Props {
  documentId: string;
  pdfContainer: HTMLElement | null;
  // Read-only mode (public share page): notes are fetched via the public API by
  // share token, and all create/edit/drag/resize/delete affordances are off.
  readOnly?: boolean;
  shareToken?: string;
}

export default function StickyNoteLayer({ documentId, pdfContainer, readOnly = false, shareToken }: Props) {
  const activeTool = useReaderStore((s) => s.activeTool);
  const queryClient = useQueryClient();
  const [pageElements, setPageElements] = useState<Map<number, HTMLElement>>(new Map());
  // Persistent host containers we own, one per pdf.js page div — this is the
  // portal target render reads from. We portal notes into these instead of
  // directly into the page div, because pdf.js's reset() (fired on zoom /
  // page-width fit / re-render) removes every child of the page div it doesn't
  // recognise, which would otherwise wipe our notes. The host node object stays
  // alive across such removals (React's portal content rides along), so
  // reattaching it restores everything without a React remount or flicker.
  const [hosts, setHosts] = useState<Map<HTMLElement, HTMLDivElement>>(new Map());
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  // Node store for hosts. Mutated only inside refreshPages (a callback, never
  // during render), so it's safe to read .current there.
  const hostsRef = useRef<Map<HTMLElement, HTMLDivElement>>(new Map());

  // ── Fetch notes ────────────────────────────────────────────────────────────
  const ownerQuery = useQuery<StickyNoteType[]>({
    queryKey: ["sticky-notes", documentId],
    queryFn: () => api.get(`/documents/${documentId}/sticky-notes`).then((r) => r.data),
    enabled: !readOnly && !!documentId,
  });
  const sharedQuery = useQuery<RenderableStickyNote[]>({
    queryKey: ["shared-sticky-notes", shareToken],
    queryFn: () => publicApi.get(`/share/${shareToken}/sticky-notes`).then((r) => r.data),
    enabled: readOnly && !!shareToken,
  });
  const notes: RenderableStickyNote[] = (readOnly ? sharedQuery.data : ownerQuery.data) ?? [];

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

    const map = new Map<number, HTMLElement>();
    nodes.forEach((node) => {
      const n = parseInt(node.dataset.pageNumber ?? "0", 10);
      if (n > 0) map.set(n, node);
    });

    // Create a host per live page and (re)attach it — pdf.js may have detached
    // it during its last render — then prune hosts for pages that are gone.
    const live = new Set(map.values());
    map.forEach((pageEl) => {
      let host = hostsRef.current.get(pageEl);
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-sticky-layer", "");
        host.style.position = "absolute";
        host.style.inset = "0";
        host.style.pointerEvents = "none"; // notes/overlay opt back in individually
        // Stack above drawing-layer host (which sets z-index 1) so sticky notes
        // and the click overlay remain interactive on top of committed strokes.
        host.style.zIndex = "2";
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
    // Publish hosts for render. Membership only changes when pages do, so a
    // bare reattach (same node set) keeps the previous map and skips re-render.
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

  const stickyToolActive = !readOnly && activeTool === "sticky-note";

  // ── Cursor style when in sticky-note mode ─────────────────────────────────
  useEffect(() => {
    if (!stickyToolActive) return;
    pageElements.forEach((el) => {
      el.style.cursor = "crosshair";
    });
    return () => {
      pageElements.forEach((el) => {
        el.style.cursor = "";
      });
    };
  }, [stickyToolActive, pageElements]);

  // ── Create note on page click ──────────────────────────────────────────────
  function handlePageClick(
    e: React.MouseEvent,
    pageEl: HTMLElement,
    pageNum: number
  ) {
    if (!stickyToolActive) return;
    if ((e.target as HTMLElement).closest("[data-sticky-note]")) return;
    const rect = pageEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    createMutation.mutate({ page: pageNum, x, y });
  }

  // ── Group notes by page ────────────────────────────────────────────────────
  const notesByPage = new Map<number, RenderableStickyNote[]>();
  notes.forEach((note) => {
    const arr = notesByPage.get(note.page) ?? [];
    arr.push(note);
    notesByPage.set(note.page, arr);
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {Array.from(pageElements.entries()).map(([pageNum, pageEl]) => {
        const host = hosts.get(pageEl);
        if (!host) return null;
        const pageNotes = notesByPage.get(pageNum) ?? [];
        return createPortal(
          <>
            {/* Transparent click overlay — only shown in sticky-note mode */}
            {stickyToolActive && (
              <div
                className="absolute inset-0 pointer-events-auto"
                style={{ zIndex: 9 }}
                onClick={(e) => handlePageClick(e, pageEl, pageNum)}
              />
            )}

            {pageNotes.map((note) => (
              <StickyNote
                key={note.id}
                note={note}
                pageEl={pageEl}
                readOnly={readOnly}
                autoFocus={!readOnly && note.id === newNoteId}
                onUpdate={readOnly ? undefined : (data) => {
                  if (note.id === newNoteId) setNewNoteId(null);
                  updateMutation.mutate({ id: note.id, ...data });
                }}
                onDelete={readOnly ? undefined : () => deleteMutation.mutate(note.id)}
              />
            ))}
          </>,
          host,
          `sticky-${pageNum}`
        );
      })}
    </>
  );
}
