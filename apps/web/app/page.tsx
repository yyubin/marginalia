import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Features />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Marginalia</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-white text-black rounded-lg px-3 py-1.5 font-medium hover:bg-zinc-200 transition-colors"
          >
            시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
      <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-xs text-zinc-400 mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        PDF 어노테이션 도구
      </div>

      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
        PDF를 읽고,{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
          생각을 남기세요
        </span>
      </h1>

      <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
        Marginalia는 브라우저에서 바로 PDF를 읽으며 하이라이트, 필기, 메모를
        남길 수 있는 스마트 리딩 도구입니다.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/signup"
          className="w-full sm:w-auto bg-white text-black rounded-xl px-6 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors"
        >
          무료로 시작하기
        </Link>
        <Link
          href="/login"
          className="w-full sm:w-auto bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-xl px-6 py-3 text-sm font-medium hover:bg-zinc-800 hover:text-white transition-colors"
        >
          로그인
        </Link>
      </div>

      {/* Mockup preview */}
      <div className="mt-16 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent z-10 pointer-events-none" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800 bg-zinc-950">
            <span className="w-3 h-3 rounded-full bg-zinc-700" />
            <span className="w-3 h-3 rounded-full bg-zinc-700" />
            <span className="w-3 h-3 rounded-full bg-zinc-700" />
            <span className="ml-3 text-xs text-zinc-600 font-mono">marginalia · reader</span>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4 min-h-[220px]">
            {/* Simulated PDF page */}
            <div className="col-span-2 bg-white rounded-lg p-5 space-y-2">
              <div className="h-2 bg-zinc-300 rounded w-3/4" />
              <div className="h-2 bg-zinc-200 rounded w-full" />
              <div className="h-2 bg-zinc-200 rounded w-5/6" />
              {/* Highlight simulation */}
              <div className="h-2 rounded w-full bg-yellow-300/70" />
              <div className="h-2 rounded w-4/5 bg-yellow-300/70" />
              <div className="h-2 bg-zinc-200 rounded w-full mt-1" />
              <div className="h-2 bg-blue-200/70 rounded w-3/4" />
              <div className="h-2 bg-zinc-200 rounded w-full" />
              {/* Sticky note simulation */}
              <div className="absolute right-[34%] mt-[-60px] bg-yellow-50 border border-yellow-200 rounded p-2 shadow-md w-20 rotate-1">
                <div className="h-1.5 bg-yellow-300 rounded w-full mb-1" />
                <div className="h-1.5 bg-yellow-200 rounded w-3/4" />
              </div>
            </div>
            {/* Simulated sidebar */}
            <div className="space-y-3">
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="h-1.5 bg-yellow-400/60 rounded w-full mb-1.5" />
                <div className="h-1.5 bg-zinc-700 rounded w-4/5 mb-1" />
                <div className="h-1.5 bg-zinc-700 rounded w-3/4" />
              </div>
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="h-1.5 bg-blue-400/60 rounded w-5/6 mb-1.5" />
                <div className="h-1.5 bg-zinc-700 rounded w-full mb-1" />
                <div className="h-1.5 bg-zinc-700 rounded w-2/3" />
              </div>
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="h-1.5 bg-pink-400/60 rounded w-3/4 mb-1.5" />
                <div className="h-1.5 bg-zinc-700 rounded w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
      </svg>
    ),
    title: "PDF 업로드 & 리딩",
    desc: "PDF를 업로드하면 브라우저에서 바로 읽을 수 있습니다. 별도 설치 없이 깔끔한 리더 환경을 제공합니다.",
    accent: "from-blue-500/20 to-blue-600/5",
    iconBg: "bg-blue-500/10 text-blue-400",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    title: "멀티 컬러 하이라이트",
    desc: "노랑, 초록, 파랑, 핑크, 보라 5가지 색상으로 중요한 구절을 표시하고 메모를 달 수 있습니다.",
    accent: "from-yellow-500/20 to-yellow-600/5",
    iconBg: "bg-yellow-500/10 text-yellow-400",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
    title: "드로잉 & 형광펜",
    desc: "펜으로 자유롭게 필기하거나, 형광펜으로 영역을 강조하세요. 7가지 색상과 굵기를 지원합니다.",
    accent: "from-violet-500/20 to-violet-600/5",
    iconBg: "bg-violet-500/10 text-violet-400",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
    title: "스티키노트",
    desc: "페이지 어디든 포스트잇을 붙이듯 메모를 남기세요. 4가지 색상으로 구분해 관리할 수 있습니다.",
    accent: "from-green-500/20 to-green-600/5",
    iconBg: "bg-green-500/10 text-green-400",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    title: "내보내기",
    desc: "모든 어노테이션을 Markdown, CSV, 또는 어노테이션이 반영된 PDF 파일로 내보낼 수 있습니다.",
    accent: "from-orange-500/20 to-orange-600/5",
    iconBg: "bg-orange-500/10 text-orange-400",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    title: "링크 공유",
    desc: "문서 링크를 생성해 다른 사람과 공유하세요. 수신자는 로그인 없이도 어노테이션을 열람할 수 있습니다.",
    accent: "from-pink-500/20 to-pink-600/5",
    iconBg: "bg-pink-500/10 text-pink-400",
  },
];

function Features() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight mb-3">
          리딩에 필요한 모든 것
        </h2>
        <p className="text-zinc-400 text-sm max-w-md mx-auto">
          복잡한 설정 없이 바로 사용할 수 있는 PDF 어노테이션 도구
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={`relative rounded-2xl border border-zinc-800 bg-gradient-to-br ${f.accent} p-5 hover:border-zinc-700 transition-colors`}
          >
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${f.iconBg} mb-4`}>
              {f.icon}
            </div>
            <h3 className="text-sm font-semibold mb-1.5">{f.title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl px-8 py-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-3">
          지금 바로 시작하세요
        </h2>
        <p className="text-zinc-400 text-sm mb-8 max-w-sm mx-auto">
          무료로 가입하고 PDF 어노테이션을 경험해보세요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="w-full sm:w-auto bg-white text-black rounded-xl px-6 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            무료로 가입하기
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto border border-zinc-700 text-zinc-300 rounded-xl px-6 py-3 text-sm font-medium hover:bg-zinc-800 hover:text-white transition-colors"
          >
            이미 계정이 있나요?
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-zinc-800/60 py-6">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-600">
        <span>Marginalia</span>
        <span>PDF를 읽고, 생각을 남기세요</span>
      </div>
    </footer>
  );
}
