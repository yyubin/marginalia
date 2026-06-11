"use client";

interface Props {
  onClose: () => void;
  onStartUpload: () => void;
}

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 9.75h7.5M8.25 12.75h4.5m-8.25 6h16.5a.75.75 0 0 0 .75-.75V4.5a.75.75 0 0 0-.75-.75H3.75a.75.75 0 0 0-.75.75v15c0 .414.336.75.75.75Z" />
      </svg>
    ),
    title: "스킴패널",
    desc: "하이라이트를 한 곳에 모아 페이지 범위별 학습 노트를 구성하세요. 드래그로 순서를 바꾸고, 메모 포함 전체 복사도 됩니다.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
    title: "AI 번역",
    desc: "텍스트를 드래그하고 번역 버튼을 누르면 AI가 실시간으로 번역합니다. 결과를 메모로 저장하면 스킴패널에 자동 추가됩니다.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    title: "내보내기",
    desc: "스킴패널과 하이라이트, 메모를 Markdown · CSV · 어노테이션 PDF로 내보낼 수 있습니다.",
    color: "bg-green-50 text-green-600",
  },
];

export default function WelcomeModal({ onClose, onStartUpload }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-2xl mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-gray-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-gray-900">Marginalia에 오신 걸 환영합니다</h2>
          <p className="text-xs text-gray-400 mt-1">PDF를 읽고, 생각을 남기세요</p>
        </div>

        <div className="space-y-3 mb-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 items-start">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${f.color} shrink-0`}>
                {f.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{f.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={onStartUpload}
            className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            PDF 업로드하고 시작하기
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
