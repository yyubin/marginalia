"use client";

import { useEffect, useRef, useState } from "react";
import type { StickyNote as StickyNoteType, StickyNoteColor } from "@/types";

const COLOR_STYLES: Record<StickyNoteColor, { bg: string; header: string; border: string }> = {
  yellow: { bg: "bg-yellow-50",  header: "bg-yellow-200",  border: "border-yellow-300" },
  green:  { bg: "bg-green-50",   header: "bg-green-200",   border: "border-green-300"  },
  blue:   { bg: "bg-blue-50",    header: "bg-blue-200",    border: "border-blue-300"   },
  pink:   { bg: "bg-pink-50",    header: "bg-pink-200",    border: "border-pink-300"   },
};

const COLOR_DOT: Record<StickyNoteColor, string> = {
  yellow: "bg-yellow-400",
  green:  "bg-green-400",
  blue:   "bg-blue-400",
  pink:   "bg-pink-400",
};

const COLORS: StickyNoteColor[] = ["yellow", "green", "blue", "pink"];

interface Props {
  note: StickyNoteType;
  pageEl: HTMLElement;
  autoFocus?: boolean;
  onUpdate: (data: Partial<Pick<StickyNoteType, "x" | "y" | "width" | "content" | "color">>) => void;
  onDelete: () => void;
}

export default function StickyNote({ note, pageEl, autoFocus, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(autoFocus ?? false);
  const [content, setContent] = useState(note.content);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync content if note updates externally
  useEffect(() => {
    if (!editing) setContent(note.content);
  }, [note.content, editing]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) textareaRef.current.focus();
  }, [autoFocus]);

  function handleContentChange(value: string) {
    setContent(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => onUpdate({ content: value }), 600);
  }

  function handleBlur() {
    setEditing(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onUpdate({ content });
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  function handleDragStart(e: React.MouseEvent) {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    setDragging(true);

    function onMove(e: MouseEvent) {
      setDragOffset({ x: e.clientX - startMouseX, y: e.clientY - startMouseY });
    }

    function onUp(e: MouseEvent) {
      const rect = pageEl.getBoundingClientRect();
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const newX = Math.max(0, Math.min(100 - note.width, note.x + (dx / rect.width) * 100));
      const newY = Math.max(0, Math.min(96, note.y + (dy / rect.height) * 100));
      onUpdate({ x: newX, y: newY });
      setDragOffset({ x: 0, y: 0 });
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX;
    const startWidth = note.width;
    setResizing(true);

    function onMove(e: MouseEvent) {
      const rect = pageEl.getBoundingClientRect();
      const dx = e.clientX - startMouseX;
      const newWidth = Math.max(15, Math.min(55, startWidth + (dx / rect.width) * 100));
      onUpdate({ width: newWidth });
    }

    function onUp() {
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const styles = COLOR_STYLES[note.color] ?? COLOR_STYLES.yellow;
  const isActive = editing || dragging || resizing;

  return (
    <div
      className={`absolute rounded shadow-md border flex flex-col select-none ${styles.bg} ${styles.border}`}
      style={{
        left: `${note.x}%`,
        top: `${note.y}%`,
        width: `${note.width}%`,
        minHeight: "6%",
        transform: dragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
        zIndex: isActive ? 100 : 50,
        pointerEvents: "auto",
        cursor: dragging ? "grabbing" : "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header — drag handle + color picker + delete */}
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-t ${styles.header} cursor-grab active:cursor-grabbing shrink-0`}
        onMouseDown={handleDragStart}
      >
        <span className="text-[9px] text-gray-500 mr-auto select-none">⠿⠿</span>

        {/* Color picker dots — visible on hover */}
        {(hovered || isActive) && (
          <div className="flex gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`w-2.5 h-2.5 rounded-full ${COLOR_DOT[c]} ring-1 ring-white ${note.color === c ? "ring-gray-500" : ""}`}
                onClick={() => onUpdate({ color: c })}
              />
            ))}
          </div>
        )}

        {/* Delete button */}
        {(hovered || isActive) && (
          <button
            className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded text-gray-500 hover:text-red-500 hover:bg-red-50 text-[10px] leading-none"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onDelete}
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div
        className="flex-1 px-2 py-1 cursor-text"
        onClick={() => { setEditing(true); textareaRef.current?.focus(); }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={handleBlur}
            className="w-full h-full min-h-[40px] bg-transparent resize-none outline-none text-xs text-gray-800 leading-relaxed"
            placeholder="메모를 입력하세요..."
            style={{ height: "auto", minHeight: "40px" }}
            rows={3}
          />
        ) : (
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words min-h-[40px]">
            {content || <span className="text-gray-300">메모를 입력하세요...</span>}
          </p>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        onMouseDown={handleResizeStart}
        style={{ touchAction: "none" }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" className="absolute bottom-0.5 right-0.5 text-gray-400">
          <path d="M7 1L1 7M7 4L4 7M7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
