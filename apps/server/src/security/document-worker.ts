/**
 * Runs in a worker thread: extracts plain text from one document. The parent enforces
 * memory and time limits and kills this thread if they are exceeded.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import type { getDocumentProxy } from 'unpdf';
import type { DocumentKind } from './documents.ts';

interface Input {
  kind: DocumentKind;
  bytes: Uint8Array;
  maxChars: number;
  maxScanPages: number;
}

/** A page with fewer characters than this is treated as a scan if it holds an image. */
const SCAN_TEXT_CHARS = 20;
/** Scanned pages are stored at this size (long side) as JPEG. */
const SCAN_MAX_PX = 1600;
/**
 * Scanned pages are drawn at this size first, then shrunk by sharp: canvas shrinks scanners'
 * high-resolution 1-bit text layers by sampling, which drops thin strokes.
 */
const SCAN_RENDER_PX = 3200;
/** Ignore page images smaller than this (logos, icons) and larger than this (bombs). */
const SCAN_MIN_PX = 300;
const SCAN_MAX_PIXELS = 40_000_000;
/** Contrast of a scan is stretched by at most this factor (more only amplifies noise). */
const SCAN_MAX_STRETCH = 4;

interface Extracted {
  text: string;
  pages: number | null;
  scans: Uint8Array[];
}

/** pdf.js's wasm decoders, from pdfjs-dist (the version unpdf bundles); ends in '/'. */
const PDFJS_WASM = `${join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'wasm')}/`;

const MAX_ROWS = 5000;
const MAX_COLS = 60;

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/** Operators that paint an image; their size is in args (see imageSize). */
const IMAGE_OPS = [
  'paintImageXObject',
  'paintImageXObjectRepeat',
  'paintImageMaskXObject',
  'paintImageMaskXObjectRepeat',
  'paintInlineImageXObject',
] as const;

/** Width and height of a painted image from its operator arguments, if present. */
function imageSize(name: string, args: unknown): { width: number; height: number } | null {
  if (!Array.isArray(args)) return null;
  // paintImageXObject(Repeat): [objId, width, height, …]; masks and inline images: [{width, height, …}, …].
  const [first, w, h] = args as unknown[];
  if (name.startsWith('paintImageXObject')) {
    return typeof w === 'number' && typeof h === 'number' ? { width: w, height: h } : null;
  }
  if (typeof first !== 'object' || first === null) return null;
  const { width, height } = first as { width?: unknown; height?: unknown };
  return typeof width === 'number' && typeof height === 'number' ? { width, height } : null;
}

/**
 * Whether a page holds a scan: at least one page-sized image (not a logo), and no image
 * large enough to be a decompression bomb.
 */
async function hasScan(doc: PdfDocument, page: number): Promise<boolean> {
  const { getResolvedPDFJS } = await import('unpdf');
  const { OPS } = await getResolvedPDFJS();
  const codes = new Map<number, string>(IMAGE_OPS.map((name) => [OPS[name], name]));
  const ops = await (await doc.getPage(page)).getOperatorList();
  let found = false;
  for (const [i, fn] of ops.fnArray.entries()) {
    const name = codes.get(fn);
    if (!name) continue;
    const size = imageSize(name, ops.argsArray[i]);
    if (!size) continue;
    if (size.width * size.height > SCAN_MAX_PIXELS) return false;
    if (Math.min(size.width, size.height) >= SCAN_MIN_PX) found = true;
  }
  return found;
}

/**
 * Levels for a scan as sharp `linear` factors: the paper (75th brightness percentile,
 * as paper covers most of a page) becomes white and the darkest print (0.1th percentile)
 * black, stretched at most SCAN_MAX_STRETCH times. Faint print of a washed-out scan
 * covers too few pixels for sharp's own percentile-based `normalise`.
 */
function levels(grey: Uint8Array): { a: number; b: number } {
  const histogram = new Array<number>(256).fill(0);
  for (const v of grey) histogram[v] = (histogram[v] ?? 0) + 1;
  const percentile = (p: number): number => {
    let seen = 0;
    for (const [v, n] of histogram.entries()) {
      seen += n;
      if (seen >= grey.length * p) return v;
    }
    return 255;
  };
  const black = percentile(0.001);
  const white = percentile(0.75);
  if (white - black < 16) return { a: 1, b: 0 };
  const a = Math.min(255 / (white - black), SCAN_MAX_STRETCH);
  return { a, b: 255 - a * white };
}

