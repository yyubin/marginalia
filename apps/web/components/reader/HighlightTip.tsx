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
}

export default function HighlightTip({ onColorSelect, onAddToScheme, onTranslate }: Props) {
  return (
    <div className="flex flex-col gap-1 bg-white border shadow-lg rounded-xl p-2 min-w-[160px]">
      {/* 색상 팔레트 */}
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

      {/* 액션 버튼 */}
      <button
        onClick={onAddToScheme}
        className="text-xs text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
      >
        + 스킴패널에 추가
      </button>
      <button
        onClick={onTranslate}
        className="text-xs text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
      >
        번역
      </button>
    </div>
  );
}
