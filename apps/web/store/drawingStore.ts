import { create } from "zustand";

import type { DrawingStrokeColor, DrawingToolMode } from "@/types";

export interface PenSettings {
  color: DrawingStrokeColor;
  width: number;
}

interface DrawingStore {
  tool: DrawingToolMode;
  pen: PenSettings;
  highlighter: PenSettings;
  setTool: (tool: DrawingToolMode) => void;
  setPenColor: (color: DrawingStrokeColor) => void;
  setPenWidth: (width: number) => void;
  setHighlighterColor: (color: DrawingStrokeColor) => void;
  setHighlighterWidth: (width: number) => void;
}

export const PEN_WIDTHS = [1.5, 2.5, 4, 6] as const;
export const HIGHLIGHTER_WIDTHS = [8, 12, 18] as const;

export const useDrawingStore = create<DrawingStore>((set) => ({
  tool: "pen",
  pen: { color: "black", width: 2.5 },
  highlighter: { color: "yellow", width: 12 },
  setTool: (tool) => set({ tool }),
  setPenColor: (color) => set((s) => ({ pen: { ...s.pen, color } })),
  setPenWidth: (width) => set((s) => ({ pen: { ...s.pen, width } })),
  setHighlighterColor: (color) => set((s) => ({ highlighter: { ...s.highlighter, color } })),
  setHighlighterWidth: (width) => set((s) => ({ highlighter: { ...s.highlighter, width } })),
}));
