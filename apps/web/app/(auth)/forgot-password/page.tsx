"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Step = "form" | "sent";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setStep("sent");
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "sent") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 text-center">
            <div className="text-4xl">📨</div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">이메일을 확인해주세요</h2>
              <p className="text-sm text-zinc-400">
                해당 계정이 있다면{" "}
                <span className="text-zinc-200">{email}</span>으로
                비밀번호 재설정 링크를 보냈습니다.
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              링크는 1시간 후 만료됩니다. 메일이 없다면 스팸함을 확인해주세요.
            </p>
          </div>
          <p className="text-center text-xs text-zinc-500">
            <a href="/login" className="text-zinc-300 hover:text-white transition-colors">
              ← 로그인으로 돌아가기
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
          <h1 className="text-xl font-bold text-white">비밀번호 찾기</h1>
          <p className="text-sm text-zinc-400">
            가입 시 사용한 이메일을 입력하면 재설정 링크를 보내드립니다.
          </p>
        </div>

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
              {loading ? "전송 중..." : "재설정 링크 받기"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-500">
          <a href="/login" className="text-zinc-300 hover:text-white transition-colors">
            ← 로그인으로 돌아가기
          </a>
        </p>
      </div>
    </div>
  );
}
