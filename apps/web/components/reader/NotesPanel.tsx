"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHighlightStore } from "@/store/highlightStore";
import { Button } from "@/components/ui/button";
import type { Note } from "@/types";

interface Props {
  documentId: string;
}

export default function NotesPanel({ documentId }: Props) {
  const { selectedHighlight } = useHighlightStore();
  const queryClient = useQueryClient();
  const [noteContent, setNoteContent] = useState("");
  const [editing, setEditing] = useState(false);

  const noteQueryKey = ["note", selectedHighlight?.id];

  const { data: note } = useQuery<Note>({
    queryKey: noteQueryKey,
    queryFn: () =>
      api.get(`/highlights/${selectedHighlight!.id}/note`).then((r) => r.data),
    enabled: !!selectedHighlight,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/highlights/${selectedHighlight!.id}/note`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteQueryKey });
      setNoteContent("");
      setEditing(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch(`/notes/${id}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteQueryKey });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteQueryKey }),
  });

  const highlightId = selectedHighlight?.id;

  useEffect(() => {
    setEditing(false);
    setNoteContent("");
  }, [highlightId]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">메모</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!selectedHighlight && (
          <p className="text-xs text-gray-400 text-center">하이라이트를 선택하면 메모를 볼 수 있습니다</p>
        )}

        {selectedHighlight && (
          <div className="space-y-3">
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 leading-relaxed">
              "{selectedHighlight.content.text}"
            </div>

            {note && !editing ? (
              <div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    className="text-xs text-gray-400 hover:text-black"
                    onClick={() => {
                      setNoteContent(note.content);
                      setEditing(true);
                    }}
                  >
                    수정
                  </button>
                  <button
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => deleteMutation.mutate(note.id)}
                    disabled={deleteMutation.isPending}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  key={highlightId}
                  rows={4}
                  placeholder="메모를 입력하세요..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (editing && note) {
                        updateMutation.mutate({ id: note.id, content: noteContent });
                      } else {
                        createMutation.mutate(noteContent);
                      }
                    }}
                    disabled={!noteContent.trim() || createMutation.isPending || updateMutation.isPending}
                  >
                    저장
                  </Button>
                  {editing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(false);
                        setNoteContent("");
                      }}
                    >
                      취소
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
