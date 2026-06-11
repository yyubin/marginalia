"use client";

import { useState } from "react";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "start",
    title: "시작하기",
    content: (
      <div className="space-y-1.5">
        <p>헤더의 <strong className="text-gray-700">PDF 업로드</strong> 버튼으로 파일을 업로드하세요. 문서 카드를 클릭하면 리더로 이동합니다.</p>
        <p>계정당 최대 3개 문서를 저장할 수 있습니다.</p>
      </div>
    ),
  },
  {
    id: "scheme",
    title: "스킴패널",
    content: (
      <div className="space-y-1.5">
        <p>텍스트를 드래그하면 팝업이 뜹니다. <strong className="text-gray-700">스킴 추가</strong>를 클릭하면 패널에 수집됩니다.</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>페이지 범위를 입력해 특정 구간만 필터링</li>
          <li>항목을 드래그해 순서 재배치 (전체 보기에서만)</li>
          <li><strong className="text-gray-700">메모 포함 복사</strong>로 클립보드에 한 번에 복사</li>
        </ul>
      </div>
    ),
  },
  {
    id: "translate",
    title: "AI 번역",
    content: (
      <div className="space-y-1.5">
        <p>텍스트를 드래그한 뒤 <strong className="text-gray-700">번역</strong> 버튼을 누르면 AI가 실시간 스트리밍으로 번역합니다.</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>번역 결과를 메모로 저장하면 스킴패널에 자동 추가</li>
          <li>기능 사용 전 <strong className="text-gray-700">설정 → AI API 키</strong> 등록 필요</li>
        </ul>
      </div>
    ),
  },
  {
    id: "highlight",
    title: "하이라이트 & 메모",
    content: (
      <div className="space-y-1.5">
        <p>텍스트를 드래그하면 노랑·초록·파랑·핑크·보라 5가지 색상으로 하이라이트할 수 있습니다.</p>
        <p>하이라이트에 메모를 달거나, 클릭해 스킴패널로 이동할 수 있습니다.</p>
      </div>
    ),
  },
  {
    id: "drawing",
    title: "드로잉 & 형광펜",
    content: (
      <div className="space-y-1.5">
        <p>하단 툴바의 <strong className="text-gray-700">연필 아이콘</strong>을 클릭하면 드로잉 모드가 활성화됩니다.</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>펜 · 형광펜 · 지우개 도구 제공</li>
          <li>7가지 색상과 다양한 굵기 선택 가능</li>
          <li>현재 페이지 드로잉 전체 삭제 가능</li>
        </ul>
      </div>
    ),
  },
  {
    id: "sticky",
    title: "스티키노트",
    content: (
      <div className="space-y-1.5">
        <p>하단 툴바의 <strong className="text-gray-700">포스트잇 아이콘</strong>을 클릭한 뒤 PDF의 원하는 위치를 클릭하면 메모가 생성됩니다.</p>
        <p>노랑·초록·파랑·핑크 4가지 색상, 위치 드래그 이동 지원.</p>
      </div>
    ),
  },
  {
    id: "bookmark",
    title: "북마크",
    content: (
      <p>오른쪽 패널 하단 <strong className="text-gray-700">북마크</strong> 탭에서 현재 페이지를 즐겨찾기하고 이름을 붙일 수 있습니다. 클릭하면 해당 페이지로 바로 이동합니다.</p>
    ),
  },
  {
    id: "export",
    title: "내보내기",
    content: (
      <div className="space-y-1.5">
        <p>리더 헤더의 <strong className="text-gray-700">내보내기</strong> 버튼 또는 대시보드 카드 hover 시 내보내기 버튼을 클릭하세요.</p>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-gray-700">Markdown</strong> — Obsidian, Notion 등 호환</li>
          <li><strong className="text-gray-700">CSV</strong> — 엑셀·구글 시트</li>
          <li><strong className="text-gray-700">PDF</strong> — 하이라이트·드로잉·스티키노트 반영, 브라우저에서 직접 처리</li>
        </ul>
      </div>
    ),
  },
  {
    id: "share",
    title: "공유 링크",
    content: (
      <p>리더 내 <strong className="text-gray-700">공유</strong> 기능으로 링크를 생성하면, 수신자는 로그인 없이 어노테이션이 포함된 문서를 열람할 수 있습니다.</p>
    ),
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HelpDrawer({ open, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>("scheme");

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white border-l shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="도움말"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold">도움말</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors rounded"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {SECTIONS.map((section) => (
            <div key={section.id}>
              <button
                onClick={() => toggle(section.id)}
                className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors text-left"
              >
                {section.title}
                <span
                  className={`text-gray-400 text-xs transition-transform duration-200 ${
                    expanded === section.id ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
              {expanded === section.id && (
                <div className="px-5 pb-4 pt-1 text-xs text-gray-500 leading-relaxed">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
