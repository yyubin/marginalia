"use client";

import type { RenderableDrawingStroke } from "@/types";

export const DRAWING_COLOR_HEX: Record<string, string> = {
  black: "#111111",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
};

interface Props {
  strokes: RenderableDrawingStroke[];
}

function strokeToPath(points: number[][]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`)
    .join(" ");
}

export default function DrawingSvg({ strokes }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {strokes.map((s) => (
        <path
          key={s.id}
          d={strokeToPath(s.points)}
          stroke={DRAWING_COLOR_HEX[s.color] ?? "#111"}
          strokeWidth={s.width}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