/**
 * A scanned page drawn the way a viewer shows it, as a JPEG. Drawing the whole page (not
 * the largest embedded image) keeps scanners' separate text layers (a light background
 * picture plus a black text mask) and pages stored as strips. Levels are stretched (see
 * levels) because vision models shrink the image further and faint print fades.
 */
async function pageScan(doc: PdfDocument, page: number): Promise<Uint8Array | null> {
  if (!(await hasScan(doc, page))) return null;
  const { renderPageAsImage } = await import('unpdf');
  const { default: sharp } = await import('sharp');
  const { width, height } = (await doc.getPage(page)).getViewport({ scale: 1 });
  const scale = SCAN_RENDER_PX / Math.max(width, height);
  const png = await renderPageAsImage(doc, page, {
    scale,
    canvasImport: () => import('@napi-rs/canvas'),
  });
  const shrunk = await sharp(Buffer.from(png), {
    limitInputPixels: SCAN_RENDER_PX * SCAN_RENDER_PX,
  })
    .flatten({ background: '#ffffff' })
    .resize({ width: SCAN_MAX_PX, height: SCAN_MAX_PX, fit: 'inside' })
    .png()
    .toBuffer();
  const image = sharp(shrunk);
  const grey = await image.clone().greyscale().raw().toBuffer();
  const { a, b } = levels(grey);
  const jpeg = await image.linear(a, b).jpeg({ quality: 85 }).toBuffer();
  return new Uint8Array(jpeg);
}

async function pdf(bytes: Uint8Array, maxScanPages: number): Promise<Extracted> {
  const { definePDFJSModule, extractText, getDocumentProxy } = await import('unpdf');
  // The official pdf.js build: unpdf's bundled one can't load the wasm decoders below.
  await definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'));
  const doc = await getDocumentProxy(bytes, {
    // Decoders for scanners' JBIG2 text layers and JPEG 2000 pictures; without them pdf.js
    // skips such images silently.
    wasmUrl: PDFJS_WASM,
    maxImageSize: SCAN_MAX_PIXELS,
  });
  const { text, totalPages } = await extractText(doc, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const scans: Uint8Array[] = [];
  const parts: string[] = [];
  for (const [i, raw] of pages.entries()) {
    let body = raw.trim();
    // Pages without text are usually scans: keep their image for models that can see.
    if (body.length < SCAN_TEXT_CHARS && scans.length < maxScanPages) {
      const scan = await pageScan(doc, i + 1).catch(() => null);
      if (scan) {
        scans.push(scan);
        body =
          `${body}\n[Gescannte Seite, Bild ${String(scans.length)} / scanned page, image ${String(scans.length)}]`.trim();
      }
    }
    parts.push(`--- Seite/Page ${String(i + 1)} ---\n${body}`);
  }
  return { text: parts.join('\n\n'), pages: totalPages, scans };
}

async function docx(bytes: Uint8Array): Promise<Extracted> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return { text: result.value.trim(), pages: null, scans: [] };
}

async function xlsx(bytes: Uint8Array): Promise<Extracted> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const parts: string[] = [];
  for (const sheet of wb.worksheets) {
    const rows: string[] = [];
    let count = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (count++ >= MAX_ROWS) return;
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, MAX_COLS); c++) {
        const v = row.getCell(c).text;
        cells.push(v.replace(/\t|\n/g, ' '));
      }
      rows.push(cells.join('\t').trimEnd());
    });
    const more = count > MAX_ROWS ? `\n[… ${String(count - MAX_ROWS)} more rows]` : '';
    parts.push(`--- Tabelle/Sheet: ${sheet.name} ---\n${rows.join('\n')}${more}`);
  }
  return { text: parts.join('\n\n'), pages: wb.worksheets.length, scans: [] };
}

async function main(): Promise<void> {
  const input = workerData as Input;
  const { text, pages, scans } =
    input.kind === 'pdf'
      ? await pdf(input.bytes, input.maxScanPages)
      : input.kind === 'docx'
        ? await docx(input.bytes)
        : await xlsx(input.bytes);
  const clipped = text.length > input.maxChars;
  parentPort?.postMessage({
    ok: true,
    text: clipped ? `${text.slice(0, input.maxChars)}\n[… gekürzt / truncated]` : text,
    pages,
    scans,
  });
}

main().catch(() => {
  // No details: errors from parsers can contain document content.
  parentPort?.postMessage({ ok: false });
});
