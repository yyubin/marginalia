"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InfiniteData, useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document, DocumentListResponse, User, UserSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/ui/footer";
import ExportModal from "@/components/ExportModal";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import HelpDrawer from "@/components/onboarding/HelpDrawer";

const WELCOME_KEY = "onboarding_welcome_v1";

// ── Inline title editor ───────────────────────────────────────────────────────

function DocumentTitleEditor({
  doc,
  onRename,
}: {
  doc: Document;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.title);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== doc.title) onRename(trimmed);
    else setDraft(doc.title);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(doc.title); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-sm font-medium border-b border-zinc-400 outline-none bg-transparent py-0.5"
        maxLength={500}
      />
    );
  }

  return (
    <h3
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="클릭하여 제목 편집"
      className="font-medium text-sm truncate cursor-text hover:text-zinc-500 transition-colors"
    >
      {doc.title}
    </h3>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function patchTitleInPages(
  old: InfiniteData<DocumentListResponse> | undefined,
  id: string,
  title: string,
): InfiniteData<DocumentListResponse> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.map((d) => (d.id === id ? { ...d, title } : d)),
    })),
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery<DocumentListResponse>({
    queryKey: ["documents"],
    queryFn: ({ pageParam }) =>
      api
        .get("/documents", { params: { limit: 20, cursor: pageParam ?? undefined } })
        .then((r) => r.data),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: undefined,
  });

  const documents = data?.pages.flatMap((p) => p.items);

  const { data: me } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
  });

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then((r) => r.data),
  });

  const maxDocuments = settings?.max_documents ?? 3;

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<{ id: string; title: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) setShowWelcome(true);
  }, []);

  function dismissWelcome() {
    localStorage.setItem(WELCOME_KEY, "seen");
    setShowWelcome(false);
  }

  function handleWelcomeUpload() {
    dismissWelcome();
    fileInputRef.current?.click();
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post("/documents", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setUploadError(null);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(detail ?? "업로드에 실패했습니다");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/documents/${id}`, { title }).then((r) => r.data as Document),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ["documents"] });
      const prev = queryClient.getQueryData<InfiniteData<DocumentListResponse>>(["documents"]);
      queryClient.setQueryData(["documents"], patchTitleInPages(prev, id, title));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["documents"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    uploadMutation.mutate(file);
    e.target.value = "";
  }

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.clear();
    router.push("/login");
  }

  useEffect(() => {
    if (!localStorage.getItem("is_auth")) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Marginalia</h1>
        <div className="flex items-center gap-3">
          {uploadError && (
            <span className="text-xs text-red-500">{uploadError}</span>
          )}
          <button
            onClick={() => router.push("/search")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            검색
          </button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending || (documents?.length ?? 0) >= maxDocuments}
            title={(documents?.length ?? 0) >= maxDocuments ? `최대 ${maxDocuments}개까지 저장할 수 있습니다` : undefined}
          >
            {uploadMutation.isPending ? "업로드 중..." : `PDF 업로드 (${documents?.length ?? 0}/${maxDocuments})`}
          </Button>
          <Button variant="outline" onClick={() => router.push("/settings")}>
            설정
          </Button>
          {me?.is_admin && (
            <Button variant="outline" onClick={() => router.push("/admin")}>
              관리자
            </Button>
          )}
          <button
            onClick={() => setShowHelp(true)}
            title="도움말"
            className="w-8 h-8 flex items-center justify-center rounded-full border text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            ?
          </button>
          <Button variant="outline" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold mb-4">내 문서</h2>

        {isLoading && <p className="text-gray-500 text-sm">불러오는 중...</p>}

        {documents?.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">아직 문서가 없습니다</p>
            <p className="text-sm mt-1">PDF를 업로드하여 시작하세요</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents?.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow group"
            >
              {/* 썸네일 — 클릭 시 리더로 이동 */}
              <div
                className="h-36 bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer"
                onClick={() => router.push(`/reader/${doc.id}`)}
              >
                {doc.thumbnail_url ? (
                  <img
                    src={doc.thumbnail_url}
                    alt={doc.title}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl">📄</span>
                  </div>
                )}
              </div>

              {/* 제목 — 클릭 시 인라인 편집 */}
              <DocumentTitleEditor
                doc={doc}
                onRename={(title) => renameMutation.mutate({ id: doc.id, title })}
              />

              {/* 메타 정보 — 클릭 시 리더로 이동 */}
              <p
                className="text-xs text-gray-400 mt-1 cursor-pointer"
                onClick={() => router.push(`/reader/${doc.id}`)}
              >
                {doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : "—"}
                {doc.last_opened && ` · 최근 열람: ${new Date(doc.last_opened).toLocaleDateString("ko-KR")}`}
              </p>

              <div className="mt-3 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="text-xs text-gray-400 hover:text-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportTarget({ id: doc.id, title: doc.title });
                  }}
                >
                  내보내기
                </button>
                <button
                  className="text-xs text-red-400 hover:text-red-600 ml-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(doc.id);
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>

        {hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "불러오는 중..." : "더 보기"}
            </Button>
          </div>
        )}
      </main>

      <Footer />

      {exportTarget && (
        <ExportModal
          documentId={exportTarget.id}
          documentTitle={exportTarget.title}
          onClose={() => setExportTarget(null)}
        />
      )}

      {showWelcome && (
        <WelcomeModal onClose={dismissWelcome} onStartUpload={handleWelcomeUpload} />
      )}

      <HelpDrawer open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
