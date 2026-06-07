export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider: string;
  is_admin: boolean;
}

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

export type LLMProvider = "anthropic" | "openai" | "google";

export interface LLMKeyInfo {
  provider: string;
  key_preview: string;
  updated_at: string;
}

export interface UserSettings {
  highlights_per_page: number;
  max_documents: number;
  max_file_size_mb: number;
  default_llm_provider: string | null;
  llm_fallback_allowed: boolean;
  llm_keys: LLMKeyInfo[];
}

export interface Collection {
  id: string;
  document_id: string;
  name: string;
  items: CollectionItem[];
  created_at: string;
}

export interface Bookmark {
  id: string;
  document_id: string;
  page: number;
  label: string | null;
  created_at: string;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  document_count: number;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminDocumentSummary {
  id: string;
  title: string;
  file_size: number | null;
  page_count: number | null;
  created_at: string;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  documents: AdminDocumentSummary[];
  total_storage_bytes: number;
  max_documents: number;
  max_file_size_mb: number;
  llm_fallback_allowed: boolean;
  llm_providers_configured: string[];
}

export interface AdminStats {
  total_users: number;
  total_documents: number;
  total_storage_bytes: number;
  signups_last_7_days: number;
  new_documents_last_7_days: number;
}
