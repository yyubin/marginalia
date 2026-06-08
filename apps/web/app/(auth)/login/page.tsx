"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: "Google 로그인이 취소되었습니다.",
  invalid_state: "보안 오류가 발생했습니다. 다시 시도해주세요.",
  token_exchange_failed: "Google 인증에 실패했습니다. 다시 시도해주세요.",
  no_email: "Google 계정에서 이메일을 가져올 수 없습니다.",
  email_exists: "이미 다른 방법으로 가입된 이메일입니다.",
  account_suspended: "계정이 정지되었습니다. 관리자에게 문의하세요.",
  invalid_token: "인증 링크가 유효하지 않거나 만료되었습니다.",
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const verified = searchParams.get("verified");
  const reset = searchParams.get("reset");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorKey ? (ERROR_MESSAGES[errorKey] ?? "로그인 중 오류가 발생했습니다.") : null
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password });
      localStorage.setItem("is_auth", "1");
      router.replace("/dashboard");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail === "Invalid credentials") {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setError(detail ?? "로그인에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white">Marginalia</h1>
          <p className="text-sm text-zinc-400">계속하려면 로그인하세요</p>
        </div>

        {verified === "true" && (
          <div className="text-sm text-green-400 bg-green-950/60 border border-green-800/60 rounded-xl px-4 py-3 text-center">
            이메일 인증이 완료되었습니다. 로그인해주세요.
          </div>
        )}
        {reset === "true" && (
          <div className="text-sm text-green-400 bg-green-950/60 border border-green-800/60 rounded-xl px-4 py-3 text-center">
            비밀번호가 변경되었습니다. 로그인해주세요.
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="text-right">
            <a href="/forgot-password" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              비밀번호를 잊으셨나요?
            </a>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">또는</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
            className="w-full flex items-center justify-center gap-3 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <GoogleIcon />
            Google로 계속하기
          </a>
        </div>

        <p className="text-center text-xs text-zinc-500">
          계정이 없으신가요?{" "}
          <a href="/signup" className="text-zinc-300 hover:text-white transition-colors">
            가입하기
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
