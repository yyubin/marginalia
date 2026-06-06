"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Props {
  text: string;
  documentId: string;
  onClose: () => void;
}

export default function TranslatePanel({ text, documentId, onClose }: Props) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    translate();
  }, [text]);

  async function translate() {
    setResult("");
    setLoading(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, target_lang: "ko" }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            setResult((prev) => prev + data);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post(`/documents/${documentId}/highlights`, {
        position: { boundingRect: { x1:0,y1:0,x2:0,y2:0,width:0,height:0 }, rects: [], pageNumber: 0 },
        content: { text: `[원문] ${text}\n[번역] ${result}` },
        color: "blue",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["highlights", documentId] });
      onClose();
    },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold">번역</h2>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-black">닫기</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 leading-relaxed">
          원문: "{text}"
        </div>

        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap min-h-[60px]">
          {loading && !result && <span className="text-gray-300 animate-pulse">번역 중...</span>}
          {result}
        </div>
      </div>

      {result && (
        <div className="p-3 border-t">
          <Button size="sm" className="w-full" onClick={() => saveMutation.mutate()}>
            메모로 저장
          </Button>
        </div>
      )}
    </div>
  );
}
