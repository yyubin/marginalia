"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type TranslateStatus = "idle" | "streaming" | "done" | "error";

interface Props {
  text: string;
  documentId: string;
  onClose: () => void;
}

export default function TranslatePanel({ text, documentId, onClose }: Props) {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<TranslateStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();

    async function translate() {
      setResult("");
      setErrorMessage(null);
      setStatus("streaming");
      const token = localStorage.getItem("access_token");
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text, target_lang: "ko" }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const message = await readErrorMessage(res);
          throw new Error(message);
        }
        if (!res.body) throw new Error("번역 응답을 읽을 수 없습니다");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = consumeSseBuffer(buffer, {
            onDelta: (chunk) => setResult((prev) => prev + chunk),
            onDone: () => setStatus("done"),
            onError: (message) => {
              setErrorMessage(message);
              setStatus("error");
            },
          });
        }

        if (!controller.signal.aborted) {
          setStatus((current) => (current === "streaming" ? "done" : current));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "번역 중 오류가 발생했습니다");
        setStatus("error");
      }
    }

    translate();
    return () => {
      controller.abort();
    };
  }, [text, retryNonce]);

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
          원문: &quot;{text}&quot;
        </div>

        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap min-h-[60px]">
          {status === "streaming" && !result && (
            <span className="text-gray-300 animate-pulse">번역 중...</span>
          )}
          {result}
        </div>

        {errorMessage && (
          <div className="rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-500">
            {errorMessage}
          </div>
        )}
      </div>

      {(result || status === "error") && (
        <div className="p-3 border-t flex gap-2">
          {result && (
          <Button size="sm" className="flex-1" onClick={() => saveMutation.mutate()}>
            메모로 저장
          </Button>
          )}
          {status === "error" && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setRetryNonce((n) => n + 1)}>
              다시 번역
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json();
    return body.detail ?? "번역 요청에 실패했습니다";
  } catch {
    return "번역 요청에 실패했습니다";
  }
}

function consumeSseBuffer(
  buffer: string,
  handlers: {
    onDelta: (text: string) => void;
    onDone: () => void;
    onError: (message: string) => void;
  }
) {
  const events = buffer.split(/\n\n/);
  const rest = events.pop() ?? "";

  for (const rawEvent of events) {
    const lines = rawEvent.split("\n");
    const eventType = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!dataLine) continue;

    try {
      const data = JSON.parse(dataLine.slice(6));
      if (eventType === "delta") {
        handlers.onDelta(data.text ?? "");
      } else if (eventType === "done") {
        handlers.onDone();
      } else if (eventType === "error") {
        handlers.onError(data.message ?? "번역 중 오류가 발생했습니다");
      }
    } catch {
      handlers.onError("번역 응답을 처리할 수 없습니다");
    }
  }

  return rest;
}
