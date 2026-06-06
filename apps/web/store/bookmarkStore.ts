import { create } from "zustand";
import type { Bookmark } from "@/types";

interface BookmarkStore {
  bookmarks: Bookmark[];
  setBookmarks: (bookmarks: Bookmark[]) => void;
  addBookmark: (bookmark: Bookmark) => void;
  updateBookmark: (id: string, updates: Partial<Bookmark>) => void;
  removeBookmark: (id: string) => void;
}

export const useBookmarkStore = create<BookmarkStore>((set) => ({
  bookmarks: [],
  setBookmarks: (bookmarks) => set({ bookmarks }),
  addBookmark: (bookmark) => set((s) => ({ bookmarks: [...s.bookmarks, bookmark] })),
  updateBookmark: (id, updates) =>
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  removeBookmark: (id) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
}));
