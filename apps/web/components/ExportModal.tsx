"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { exportAnnotatedPdf } from "@/lib/pdfExport";

type ExportFormat = "markdown" | "csv" | "pdf";

interface Props {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string }[] = [
  {
    value: "markdown",
    label: "Markdown (.md)",
    desc: "Obsidian, Notion 등 마크다운 에디터용",
  },
  {
    value: "csv",
    label: "CSV (.csv)",
    desc: "엑셀, 구글 시트에서 열기",
  },
  {
    value: "pdf",
    label: "PDF (어노테이션 포함)",
    desc: "하이라이트·드로잉·스티키노트가 반영된 PDF",
  },
];

export default function ExportModal({ documentId, documentTitle, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      if (format === "pdf") {
        await exportAnnotatedPdf(documentId, documentTitle);
        onClose();
        return;
      }

      const response = await api.get(`/documents/${documentId}/export`, {
        params: { format },
        responseType: "blob",
      });

      const disposition = (response.headers["content-disposition"] as string) ?? "";
      const rfcMatch = disposition.match(/filename\*=UTF-8''([^;\s]+)/i);
      const plainMatch = disposition.match(/filename="?([^";\n]+)"?/i);
      const rawName = rfcMatch?.[1] ?? plainMatch?.[1];
      const ext = format === "markdown" ? "md" : format;
      const filename = rawName
        ? decodeURIComponent(rawName.trim())
        : `${documentTitle}.${ext}`;

      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Export에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-4">Export</h2>

        <div className="space-y-3 mb-6">
          {FORMAT_OPTIONS.map(({ value, label, desc }) => (
            <label key={value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="export-format"
                value={value}
                checked={format === value}
                onChange={() => setFormat(value)}
                className="mt-0.5 accent-black shrink-0"
              />
              <div>
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>

        {format === "pdf" && (
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            브라우저에서 직접 처리합니다. 문서 크기와 어노테이션 수에 따라 수초가 소요될 수 있습니다.
          </p>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? "처리 중..." : "다운로드"}
          </button>
        </div>
      </div>
    </div>
  );
}
