import { create } from "zustand";

export type ActiveTool = "select" | "sticky-note";

interface ReaderStore {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  toggleStickyNoteTool: () => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
  activeTool: "select",
  setActiveTool: (activeTool) => set({ activeTool }),
  toggleStickyNoteTool: () =>
    set((s) => ({ activeTool: s.activeTool === "sticky-note" ? "select" : "sticky-note" })),
}));
