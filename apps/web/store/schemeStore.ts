import { create } from "zustand";
import type { CollectionItem } from "@/types";

interface SchemeStore {
  items: CollectionItem[];
  setItems: (items: CollectionItem[]) => void;
  addItem: (item: CollectionItem) => void;
  removeItem: (id: string) => void;
  reorder: (items: CollectionItem[]) => void;
  copyAll: () => void;
  clear: () => void;
}

export const useSchemeStore = create<SchemeStore>((set, get) => ({
  items: [],
  setItems: (items) => set({ items }),
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  reorder: (items) => set({ items }),
  copyAll: () => {
    const text = get()
      .items.sort((a, b) => a.position - b.position)
      .map((i) => i.highlight.content.text ?? "")
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text);
  },
  clear: () => set({ items: [] }),
}));
