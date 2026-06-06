"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: "Google 로그인이 취소되었습니다.",
  invalid_state: "보안 오류가 발생했습니다. 다시 시도해주세요.",
  token_exchange_failed: "Google 인증에 실패했습니다. 다시 시도해주세요.",
  no_email: "Google 계정에서 이메일을 가져올 수 없습니다.",
  email_exists: "이미 다른 방법으로 가입된 이메일입니다.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? "로그인 중 오류가 발생했습니다.") : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-1">Marginalia</h1>
          <p className="text-sm text-gray-500">계속하려면 로그인하세요</p>
        </div>

        {errorMessage && (
          <p className="w-full text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-center">
            {errorMessage}
          </p>
        )}

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          Google로 계속하기
        </a>
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
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
