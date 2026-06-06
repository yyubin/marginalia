"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBookmarkStore } from "@/store/bookmarkStore";
import type { Bookmark } from "@/types";

interface Props {
  documentId: string;
  currentPage: number;
  onNavigate: (page: number) => void;
}

export default function BookmarkPanel({ documentId, currentPage, onNavigate }: Props) {
  const queryClient = useQueryClient();
  const { bookmarks, addBookmark, updateBookmark, removeBookmark } = useBookmarkStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const isCurrentPageBookmarked = bookmarks.some((b) => b.page === currentPage);

  const createMutation = useMutation({
    mutationFn: (page: number) =>
      api.post<Bookmark>(`/documents/${documentId}/bookmarks`, { page }).then((r) => r.data),
    onSuccess: (bookmark) => {
      addBookmark(bookmark);
      queryClient.invalidateQueries({ queryKey: ["bookmarks", documentId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) =>
      api.patch<Bookmark>(`/bookmarks/${id}`, { label }).then((r) => r.data),
    onSuccess: (bookmark) => {
      updateBookmark(bookmark.id, { label: bookmark.label });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookmarks/${id}`),
    onSuccess: (_, id) => {
      removeBookmark(id);
      queryClient.invalidateQueries({ queryKey: ["bookmarks", documentId] });
    },
  });

  function startEdit(bookmark: Bookmark) {
    setEditingId(bookmark.id);
    setEditLabel(bookmark.label ?? "");
  }

  function submitEdit(id: string) {
    updateMutation.mutate({ id, label: editLabel.trim() || null });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold">북마크</h2>
        <button
          onClick={() => !isCurrentPageBookmarked && createMutation.mutate(currentPage)}
          disabled={isCurrentPageBookmarked || createMutation.isPending || currentPage < 1}
          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
          title={isCurrentPageBookmarked ? "이미 북마크된 페이지입니다" : `${currentPage}페이지 북마크 추가`}
        >
          {isCurrentPageBookmarked ? "★ 북마크됨" : "☆ 현재 페이지"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8 px-4">
            북마크가 없습니다. 위 버튼으로 현재 페이지를 추가하세요.
          </p>
        ) : (
          <ul className="divide-y">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="group px-4 py-2.5 hover:bg-gray-50">
                {editingId === bookmark.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitEdit(bookmark.id);
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder={`Page ${bookmark.page}`}
                      className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onNavigate(bookmark.page)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="text-xs font-medium text-gray-700 block truncate">
                        {bookmark.label ?? `Page ${bookmark.page}`}
                      </span>
                      {bookmark.label && (
                        <span className="text-[10px] text-gray-400">p. {bookmark.page}</span>
                      )}
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => startEdit(bookmark)}
                        className="text-[10px] text-gray-400 hover:text-gray-700"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(bookmark.id)}
                        disabled={deleteMutation.isPending}
                        className="text-[10px] text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
