/**
 * Document uploads (PDF, Excel, Word): recognition by content and text extraction in an
 * isolated worker thread with memory and time limits. Owned by Claude (upload validation).
 */
import { Worker } from 'node:worker_threads';
import { z } from 'zod';

export type DocumentKind = 'pdf' | 'xlsx' | 'docx';

export const DOCUMENT_MIME: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Text kept per document (~100k tokens); the context builder trims further. */
export const MAX_DOCUMENT_CHARS = 400_000;
/** Scanned PDF pages kept as images; later pages are only listed as scanned. */
export const MAX_SCAN_PAGES = 10;
/** Decoding scanned pages (JBIG2, JPEG) is slower than reading text. */
const EXTRACT_TIMEOUT_MS = 60_000;
const WORKER_HEAP_MB = 512;

export class DocumentRejectedError extends Error {
  override name = 'DocumentRejectedError';
  constructor() {
    super('document rejected');
  }
}

/**
 * The document kind by its bytes: PDF by its header; Office files are ZIP archives that
 * must contain [Content_Types].xml and the part folder of their type (xl/ or word/).
 */
export function sniffDocument(buf: Uint8Array): DocumentKind | null {
  const head = Buffer.from(buf.subarray(0, 5)).toString('latin1');
  if (head === '%PDF-') return 'pdf';
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return null;
  }
  // ZIP local file headers carry the entry names in clear: look for the OOXML markers.
  const sample = Buffer.from(buf.subarray(0, Math.min(buf.length, 2 * 1024 * 1024))).toString(
    'latin1',
  );
  if (!sample.includes('[Content_Types].xml')) return null;
  if (sample.includes('xl/')) return 'xlsx';
  if (sample.includes('word/')) return 'docx';
  return null;
}

export interface ExtractedText {
  text: string;
  pages: number | null;
  /** JPEGs of scanned pages (at most MAX_SCAN_PAGES), produced by sharp in the worker. */
  scans: Buffer[];
}

const WorkerResult = z.object({
  ok: z.literal(true),
  text: z.string(),
  pages: z.number().int().nullable(),
  scans: z.array(z.instanceof(Uint8Array)).max(MAX_SCAN_PAGES),
});

/** Extracts text in a worker thread; rejects on failure, timeout or memory exhaustion. */
export function extractText(kind: DocumentKind, bytes: Buffer): Promise<ExtractedText> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./document-worker.ts', import.meta.url), {
      workerData: {
        kind,
        bytes: new Uint8Array(bytes),
        maxChars: MAX_DOCUMENT_CHARS,
        maxScanPages: MAX_SCAN_PAGES,
      },
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB, maxYoungGenerationSizeMb: 64 },
      stdout: true,
      stderr: true,
    });
    // Parser libraries may print warnings that quote document content: discard.
    worker.stdout.resume();
    worker.stderr.resume();
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        reject(new DocumentRejectedError());
      });
    }, EXTRACT_TIMEOUT_MS);
    worker.on('message', (msg: unknown) => {
      finish(() => {
        const parsed = WorkerResult.safeParse(msg);
        if (parsed.success) {
          const { text, pages, scans } = parsed.data;
          resolve({ text, pages, scans: scans.map((s) => Buffer.from(s)) });
        } else reject(new DocumentRejectedError());
      });
    });
    worker.on('error', () => {
      finish(() => {
        reject(new DocumentRejectedError());
      });
    });
    worker.on('exit', () => {
      finish(() => {
        reject(new DocumentRejectedError());
      });
    });
  });
}
