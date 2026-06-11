import { api } from "@/lib/api";
import type { DrawingStroke, Highlight, StickyNote, StickyNoteColor } from "@/types";

// ── Color maps ────────────────────────────────────────────────────────────────

const HIGHLIGHT_RGB: Record<string, [number, number, number]> = {
  yellow: [1.00, 0.92, 0.00],
  green:  [0.40, 0.86, 0.30],
  blue:   [0.30, 0.68, 1.00],
  pink:   [1.00, 0.38, 0.68],
  purple: [0.68, 0.28, 1.00],
};

const DRAWING_RGB: Record<string, [number, number, number]> = {
  black:  [0.00, 0.00, 0.00],
  red:    [0.90, 0.10, 0.10],
  orange: [1.00, 0.55, 0.00],
  yellow: [1.00, 0.90, 0.00],
  green:  [0.10, 0.75, 0.10],
  blue:   [0.10, 0.40, 0.90],
  purple: [0.60, 0.10, 0.80],
};

const STICKY_BG: Record<StickyNoteColor, string> = {
  yellow: "#fef9c3",
  green:  "#dcfce7",
  blue:   "#dbeafe",
  pink:   "#fce7f3",
};

const STICKY_BORDER: Record<StickyNoteColor, string> = {
  yellow: "#fde68a",
  green:  "#86efac",
  blue:   "#93c5fd",
  pink:   "#f9a8d4",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100).trim() || "export";
}

function groupByPage<T>(items: T[], getPage: (item: T) => number): Record<number, T[]> {
  const map: Record<number, T[]> = {};
  for (const item of items) {
    const p = getPage(item);
    (map[p] ??= []).push(item);
  }
  return map;
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Sticky note → PNG (canvas) ────────────────────────────────────────────────
// Browser canvas uses system fonts, which natively support Korean.
// The resulting PNG is embedded in the PDF as an image, bypassing font-embedding complexity.

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of [...paragraph]) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function renderStickyNote(
  content: string,
  boxW: number,
  boxH: number,
  color: StickyNoteColor,
): Promise<Uint8Array> {
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(boxW * dpr);
  canvas.height = Math.round(boxH * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = STICKY_BG[color] ?? "#fef9c3";
  ctx.fillRect(0, 0, boxW, boxH);

  ctx.strokeStyle = STICKY_BORDER[color] ?? "#fde68a";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, boxW - 1, boxH - 1);

  const fontSize = 10;
  const lineH = 15;
  const pad = 5;
  ctx.fillStyle = "#1f2937";
  ctx.font = `${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Nanum Gothic", sans-serif`;
  ctx.textBaseline = "top";

  const lines = wrapText(ctx, content, boxW - pad * 2);
  lines.forEach((line, i) => ctx.fillText(line, pad, pad + i * lineH));

  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas toBlob failed"));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, "image/png");
  });
}

// ── Per-page renderers ────────────────────────────────────────────────────────

type RgbFn = (r: number, g: number, b: number) => unknown;

function applyHighlights(
  page: { drawRectangle: (opts: object) => void; getSize: () => { width: number; height: number } },
  pw: number,
  ph: number,
  highlights: Highlight[],
  rgb: RgbFn,
): void {
  for (const h of highlights) {
    const pos = h.position;
    const bounding = (pos.boundingRect ?? {}) as Record<string, number>;
    const vpW = bounding.width || pw;
    const vpH = bounding.height || ph;
    const rects = (pos.rects?.length ? pos.rects : [bounding]) as Record<string, number>[];
    const [r, g, b] = HIGHLIGHT_RGB[h.color] ?? [1, 0.92, 0];

    for (const rect of rects) {
      const x1  = (rect.x1 ?? 0) / vpW * pw;
      const y2n = (rect.y2 ?? 0) / vpH * ph;   // viewport bottom → normalized
      const w   = ((rect.x2 ?? 0) - (rect.x1 ?? 0)) / vpW * pw;
      const rh  = ((rect.y2 ?? 0) - (rect.y1 ?? 0)) / vpH * ph;
      if (w <= 0 || rh <= 0) continue;

      page.drawRectangle({
        x: x1,
        y: ph - y2n,   // flip: viewport y2 (bottom) → PDF y (bottom-left origin)
        width: w,
        height: rh,
        color: rgb(r, g, b),
        opacity: 0.35,
        borderWidth: 0,
      });
    }
  }
}

