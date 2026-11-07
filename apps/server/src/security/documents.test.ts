import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  blankJbig2,
  scanJpeg,
  scanMask,
  scannedPdf,
  tinyPdf,
  tinyXlsx,
} from './document-fixtures.ts';
import { DocumentRejectedError, extractText, sniffDocument } from './documents.ts';

describe('sniffDocument', () => {
  it('recognises PDF and Office files by content', async () => {
    expect(sniffDocument(tinyPdf('x'))).toBe('pdf');
    expect(sniffDocument(await tinyXlsx())).toBe('xlsx');
    expect(sniffDocument(Buffer.from('PK\u0003\u0004 random zip without office parts'))).toBeNull();
    expect(sniffDocument(Buffer.from('hello'))).toBeNull();
    expect(sniffDocument(Buffer.from('<html><script>'))).toBeNull();
  });
});

describe('extractText', () => {
  it('extracts PDF pages and spreadsheet rows', async () => {
    expect(await extractText('pdf', tinyPdf('Abschlag 86 EUR'))).toEqual({
      text: '--- Seite/Page 1 ---\nAbschlag 86 EUR',
      pages: 1,
      scans: [],
    });
    const sheet = await extractText('xlsx', await tinyXlsx());
    expect(sheet.text).toContain('Miete\t1200');
    expect(sheet.pages).toBe(1);
  });

  it('rejects broken files without crashing the server', async () => {
    const broken = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1000, 0x41)]);
    await expect(extractText('pdf', broken)).rejects.toBeInstanceOf(DocumentRejectedError);
    await expect(extractText('docx', Buffer.from('PK\u0003\u0004garbage'))).rejects.toBeInstanceOf(
      DocumentRejectedError,
    );
  });
});

describe('scanned PDFs', () => {
  it('keeps page images of pages without text, downscaled JPEG, and marks them in the text', async () => {
    const jpeg = await scanJpeg(['Abschlag 86 EUR']);
    const pdf = scannedPdf([
      { jpeg, width: 1240, height: 1754 },
      { jpeg, width: 1240, height: 1754 },
    ]);
    const out = await extractText('pdf', pdf);
    expect(out.pages).toBe(2);
    expect(out.scans).toHaveLength(2);
    const meta = await sharp(out.scans[0]).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width, meta.height)).toBe(1600);
    expect(out.text).toContain(
      '--- Seite/Page 2 ---\n[Gescannte Seite, Bild 2 / scanned page, image 2]',
    );
  });

  it('draws the whole page, including a separate text layer over the picture', async () => {
    // A compact scan: blank background picture, the print as a black image mask on top.
    const background = await scanJpeg([]);
    const mask = await scanMask(['Abschlag 86 EUR']);
    const out = await extractText(
      'pdf',
      scannedPdf([{ jpeg: background, width: 1240, height: 1754, mask }]),
    );
    expect(out.scans).toHaveLength(1);
    const { channels } = await sharp(out.scans[0]).stats();
    expect(channels[0]?.min).toBeLessThan(60);
  });

  it('darkens faint print of washed-out scans', async () => {
    const jpeg = await scanJpeg(['Abschlag 86 EUR'], 1240, 1754, '#d0d0d0');
    const out = await extractText('pdf', scannedPdf([{ jpeg, width: 1240, height: 1754 }]));
    const { channels } = await sharp(out.scans[0]).stats();
    expect(channels[0]?.min).toBeLessThan(100);
    expect(channels[0]?.max).toBeGreaterThan(245);
  });

  it('decodes JBIG2 text layers (pdf.js wasm decoders)', async () => {
    // A blank JBIG2 mask with an inverted Decode paints its whole area (the page) black.
    const mask = { bits: blankJbig2(400, 400), width: 400, height: 400, jbig2: true };
    const pdf = scannedPdf([
      {
        jpeg: await scanJpeg([]),
        width: 1240,
        height: 1754,
        mask: { ...mask, decode: '/Decode[1 0]' },
      },
    ]);
    const { channels } = await sharp((await extractText('pdf', pdf)).scans[0]).stats();
    expect(channels[0]?.mean).toBeLessThan(10);
  });

  it('ignores small images such as logos', async () => {
    const logo = await scanJpeg(['x'], 120, 120);
    const out = await extractText('pdf', scannedPdf([{ jpeg: logo, width: 120, height: 120 }]));
    expect(out.scans).toEqual([]);
  });
});
