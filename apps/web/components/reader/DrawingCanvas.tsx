"use client";

import { useEffect, useRef } from "react";

import type { DrawingStrokeColor } from "@/types";
import { DRAWING_COLOR_HEX } from "./DrawingSvg";

interface Props {
  pageEl: HTMLElement;
  color: DrawingStrokeColor;
  width: number;
  onStrokeComplete: (points: number[][]) => void;
}

export default function DrawingCanvas({ pageEl, color, width, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<number[][]>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Size canvas to match the PDF page in CSS px and devicePixelRatio. The
  // re-sync runs on mount and on ResizeObserver hits so zoom changes after the
  // tool was activated don't leave the canvas with stale dimensions.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = () => {
      const rect = pageEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(pageEl);
    return () => ro.disconnect();
  }, [pageEl]);

  function startStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!e.isPrimary) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pointsRef.current = [];

    const rect = pageEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    pointsRef.current.push([(x / rect.width) * 100, (y / rect.height) * 100, pressure]);
    lastRef.current = { x, y };

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = DRAWING_COLOR_HEX[color] ?? "#111";
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  function extendStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = pageEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    pointsRef.current.push([(x / rect.width) * 100, (y / rect.height) * 100, pressure]);

    if (lastRef.current) {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    lastRef.current = { x, y };
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current!;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const points = pointsRef.current.slice();
    pointsRef.current = [];
    lastRef.current = null;

    // Clear canvas; committed SVG layer takes over visually.
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length >= 2) onStrokeComplete(points);
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ pointerEvents: "auto", touchAction: "none", cursor: "crosshair" }}
      onPointerDown={startStroke}
      onPointerMove={extendStroke}
      onPointerUp={endStroke}
      onPointerLeave={endStroke}
      onPointerCancel={endStroke}
    />
  );
}
