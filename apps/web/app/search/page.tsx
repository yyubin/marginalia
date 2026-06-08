"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SearchResponse, SearchResultItem } from "@/types";
import { Button } from "@/components/ui/button";

const TYPE_LABELS = {
  all: "전체",
  highlight: "하이라이트",
  note: "노트",
} as const;

type SearchType = keyof typeof TYPE_LABELS;

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  yellow: "bg-yellow-200",
  green: "bg-green-200",
  blue: "bg-blue-200",
  pink: "bg-pink-200",
  purple: "bg-purple-200",
};

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!localStorage.getItem("is_auth")) router.push("/login");
  }, [router]);

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [committed, setCommitted] = useState(searchParams.get("q") ?? "");
  const [type, setType] = useState<SearchType>("all");
  const [offset, setOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const LIMIT = 20;

  const { data, isLoading, isFetching } = useQuery<SearchResponse>({
    queryKey: ["search", committed, type, offset],
    queryFn: () =>
      api
        .get("/search", { params: { q: committed, type, limit: LIMIT, offset } })
        .then((r) => r.data),
    enabled: committed.length >= 2,
    placeholderData: (prev) => prev,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.length < 2) return;
    setOffset(0);
    setCommitted(q);
  }

  function handleTypeChange(t: SearchType) {
    setType(t);
    setOffset(0);
  }

  const items = data?.items ?? [];
  const hasMore = data?.has_more ?? false;
  const showResults = committed.length >= 2;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-black"
        >
          ← 대시보드
        </button>
        <h1 className="text-sm font-semibold">검색</h1>
      </header>

      <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
        {/* 검색 입력 */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="하이라이트, 노트 검색 (2자 이상)"
            autoFocus
            className="flex-1 border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
          <Button type="submit" disabled={q.length < 2}>
            검색
          </Button>
        </form>

        {/* 타입 필터 */}
        {showResults && (
          <div className="flex gap-2">
            {(Object.keys(TYPE_LABELS) as SearchType[]).map((t) => (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  type === t
                    ? "bg-black text-white"
                    : "bg-white border text-gray-600 hover:bg-gray-50"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        {/* 상태 메시지 */}
        {!showResults && (
          <p className="text-sm text-gray-400 text-center py-16">
            검색어를 입력하세요
          </p>
        )}

        {showResults && (isLoading || isFetching) && items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-16">검색 중...</p>
        )}

        {showResults && !isLoading && items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-16">
            &quot;{committed}&quot; 에 대한 결과가 없습니다
          </p>
        )}

        {/* 결과 목록 */}
        <div className="space-y-3">
          {items.map((item) => (
            <SearchCard
              key={`${item.type}-${item.id}`}
              item={item}
              query={committed}
              onOpen={() => router.push(`/reader/${item.document_id}`)}
            />
          ))}
        </div>

        {/* 페이지네이션 */}
        {showResults && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
            >
              이전
            </Button>
            <span className="text-xs text-gray-400">
              {offset + 1} – {offset + items.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset((o) => o + LIMIT)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function SearchCard({
  item,
  query,
  onOpen,
}: {
  item: SearchResultItem;
  query: string;
  onOpen: () => void;
}) {
  const colorClass =
    item.type === "highlight" && item.color
      ? HIGHLIGHT_COLOR_MAP[item.color] ?? "bg-yellow-200"
      : "";

  return (
    <div
      className="bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow cursor-pointer space-y-2"
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.type === "highlight" ? (
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorClass}`}
            />
          ) : (
            <span className="text-xs text-gray-400 flex-shrink-0">📝</span>
          )}
          <span className="text-xs text-gray-500 truncate">{item.document_title}</span>
        </div>
        <span
          className={`text-xs flex-shrink-0 px-2 py-0.5 rounded-full ${
            item.type === "highlight"
              ? "bg-yellow-50 text-yellow-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {item.type === "highlight" ? "하이라이트" : "노트"}
        </span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed line-clamp-3">
        {highlight(item.content_text, query)}
      </p>

      <p className="text-xs text-gray-400">
        {new Date(item.created_at).toLocaleDateString("ko-KR")}
      </p>
    </div>
  );
}
