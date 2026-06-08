"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type State = "loading" | "success" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg("유효하지 않은 링크입니다.");
      return;
    }
    if (called.current) return;
    called.current = true;

    api
      .post("/auth/verify-email", { token })
      .then(() => {
        setState("success");
        setTimeout(() => router.replace("/dashboard"), 2500);
      })
      .catch((err: unknown) => {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setState("error");
        setErrorMsg(detail ?? "인증에 실패했습니다.");
      });
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          {state === "loading" && (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm text-zinc-400">이메일 인증 중...</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-base font-semibold text-white">인증 완료</h1>
                <p className="text-sm text-zinc-400">잠시 후 대시보드로 이동합니다.</p>
              </div>
            </>
          )}

          {state === "error" && (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-base font-semibold text-white">인증 실패</h1>
                <p className="text-sm text-zinc-400">{errorMsg}</p>
              </div>
              <a
                href="/login"
                className="inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                로그인 페이지로 돌아가기
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
