"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSchemeStore } from "@/store/schemeStore";
import type { Highlight } from "@/types";

interface Props {
  documentId: string;
  onHighlightClick: (highlight: Highlight) => void;
}

export default function SchemePanel({ documentId, onHighlightClick }: Props) {
  const { items, removeItem, copyAll } = useSchemeStore();
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/collection/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collection", documentId] }),
  });

  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col border-b" style={{ maxHeight: "50%" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold">스킴패널</h2>
        <button onClick={copyAll} className="text-xs text-gray-500 hover:text-black">
          전체 복사
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y">
        {sorted.length === 0 && (
          <p className="text-xs text-gray-400 p-4 text-center">
            텍스트를 드래그하여 스킴패널에 추가하세요
          </p>
        )}
        {sorted.map((item, idx) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className="w-full text-left px-4 py-3 flex gap-2 group hover:bg-gray-50 cursor-pointer"
            onClick={() => onHighlightClick(item.highlight)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onHighlightClick(item.highlight);
            }}
          >
            <span className="text-xs text-gray-300 shrink-0 mt-0.5">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 leading-relaxed">{item.highlight.content.text}</p>
              <span className="text-[10px] text-gray-400 mt-0.5 block">
                p. {(item.highlight.position as { pageNumber: number }).pageNumber}
              </span>
            </div>
            <button
              className="text-xs text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.id);
                removeMutation.mutate(item.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
