"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const READER_TOUR_KEY = "onboarding_reader_v1";

interface TourStep {
  target: string | null;
  title: string;
  desc: string;
  note?: string;
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: "리더 시작하기",
    desc: "읽다가 중요한 문장을 드래그하면 팝업이 나타납니다. 하이라이트 색상 선택, 메모 작성, 스킴 추가, 번역 버튼을 사용할 수 있습니다.",
  },
  {
    target: "scheme-panel",
    title: "스킴패널",
    desc: "하이라이트를 스킴패널에 추가하면 나만의 학습 노트를 구성할 수 있습니다. 페이지 범위로 필터링하고, 드래그로 순서를 재배치할 수 있습니다.",
  },
  {
    target: "scheme-copy",
    title: "전체 복사 & 내보내기",
    desc: "'메모 포함 복사'로 스킴 내용 전체를 클립보드에 복사하거나, 내보내기에서 Markdown · CSV · PDF 파일로도 저장할 수 있습니다.",
  },
  {
    target: null,
    title: "AI 번역",
    desc: "텍스트를 드래그한 뒤 번역 버튼을 누르면 AI가 실시간으로 번역합니다. 번역 결과를 메모로 저장하면 스킴패널에 자동으로 추가됩니다.",
    note: "설정 → AI API 키를 먼저 등록해야 번역 기능을 사용할 수 있습니다.",
  },
  {
    target: "drawing-tool",
    title: "드로잉 & 스티키노트",
    desc: "하단 툴바의 연필 아이콘으로 펜·형광펜 필기를, 포스트잇 아이콘으로 페이지 어디든 메모를 붙일 수 있습니다.",
  },
  {
    target: "export-btn",
    title: "내보내기",
    desc: "모든 어노테이션을 Markdown, CSV, 또는 하이라이트·드로잉·스티키노트가 반영된 PDF로 내보낼 수 있습니다.",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  onFinish: () => void;
}

const PAD = 10;

export default function ReaderTour({ onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [mounted, setMounted] = useState(false);

  const current = STEPS[step];
  const total = STEPS.length;

  useEffect(() => { setMounted(true); }, []);

  const refreshRect = useCallback(() => {
    if (!current.target) { setTargetRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (!el) { setTargetRect(null); return; }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current.target]);

  useEffect(() => {
    refreshRect();
    window.addEventListener("resize", refreshRect);
    return () => window.removeEventListener("resize", refreshRect);
  }, [refreshRect]);

  function finish() {
    localStorage.setItem(READER_TOUR_KEY, "seen");
    onFinish();
  }

  function next() {
    if (step < total - 1) setStep((s) => s + 1);
    else finish();
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  if (!mounted) return null;

  const sw = window.innerWidth;
  const sh = window.innerHeight;

  // Spotlight box (with padding)
  const spotTop  = targetRect ? targetRect.top  - PAD : sh / 2 - 60;
  const spotLeft = targetRect ? targetRect.left - PAD : sw / 2 - 60;
  const spotW    = targetRect ? targetRect.width  + PAD * 2 : 120;
  const spotH    = targetRect ? targetRect.height + PAD * 2 : 120;

  // Tooltip placement: below if spotlight center is in top 55% of screen
  const spotCenterY = spotTop + spotH / 2;
  const tooltipBelow = !targetRect || spotCenterY < sh * 0.55;

  // Tooltip X: centered on spotlight, clamped to viewport
  const TOOLTIP_W = 288;
  const tooltipX = Math.max(12, Math.min(sw - TOOLTIP_W - 12, spotLeft + spotW / 2 - TOOLTIP_W / 2));
  const tooltipTopStyle = tooltipBelow
    ? { top: spotTop + spotH + 12 }
    : { top: spotTop - 12, transform: "translateY(-100%)" };

  return createPortal(
    <>
      {/* Overlay: 4 dark rectangles with cutout */}
      <div className="fixed inset-0 z-[9990] pointer-events-none" aria-hidden>
        {/* top */}
        <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: Math.max(0, spotTop) }} />
        {/* bottom */}
        <div className="absolute bg-black/60" style={{ top: spotTop + spotH, left: 0, right: 0, bottom: 0 }} />
        {/* left */}
        <div className="absolute bg-black/60" style={{ top: spotTop, left: 0, width: Math.max(0, spotLeft), height: spotH }} />
        {/* right */}
        <div className="absolute bg-black/60" style={{ top: spotTop, left: spotLeft + spotW, right: 0, height: spotH }} />
        {/* spotlight ring */}
        {targetRect && (
          <div
            className="absolute rounded-xl border-2 border-blue-400/80 ring-4 ring-blue-400/20"
            style={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
          />
        )}
      </div>

      {/* Click blocker (prevents interacting with underlying UI) */}
      <div className="fixed inset-0 z-[9989]" onClick={(e) => e.stopPropagation()} />

      {/* Tooltip card */}
      <div
        className="fixed z-[9991] bg-white rounded-2xl shadow-2xl p-5"
        style={{ left: tooltipX, width: TOOLTIP_W, ...tooltipTopStyle }}
        role="dialog"
        aria-label={`온보딩 투어 ${step + 1}단계`}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`block h-1.5 rounded-full transition-all ${
                  i === step ? "w-4 bg-black" : i < step ? "w-1.5 bg-gray-300" : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>
          <button
            onClick={finish}
            className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
          >
            스킵
          </button>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{current.title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{current.desc}</p>

        {current.note && (
          <div className="mt-2.5 flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{current.note}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {step > 0 && (
            <button
              onClick={prev}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
            >
              이전
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 py-1.5 text-xs bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            {step < total - 1 ? "다음 →" : "완료"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
