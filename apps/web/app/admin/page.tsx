"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/ui/footer";
import type {
  User,
  AdminStats,
  AdminUserListResponse,
  AdminUserListItem,
  AdminUserDetail,
} from "@/types";

const PAGE_SIZE = 20;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function AdminPage() {
  const router = useRouter();

  const { data: me, isLoading: meLoading } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
  });

  useEffect(() => {
    if (!localStorage.getItem("is_auth")) {
      router.replace("/login");
      return;
    }
    if (!meLoading && me && !me.is_admin) {
      router.replace("/dashboard");
    }
  }, [me, meLoading, router]);

  if (meLoading || !me?.is_admin) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">로딩 중...</div>;
  }

  return <AdminDashboard onBack={() => router.push("/dashboard")} />;
}

function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/admin/stats").then((r) => r.data),
  });

  const { data: userList, isLoading: usersLoading } = useQuery<AdminUserListResponse>({
    queryKey: ["admin-users", search, page],
    queryFn: () =>
      api
        .get("/admin/users", { params: { q: search || undefined, page, page_size: PAGE_SIZE } })
        .then((r) => r.data),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-black">
          ← 대시보드
        </button>
        <h1 className="text-sm font-semibold">관리자</h1>
      </header>

      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        {stats && <StatsSection stats={stats} />}

        <section className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">유저 관리</h2>
            <input
              type="text"
              placeholder="이메일 또는 이름 검색"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-64 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>

          <UserTable
            items={userList?.items ?? []}
            isLoading={usersLoading}
            onSelect={(id) => setSelectedUserId(id)}
          />

          {userList && userList.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
              <span>
                전체 {userList.total}명 중 {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, userList.total)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  이전
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * PAGE_SIZE >= userList.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedUserId && (
        <UserDetailPanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}

      <Footer />
    </div>
  );
}

function StatsSection({ stats }: { stats: AdminStats }) {
  const cards = [
    { label: "전체 유저", value: stats.total_users.toLocaleString() },
    { label: "최근 7일 가입", value: stats.signups_last_7_days.toLocaleString() },
    { label: "전체 문서", value: stats.total_documents.toLocaleString() },
    { label: "최근 7일 업로드", value: stats.new_documents_last_7_days.toLocaleString() },
    { label: "전체 스토리지", value: formatBytes(stats.total_storage_bytes) },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-400">{c.label}</p>
          <p className="text-lg font-semibold mt-1">{c.value}</p>
        </div>
      ))}
    </section>
  );
}

