"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Auth cookies were set by the server redirect — just mark as authenticated
    localStorage.setItem("is_auth", "1");
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <p className="text-sm text-zinc-400">로그인 처리 중...</p>
    </div>
  );
}
