"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { useSchemeStore } from "@/store/schemeStore";
import type { Collection, CollectionItem, Highlight } from "@/types";

interface Props {
  documentId: string;
  onHighlightClick: (highlight: Highlight) => void;
}

export default function SchemePanel({ documentId, onHighlightClick }: Props) {
  const { items, setItems, removeItem, reorder, copyAll } = useSchemeStore();
  const queryClient = useQueryClient();
  const [pageFromInput, setPageFromInput] = useState("");
  const [pageToInput, setPageToInput] = useState("");
  const [activeRange, setActiveRange] = useState<{ from?: number; to?: number } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const collectionParams = useMemo(() => {
    if (!activeRange) return undefined;
    return {
      ...(activeRange.from ? { page_from: activeRange.from } : {}),
      ...(activeRange.to ? { page_to: activeRange.to } : {}),
    };
  }, [activeRange]);

  const { data: collectionData, isFetching } = useQuery<Collection>({
    queryKey: ["collection", documentId, activeRange],
    queryFn: () =>
      api.get(`/documents/${documentId}/collection`, { params: collectionParams }).then((r) => r.data),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (collectionData?.items) setItems(collectionData.items);
  }, [collectionData, setItems]);

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/collection/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collection", documentId] }),
  });

  const sorted = [...items].sort((a, b) => a.position - b.position);
  const hasActiveRange = Boolean(activeRange?.from || activeRange?.to);
  const canReorder = !hasActiveRange && sorted.length > 1;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const reorderMutation = useMutation({
    mutationFn: (nextItems: CollectionItem[]) =>
      api.patch<Collection>(`/documents/${documentId}/collection/items`, {
        items: nextItems.map((item) => ({ id: item.id, position: item.position })),
      }),
    onSuccess: ({ data }) => {
      setItems(data.items);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", documentId] });
    },
  });

  function parsePageValue(value: string) {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return parsed;
  }

  function applyRange() {
    const from = parsePageValue(pageFromInput);
    const to = parsePageValue(pageToInput);

    if (from === null || to === null) {
      setRangeError("1 이상의 정수만 입력하세요");
      return;
    }
    if (from !== undefined && to !== undefined && from > to) {
      setRangeError("시작 페이지는 끝 페이지보다 클 수 없습니다");
      return;
    }

    setRangeError(null);
    setActiveRange(from || to ? { from, to } : null);
  }

  function resetRange() {
    setPageFromInput("");
    setPageToInput("");
    setRangeError(null);
    setActiveRange(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canReorder) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((item) => item.id === active.id);
    const newIndex = sorted.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex).map((item, index) => ({
      ...item,
      position: index + 1,
    }));

    reorder(reordered);
    reorderMutation.mutate(reordered);
  }

  return (
    <div className="flex flex-col border-b" style={{ maxHeight: "50%" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">스킴패널</h2>
          {hasActiveRange && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              p. {activeRange?.from ?? 1} - {activeRange?.to ?? "끝"}
            </p>
          )}
        </div>
        <button onClick={copyAll} className="text-xs text-gray-500 hover:text-black">
          {hasActiveRange ? "범위 복사" : "전체 복사"}
        </button>
      </div>

      <form
        className="px-4 py-2 border-b bg-gray-50"
        onSubmit={(e) => {
          e.preventDefault();
          applyRange();
        }}
      >
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={pageFromInput}
            onChange={(e) => setPageFromInput(e.target.value)}
            placeholder="시작"
            className="w-16 h-7 rounded border border-gray-200 bg-white px-2 text-xs outline-none focus:border-gray-400"
            aria-label="스킴패널 시작 페이지"
          />
          <span className="text-xs text-gray-400">-</span>
          <input
            type="number"
            min={1}
            value={pageToInput}
            onChange={(e) => setPageToInput(e.target.value)}
            placeholder="끝"
            className="w-16 h-7 rounded border border-gray-200 bg-white px-2 text-xs outline-none focus:border-gray-400"
            aria-label="스킴패널 끝 페이지"
          />
          <button
            type="submit"
            disabled={isFetching}
            className="h-7 px-2 rounded bg-gray-900 text-white text-xs hover:bg-black disabled:opacity-40"
          >
            적용
          </button>
          <button
            type="button"
            onClick={resetRange}
            disabled={!hasActiveRange && !pageFromInput && !pageToInput}
            className="h-7 px-2 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
          >
            초기화
          </button>
        </div>
        {rangeError && <p className="mt-1 text-[10px] text-red-500">{rangeError}</p>}
      </form>

      <div className="flex-1 overflow-y-auto divide-y">
        {sorted.length === 0 && (
          <p className="text-xs text-gray-400 p-4 text-center">
            {hasActiveRange
              ? "선택한 페이지 범위에 스킴 항목이 없습니다"
              : "텍스트를 드래그하여 스킴패널에 추가하세요"}
          </p>
        )}
        {hasActiveRange && sorted.length > 1 && (
          <p className="px-4 py-1.5 text-[10px] text-gray-400 bg-gray-50">
            순서 변경은 전체 보기에서 가능합니다
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            {sorted.map((item, idx) => (
              <SortableSchemeItem
                key={item.id}
                item={item}
                index={idx}
                canReorder={canReorder}
                onHighlightClick={onHighlightClick}
                onRemove={(itemId) => {
                  removeItem(itemId);
                  removeMutation.mutate(itemId);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortableSchemeItem({
  item,
  index,
  canReorder,
  onHighlightClick,
  onRemove,
}: {
  item: CollectionItem;
  index: number;
  canReorder: boolean;
  onHighlightClick: (highlight: Highlight) => void;
  onRemove: (itemId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      className={`w-full text-left px-4 py-3 flex gap-2 group hover:bg-gray-50 cursor-pointer ${
        isDragging ? "bg-white shadow-sm relative z-10" : ""
      }`}
      onClick={() => onHighlightClick(item.highlight)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onHighlightClick(item.highlight);
      }}
    >
      <button
        type="button"
        className="w-5 h-5 -ml-1 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300 shrink-0 cursor-grab disabled:cursor-default"
        disabled={!canReorder}
        aria-label="스킴 항목 순서 변경"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs text-gray-300 shrink-0 mt-0.5">{index + 1}</span>
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
          onRemove(item.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
