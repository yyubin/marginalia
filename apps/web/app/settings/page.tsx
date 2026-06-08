"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/ui/footer";
import type { User, UserSettings } from "@/types";

const LLM_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (ChatGPT)",
  google: "Google (Gemini)",
};
const LLM_PROVIDERS = Object.keys(LLM_PROVIDER_LABELS);

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("is_auth")) router.push("/login");
  }, [router]);

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings").then((r) => r.data),
  });

  const { data: me } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
    staleTime: 1000 * 60 * 5,
  });

  const initialPerPage = settings?.highlights_per_page ?? 50;

  return (
    <SettingsForm
      key={initialPerPage}
      initialPerPage={initialPerPage}
      settings={settings}
      isLoading={isLoading}
      provider={me?.provider}
      onBack={() => router.push("/dashboard")}
    />
  );
}

function SettingsForm({
  initialPerPage,
  settings,
  isLoading,
  provider,
  onBack,
}: {
  initialPerPage: number;
  settings?: UserSettings;
  isLoading: boolean;
  provider?: string;
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
            <span className="font-medium">{settings?.max_documents ?? "-"}개</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>파일 당 최대 용량</span>
            <span className="font-medium">{settings?.max_file_size_mb ?? "-"}MB</span>
          </div>
        </section>

        <LLMKeysSection settings={settings} isLoading={isLoading} />

        {provider === "email" && <ChangePasswordSection />}
      </div>

      <Footer />
    </div>
  );
}

function LLMKeysSection({ settings, isLoading }: { settings?: UserSettings; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["settings"] });

  const registerMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      api.put(`/settings/llm-keys/${provider}`, { api_key: apiKey }),
    onSuccess: (_data, { provider }) => {
      setDraftKeys((prev) => ({ ...prev, [provider]: "" }));
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "키 등록에 실패했습니다";
      setError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (provider: string) => api.delete(`/settings/llm-keys/${provider}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
  });

  const defaultProviderMutation = useMutation({
    mutationFn: (provider: string | null) => api.put("/settings/llm-provider", { provider }),
    onSuccess: () => invalidate(),
  });

  const llmKeys = settings?.llm_keys ?? [];
  const keyByProvider = Object.fromEntries(llmKeys.map((k) => [k.provider, k]));

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">번역 LLM API 키</h2>
        <p className="text-xs text-gray-400 mt-1">
          번역 기능을 사용하려면 직접 발급받은 API 키를 등록해야 합니다. 서버 공용 키로의 자동 폴백은
          기본적으로 제공되지 않으며, 키를 등록하지 않으면{" "}
          {settings?.llm_fallback_allowed
            ? "관리자가 이 계정에 한해 예외적으로 서버 공용 키 사용을 허용해두어 해당 키로 번역이 동작합니다."
            : "번역 기능을 사용할 수 없습니다."}
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="space-y-3">
        {LLM_PROVIDERS.map((provider) => {
          const registered = keyByProvider[provider];
          return (
            <div key={provider} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{LLM_PROVIDER_LABELS[provider]}</span>
                {registered ? (
                  <span className="text-xs text-gray-400 font-mono">{registered.key_preview}</span>
                ) : (
                  <span className="text-xs text-gray-300">미등록</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="API 키 입력"
                  value={draftKeys[provider] ?? ""}
                  onChange={(e) => setDraftKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                  disabled={isLoading}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draftKeys[provider] || registerMutation.isPending}
                  onClick={() =>
                    registerMutation.mutate({ provider, apiKey: draftKeys[provider] })
                  }
                >
                  {registered ? "교체" : "등록"}
                </Button>
                {registered && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(provider)}
                  >
                    삭제
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 pt-2 border-t">
        <label className="text-sm text-gray-700">번역 시 사용할 기본 provider</label>
        <select
          value={settings?.default_llm_provider ?? ""}
          onChange={(e) => defaultProviderMutation.mutate(e.target.value || null)}
          disabled={isLoading || defaultProviderMutation.isPending}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
        >
          <option value="">선택 안 함 (기본값: Anthropic)</option>
          {LLM_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {LLM_PROVIDER_LABELS[provider]}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  const checks = [
    password.length >= 8,
    /[a-zA-Z]/.test(password),
    /[0-9]/.test(password),
    password.length >= 12,
    /[^a-zA-Z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 2) return { score, label: "약함", color: "bg-red-400" };
  if (score <= 3) return { score, label: "보통", color: "bg-yellow-400" };
  if (score <= 4) return { score, label: "강함", color: "bg-green-500" };
  return { score, label: "매우 강함", color: "bg-green-400" };
}

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(next);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 401) {
        setError("현재 비밀번호가 올바르지 않습니다.");
      } else {
        setError(detail ?? "비밀번호 변경에 실패했습니다.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setError(null);
    setSuccess(false);
    mutation.mutate();
  };

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <h2 className="text-sm font-semibold">비밀번호 변경</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm text-gray-700">현재 비밀번호</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-700">새 비밀번호</label>
          <input
            type="password"
            placeholder="영문·숫자 포함 8자 이상"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
          {next && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= strength.score ? strength.color : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs ${strength.score <= 2 ? "text-red-500" : strength.score <= 3 ? "text-yellow-500" : "text-green-600"}`}>
                {strength.label}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-700">새 비밀번호 확인</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <Button
            size="sm"
            type="submit"
            disabled={mutation.isPending}
          >
            변경
          </Button>
          {success && <span className="text-xs text-green-500">비밀번호가 변경되었습니다</span>}
        </div>
      </form>
    </section>
  );
}
