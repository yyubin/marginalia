"use client";

import type { DrawingTool, RenderableDrawingStroke } from "@/types";

export const DRAWING_COLOR_HEX: Record<string, string> = {
  black: "#111111",
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#eab308",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
};

export const TOOL_OPACITY: Record<DrawingTool, number> = {
  pen: 1,
  highlighter: 0.35,
};

export const TOOL_LINECAP: Record<DrawingTool, "round" | "butt"> = {
  pen: "round",
  highlighter: "butt",
};

interface Props {
  strokes: RenderableDrawingStroke[];
  hoveredIds?: Set<string>;
}

function strokeToPath(points: number[][]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`)
    .join(" ");
}

export default function DrawingSvg({ strokes, hoveredIds }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {strokes.map((s) => {
        const base = TOOL_OPACITY[s.tool] ?? 1;
        const hovered = hoveredIds?.has(s.id) ?? false;
        return (
          <path
            key={s.id}
            d={strokeToPath(s.points)}
            stroke={DRAWING_COLOR_HEX[s.color] ?? "#111"}
            strokeWidth={s.width}
            strokeOpacity={hovered ? base * 0.25 : base}
            fill="none"
            strokeLinecap={TOOL_LINECAP[s.tool] ?? "round"}
            strokeLinejoin={s.tool === "highlighter" ? "miter" : "round"}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
