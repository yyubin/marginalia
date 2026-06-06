export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface HighlightPosition {
  boundingRect: DOMRect | Record<string, number>;
  rects: Array<Record<string, number>>;
  pageNumber: number;
}

export interface HighlightContent {
  text?: string;
  image?: string;
}

export interface Highlight {
  id: string;
  document_id: string;
  position: HighlightPosition;
  content: HighlightContent;
  color: HighlightColor;
  created_at: string;
  note?: Note;
}

export interface Note {
  id: string;
  highlight_id: string | null;
  document_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  title: string;
  file_key: string;
  file_size: number | null;
  page_count: number | null;
  last_opened: string | null;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  highlight_id: string;
  position: number;
  highlight: Highlight;
}

export interface UserSettings {
  highlights_per_page: number;
}

export interface Collection {
  id: string;
  document_id: string;
  name: string;
  items: CollectionItem[];
  created_at: string;
}
