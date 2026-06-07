"use client";

import type { HighlightColor } from "@/types";

const COLORS: { color: HighlightColor; bg: string }[] = [
  { color: "yellow", bg: "#FFED64" },
  { color: "green",  bg: "#7DDE7D" },
  { color: "blue",   bg: "#74B8FF" },
  { color: "pink",   bg: "#FFB6C1" },
  { color: "purple", bg: "#CC99FF" },
];

interface Props {
  onColorSelect: (color: HighlightColor) => void;
  onAddToScheme: () => void;
  onTranslate: () => void;
  canTranslate?: boolean;
}

export default function HighlightTip({ onColorSelect, onAddToScheme, onTranslate, canTranslate = true }: Props) {
  return (
    <div className="flex flex-col gap-1 bg-white border shadow-lg rounded-xl p-2 min-w-[160px]">
      <div className="flex gap-1.5 justify-center px-1 py-0.5">
        {COLORS.map(({ color, bg }) => (
          <button
            key={color}
            onClick={() => onColorSelect(color)}
            className="w-6 h-6 rounded-full border-2 border-white hover:scale-110 transition-transform shadow"
            style={{ backgroundColor: bg }}
            title={color}
          />
        ))}
      </div>

      <hr className="border-gray-100" />

      <button
        onClick={onAddToScheme}
        className="text-xs text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
      >
        + 스킴패널에 추가
      </button>
      <button
        onClick={onTranslate}
        disabled={!canTranslate}
        className="text-xs text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        title={canTranslate ? "선택한 텍스트 번역" : "텍스트 선택 영역만 번역할 수 있습니다"}
      >
        선택 영역 번역
      </button>
    </div>
  );
}

interface EditProps {
  currentColor: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
  onAddToScheme: () => void;
  onDelete: () => void;
}

export function HighlightEditTip({ currentColor, onColorChange, onAddToScheme, onDelete }: EditProps) {
  return (
    <div className="flex flex-col gap-1 bg-white border shadow-lg rounded-xl p-2 min-w-[160px]">
      <div className="flex gap-1.5 justify-center px-1 py-0.5">
        {COLORS.map(({ color, bg }) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform shadow ${
              color === currentColor ? "border-gray-500 scale-110" : "border-white"
            }`}
            style={{ backgroundColor: bg }}
            title={color}
          />
        ))}
      </div>

      <hr className="border-gray-100" />

      <button
        onClick={onAddToScheme}
        className="text-xs text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
      >
        + 스킴패널에 추가
      </button>
      <button
        onClick={onDelete}
        className="text-xs text-left px-2 py-1 rounded hover:bg-red-50 text-red-500"
      >
        하이라이트 삭제
      </button>
    </div>
  );
}