function applyDrawings(
  page: { drawLine: (opts: object) => void },
  pw: number,
  ph: number,
  drawings: DrawingStroke[],
  rgb: RgbFn,
  LineCapStyle: { Round: unknown },
): void {
  for (const stroke of drawings) {
    const pts = stroke.points;
    if (pts.length < 2) continue;

    const [r, g, b] = DRAWING_RGB[stroke.color] ?? [0, 0, 0];
    const color = rgb(r, g, b);
    const opacity = stroke.tool === "highlighter" ? 0.4 : 1.0;

    for (let j = 0; j < pts.length - 1; j++) {
      const [x1p, y1p] = pts[j];
      const [x2p, y2p] = pts[j + 1];
      page.drawLine({
        start: { x: x1p / 100 * pw, y: ph - y1p / 100 * ph },
        end:   { x: x2p / 100 * pw, y: ph - y2p / 100 * ph },
        thickness: stroke.width,
        color,
        opacity,
        lineCap: LineCapStyle.Round,
      });
    }
  }
}

async function applyStickyNotes(
  page: { drawImage: (img: unknown, opts: object) => void },
  pw: number,
  ph: number,
  stickyNotes: StickyNote[],
  embedPng: (bytes: Uint8Array) => Promise<unknown>,
): Promise<void> {
  for (const s of stickyNotes) {
    const content = s.content?.trim();
    if (!content) continue;

    const noteX    = s.x / 100 * pw;
    const noteTopY = s.y / 100 * ph;                          // distance from page top
    const boxW     = Math.max(60, s.width / 100 * pw);
    const estLines = content.split("\n").length + Math.ceil(content.length / 28);
    const boxH     = Math.max(ph * 0.055, estLines * 15 + 12);

    const pngBytes = await renderStickyNote(content, boxW, boxH, s.color);
    const img = await embedPng(pngBytes);

    page.drawImage(img, {
      x: noteX,
      y: ph - noteTopY - boxH,  // flip: top of note from page-top → PDF bottom-left y
      width: boxW,
      height: boxH,
    });
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function exportAnnotatedPdf(
  documentId: string,
  documentTitle: string,
): Promise<void> {
  const { PDFDocument, rgb, LineCapStyle } = await import("pdf-lib");

  const [urlRes, highlightsRes, stickiesRes, drawingsRes] = await Promise.all([
    api.get(`/documents/${documentId}/url`).then((r) => r.data),
    api.get(`/documents/${documentId}/highlights`, { params: { pdf_page_from: 1, limit: 500 } }).then((r) => r.data),
    api.get(`/documents/${documentId}/sticky-notes`).then((r) => r.data),
    api.get(`/documents/${documentId}/drawings`).then((r) => r.data),
  ]);

  const pdfBytes = await fetch(urlRes.url).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const hlByPage = groupByPage<Highlight>(highlightsRes, (h) => h.position?.pageNumber ?? 1);
  const stByPage = groupByPage<StickyNote>(stickiesRes, (s) => s.page);
  const drByPage = groupByPage<DrawingStroke>(drawingsRes, (d) => d.page);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = i + 1;
    const { width: pw, height: ph } = page.getSize();

    applyHighlights(page as never, pw, ph, hlByPage[pageNum] ?? [], rgb as never);
    applyDrawings(page as never, pw, ph, drByPage[pageNum] ?? [], rgb as never, LineCapStyle);
    await applyStickyNotes(
      page as never,
      pw,
      ph,
      stByPage[pageNum] ?? [],
      (bytes) => pdfDoc.embedPng(bytes as Uint8Array),
    );
  }

  const outputBytes = await pdfDoc.save();
  const today = new Date().toISOString().slice(0, 10);
  triggerDownload(outputBytes, `${sanitizeFilename(documentTitle)}_${today}_annotated.pdf`);
}
