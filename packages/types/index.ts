// Shared types between frontend and potential future clients

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface HighlightPosition {
  boundingRect: Record<string, number>;
  rects: Array<Record<string, number>>;
  pageNumber: number;
}

export interface HighlightContent {
  text?: string;
  image?: string;
}
