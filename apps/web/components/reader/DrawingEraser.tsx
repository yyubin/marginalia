"use client";

import { useRef } from "react";

import { hitStroke } from "@/lib/drawingGeometry";
import type { RenderableDrawingStroke } from "@/types";

interface Props {
  pageEl: HTMLElement;
  strokes: RenderableDrawingStroke[];
  hoveredIds: Set<string>;
  onHover: (next: Set<string>) => void;
  onErase: (ids: string[]) => void;
}

// Radius in page-percent units. ~1.6% feels right at common page widths;
// tweaks here propagate to every zoom level because all coords are normalized.
const ERASE_RADIUS_PCT = 1.6;

export default function DrawingEraser({
  pageEl,
  strokes,
  hoveredIds,
  onHover,
  onErase,
}: Props) {
  const draggingRef = useRef(false);
  const localSetRef = useRef<Set<string>>(new Set());

  function toPagePct(e: React.PointerEvent): [number, number] {
    const rect = pageEl.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * 100,
      ((e.clientY - rect.top) / rect.height) * 100,
    ];
  }

  function tagHits(mx: number, my: number) {
    let changed = false;
    for (const s of strokes) {
      if (localSetRef.current.has(s.id)) continue;
      if (hitStroke(s.points, mx, my, ERASE_RADIUS_PCT + s.width * 0.1)) {
        localSetRef.current.add(s.id);
        changed = true;
      }
    }
    if (changed) onHover(new Set(localSetRef.current));
  }

  function start(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    // Seed with any strokes already under the cursor at pointerdown so a quick
    // tap (no movement) still erases what was clicked.
    localSetRef.current = new Set(hoveredIds);
    const [mx, my] = toPagePct(e);
    tagHits(mx, my);
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) {
      // Show hover preview even before dragging — single id at a time.
      const [mx, my] = toPagePct(e);
      const previewHit = strokes.find((s) =>
        hitStroke(s.points, mx, my, ERASE_RADIUS_PCT + s.width * 0.1),
      );
      onHover(previewHit ? new Set([previewHit.id]) : new Set());
      return;
    }
    e.preventDefault();
    const [mx, my] = toPagePct(e);
    tagHits(mx, my);
  }

  function end(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) {
      onHover(new Set());
      return;
    }
    draggingRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const ids = Array.from(localSetRef.current);
    localSetRef.current = new Set();
    onHover(new Set());
    if (ids.length > 0) onErase(ids);
  }

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "auto", touchAction: "none", cursor: "crosshair" }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    />
  );
}
