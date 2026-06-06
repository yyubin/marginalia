import { create } from "zustand";
import type { Highlight } from "@/types";

interface HighlightStore {
  highlights: Highlight[];
  selectedHighlight: Highlight | null;
  setHighlights: (highlights: Highlight[]) => void;
  addHighlight: (highlight: Highlight) => void;
  updateHighlight: (id: string, updates: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  selectHighlight: (highlight: Highlight | null) => void;
}

export const useHighlightStore = create<HighlightStore>((set) => ({
  highlights: [],
  selectedHighlight: null,
  setHighlights: (highlights) => set({ highlights }),
  addHighlight: (highlight) => set((s) => ({ highlights: [...s.highlights, highlight] })),
  updateHighlight: (id, updates) =>
    set((s) => ({
      highlights: s.highlights.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    })),
  removeHighlight: (id) => set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) })),
  selectHighlight: (highlight) => set({ selectedHighlight: highlight }),
}));
