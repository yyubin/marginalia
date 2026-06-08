"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Step = "form" | "check-email";

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
  if (score <= 2) return { score, label: "약함", color: "bg-red-500" };
  if (score <= 3) return { score, label: "보통", color: "bg-yellow-500" };
  if (score <= 4) return { score, label: "강함", color: "bg-green-500" };
  return { score, label: "매우 강함", color: "bg-green-400" };
}

export default function SignupPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/signup", { email, password, name: name || undefined });
      setStep("check-email");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail === "Email already registered") {
        setError("이미 사용 중인 이메일입니다.");
      } else {
        setError(detail ?? "가입에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendError(null);
    setResendSuccess(false);
    try {
      await api.post("/auth/resend-verification", { email });
      setResendSuccess(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setResendError("5분 뒤에 다시 시도해주세요.");
      } else {
        setResendError("재발송에 실패했습니다.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  if (step === "check-email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 text-center">
            <div className="text-4xl">📬</div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">인증 메일을 확인해주세요</h2>
              <p className="text-sm text-zinc-400">
                <span className="text-zinc-200">{email}</span>으로 인증 링크를 보냈습니다.
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              메일이 도착하지 않았나요? 스팸함을 확인하거나 아래 버튼으로 재발송해주세요.
            </p>
            {resendSuccess && (
              <p className="text-xs text-green-400">인증 메일을 재발송했습니다.</p>
            )}
            {resendError && (
              <p className="text-xs text-red-400">{resendError}</p>
            )}
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="w-full bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {resendLoading ? "발송 중..." : "인증 메일 재발송"}
            </button>
          </div>
          <p className="text-center text-xs text-zinc-500">
            이미 계정이 있으신가요?{" "}
            <a href="/login" className="text-zinc-300 hover:text-white transition-colors">
              로그인
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white">Marginalia</h1>
          <p className="text-sm text-zinc-400">새 계정을 만들어보세요</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="space-y-1.5">
              <input
                type="password"
                placeholder="비밀번호 (영문·숫자 포함 8자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : "bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${strength.score <= 2 ? "text-red-400" : strength.score <= 3 ? "text-yellow-400" : "text-green-400"}`}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>
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
              {loading ? "가입 중..." : "가입하기"}
            </button>
          </form>

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
            Google로 가입하기
          </a>
        </div>

        <p className="text-center text-xs text-zinc-500">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="text-zinc-300 hover:text-white transition-colors">
            로그인
          </a>
        </p>
      </div>
    </div>
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
