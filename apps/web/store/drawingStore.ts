import { create } from "zustand";

import type { DrawingStrokeColor } from "@/types";

interface DrawingStore {
  color: DrawingStrokeColor;
  width: number;
  setColor: (color: DrawingStrokeColor) => void;
  setWidth: (width: number) => void;
}

export const useDrawingStore = create<DrawingStore>((set) => ({
  color: "black",
  width: 2.0,
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),
}));