function UserTable({
  items,
  isLoading,
  onSelect,
}: {
  items: AdminUserListItem[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) return <p className="text-sm text-gray-400 py-6 text-center">불러오는 중...</p>;
  if (items.length === 0) return <p className="text-sm text-gray-400 py-6 text-center">유저가 없습니다</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b">
            <th className="py-2 pr-4 font-medium">이메일</th>
            <th className="py-2 pr-4 font-medium">이름</th>
            <th className="py-2 pr-4 font-medium">제공자</th>
            <th className="py-2 pr-4 font-medium">문서 수</th>
            <th className="py-2 pr-4 font-medium">상태</th>
            <th className="py-2 pr-4 font-medium">가입일</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr
              key={u.id}
              onClick={() => onSelect(u.id)}
              className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
            >
              <td className="py-2 pr-4">{u.email}</td>
              <td className="py-2 pr-4">{u.name ?? "-"}</td>
              <td className="py-2 pr-4">{u.provider}</td>
              <td className="py-2 pr-4">{u.document_count}</td>
              <td className="py-2 pr-4">
                <div className="flex gap-1.5">
                  {u.is_admin && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">관리자</span>
                  )}
                  {u.is_suspended && (
                    <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">정지됨</span>
                  )}
                  {!u.is_admin && !u.is_suspended && <span className="text-xs text-gray-400">-</span>}
                </div>
              </td>
              <td className="py-2 pr-4 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDetailPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ["admin-user", userId],
    queryFn: () => api.get(`/admin/users/${userId}`).then((r) => r.data),
  });

  const [maxDocuments, setMaxDocuments] = useState<string>("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<string>("");

  useEffect(() => {
    if (detail) {
      setMaxDocuments(String(detail.max_documents));
      setMaxFileSizeMb(String(detail.max_file_size_mb));
    }
  }, [detail]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  const limitsMutation = useMutation({
    mutationFn: (body: { max_documents: number | null; max_file_size_mb: number | null }) =>
      api.patch(`/admin/users/${userId}/limits`, body),
    onSuccess: invalidate,
  });

  const llmFallbackMutation = useMutation({
    mutationFn: (llm_fallback_allowed: boolean | null) =>
      api.patch(`/admin/users/${userId}/llm-fallback`, { llm_fallback_allowed }),
    onSuccess: invalidate,
  });

  const suspendMutation = useMutation({
    mutationFn: (suspend: boolean) =>
      api.post(`/admin/users/${userId}/${suspend ? "suspend" : "unsuspend"}`),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  function handleSaveLimits() {
    limitsMutation.mutate({
      max_documents: maxDocuments.trim() === "" ? null : Number(maxDocuments),
      max_file_size_mb: maxFileSizeMb.trim() === "" ? null : Number(maxFileSizeMb),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">유저 상세</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-black">
            닫기
          </button>
        </div>

        {isLoading || !detail ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{detail.email}</p>
              <p className="text-xs text-gray-400">
                {detail.name ?? "이름 없음"} · {detail.provider} ·{" "}
                {new Date(detail.created_at).toLocaleDateString()} 가입
              </p>
              <div className="flex gap-1.5 pt-1">
                {detail.is_admin && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">관리자</span>
                )}
                {detail.is_suspended && (
                  <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">정지됨</span>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <h3 className="text-xs font-semibold text-gray-500">문서 ({detail.documents.length})</h3>
              <p className="text-xs text-gray-400">전체 스토리지: {formatBytes(detail.total_storage_bytes)}</p>
              {detail.documents.length > 0 ? (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {detail.documents.map((d) => (
                    <li key={d.id} className="flex justify-between text-xs text-gray-600 border-b py-1 last:border-0">
                      <span className="truncate pr-2">{d.title}</span>
                      <span className="text-gray-400 shrink-0">{formatBytes(d.file_size ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">문서 없음</p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500">업로드 한도 (override)</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-28">최대 문서 수</label>
                <input
                  type="number"
                  min={1}
                  value={maxDocuments}
                  onChange={(e) => setMaxDocuments(e.target.value)}
                  placeholder="기본값"
                  className="w-24 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-28">최대 용량 (MB)</label>
                <input
                  type="number"
                  min={1}
                  value={maxFileSizeMb}
                  onChange={(e) => setMaxFileSizeMb(e.target.value)}
                  placeholder="기본값"
                  className="w-24 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <p className="text-xs text-gray-400">비워두면 전역 기본값을 따릅니다.</p>
              <Button size="sm" onClick={handleSaveLimits} disabled={limitsMutation.isPending}>
                저장
              </Button>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-xs font-semibold text-gray-500">번역 LLM</h3>
              <p className="text-xs text-gray-600">
                등록된 키:{" "}
                {detail.llm_providers_configured.length > 0
                  ? detail.llm_providers_configured.join(", ")
                  : "없음"}
              </p>
              <p className="text-xs text-gray-600">
                서버 공용 키 폴백: <span className="font-medium">{detail.llm_fallback_allowed ? "허용" : "허용 안 함"}</span>
              </p>
              <p className="text-xs text-gray-400">
                전역 기본값은 &quot;허용 안 함&quot;입니다. 키를 등록하지 않은 사용자는 기본적으로
                번역 기능을 사용할 수 없으며, 이 계정에 한해 서버 공용 키 사용을 예외적으로 허용하려면
                위에서 별도로 설정해야 합니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={llmFallbackMutation.isPending}
                  onClick={() => llmFallbackMutation.mutate(true)}
                >
                  허용으로 설정
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={llmFallbackMutation.isPending}
                  onClick={() => llmFallbackMutation.mutate(false)}
                >
                  허용 안 함으로 설정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={llmFallbackMutation.isPending}
                  onClick={() => llmFallbackMutation.mutate(null)}
                >
                  전역 기본값으로 재설정
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-xs font-semibold text-gray-500">계정 관리</h3>
              <div className="flex flex-wrap gap-2">
                {detail.is_suspended ? (
                  <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate(false)}>
                    정지 해제
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate(true)}>
                    계정 정지
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`${detail.email} 계정을 영구 삭제하시겠습니까? 모든 문서와 데이터가 함께 삭제됩니다.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  계정 삭제
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
