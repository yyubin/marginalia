"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { UserSettings } from "@/types";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("access_token")) router.push("/login");
  }, [router]);

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then((r) => r.data),
  });

  const initialPerPage = settings?.highlights_per_page ?? 50;

  return (
    <SettingsForm
      key={initialPerPage}
      initialPerPage={initialPerPage}
      maxDocuments={settings?.max_documents}
      maxFileSizeMb={settings?.max_file_size_mb}
      isLoading={isLoading}
      onBack={() => router.push("/dashboard")}
    />
  );
}

function SettingsForm({
  initialPerPage,
  maxDocuments,
  maxFileSizeMb,
  isLoading,
  onBack,
}: {
  initialPerPage: number;
  maxDocuments?: number;
  maxFileSizeMb?: number;
  isLoading: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [perPage, setPerPage] = useState<number>(initialPerPage);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (highlights_per_page: number) =>
      api.patch("/settings", { highlights_per_page }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-black"
        >
          ← 대시보드
        </button>
        <h1 className="text-sm font-semibold">설정</h1>
      </header>

      <div className="max-w-xl mx-auto py-10 px-6 space-y-8">
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-sm font-semibold">리더 설정</h2>

          <div className="space-y-2">
            <label className="text-sm text-gray-700">
              패널 당 최대 하이라이트 수
              <span className="text-xs text-gray-400 ml-2">
                (PDF 현재 페이지 기준으로 한 번에 불러올 하이라이트 개수)
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                disabled={isLoading}
              />
              <span className="text-xs text-gray-400">개 (10 ~ 500)</span>
            </div>
            <p className="text-xs text-gray-400">
              문서에 하이라이트가 많을 경우 낮게 설정하면 성능이 향상됩니다.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              size="sm"
              onClick={() => mutation.mutate(perPage)}
              disabled={mutation.isPending || perPage < 10 || perPage > 500}
            >
              저장
            </Button>
            {saved && <span className="text-xs text-green-500">저장되었습니다</span>}
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 space-y-3">
          <h2 className="text-sm font-semibold">업로드 한도</h2>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>저장 가능한 PDF 개수</span>
            <span className="font-medium">{maxDocuments ?? "-"}개</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>파일 당 최대 용량</span>
            <span className="font-medium">{maxFileSizeMb ?? "-"}MB</span>
          </div>
        </section>
      </div>
    </div>
  );
}
