/** Small generated documents for tests. */
import ExcelJS from 'exceljs';

/** A tiny one-page PDF with one line of text. */
export function tinyPdf(line: string): Buffer {
  const stream = `BT /F1 18 Tf 20 60 Td (${line}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${String(stream.length)}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`,
    'latin1',
  );
}

export async function tinyXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Budget');
  ws.addRow(['Posten', 'Betrag']);
  ws.addRow(['Miete', 1200]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * A JPEG with large text on white, like a scanned letter (rendered by sharp from SVG). A
 * light `color` imitates a washed-out scan.
 */
export async function scanJpeg(
  lines: string[],
  width = 1240,
  height = 1754,
  color = 'black',
): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const text = lines
    .map(
      (l, i) =>
        `<text x="80" y="${String(200 + i * 90)}" font-size="64" font-family="Helvetica" fill="${color}">${l}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect width="100%" height="100%" fill="white"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/**
 * A 1-bit image mask (0 = painted) of black text, as compact scanner PDFs store the print
 * in a layer of its own above a light background picture.
 */
export async function scanMask(
  lines: string[],
  width = 1240,
  height = 1754,
): Promise<{ bits: Buffer; width: number; height: number }> {
  const { default: sharp } = await import('sharp');
  const grey = await sharp(await scanJpeg(lines, width, height))
    .greyscale()
    .raw()
    .toBuffer();
  const rowBytes = Math.ceil(width / 8);
  const bits = Buffer.alloc(rowBytes * height, 0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((grey[y * width + x] ?? 255) < 128) {
        const i = y * rowBytes + (x >> 3);
        bits[i] = (bits[i] ?? 0) & ~(0x80 >> (x & 7));
      }
    }
  }
  return { bits, width, height };
}

/**
 * A PDF whose pages are only images (no text layer), as a scanner produces; `mask` adds a
 * black text layer over the picture.
 */
export function scannedPdf(
  pages: {
    jpeg: Buffer;
    width: number;
    height: number;
    /** `jbig2`: `bits` is an embedded JBIG2 stream, as scanners code their text layers. */
    mask?: { bits: Buffer; width: number; height: number; jbig2?: boolean; decode?: string };
  }[],
): Buffer {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
    parts.push(buf);
    length += buf.length;
  };
  const obj = (n: number, body: (Buffer | string)[]) => {
    offsets[n] = length;
    push(`${String(n)} 0 obj\n`);
    for (const b of body) push(b);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  const kids = pages.map((_, i) => `${String(3 + i * 4)} 0 R`).join(' ');
  obj(1, ['<</Type/Catalog/Pages 2 0 R>>']);
  obj(2, [`<</Type/Pages/Kids[${kids}]/Count ${String(pages.length)}>>`]);
  pages.forEach((p, i) => {
    const page = 3 + i * 4;
    const content = `q 595 0 0 842 0 0 cm /Im1 Do Q${p.mask ? ' q 0 g 595 0 0 842 0 0 cm /Im2 Do Q' : ''}`;
    obj(page, [
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${String(page + 1)} 0 R/Resources<</XObject<</Im1 ${String(page + 2)} 0 R/Im2 ${String(page + 3)} 0 R>>>>>>`,
    ]);
    obj(page + 1, [`<</Length ${String(content.length)}>>stream\n${content}\nendstream`]);
    obj(page + 2, [
      `<</Type/XObject/Subtype/Image/Width ${String(p.width)}/Height ${String(p.height)}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${String(p.jpeg.length)}>>stream\n`,
      p.jpeg,
      '\nendstream',
    ]);
    const mask = p.mask ?? { bits: Buffer.alloc(1, 0xff), width: 1, height: 1 };
    obj(page + 3, [
      `<</Type/XObject/Subtype/Image/Width ${String(mask.width)}/Height ${String(mask.height)}/ImageMask true/BitsPerComponent 1${mask.jbig2 ? '/Filter/JBIG2Decode' : ''}${mask.decode ?? ''}/Length ${String(mask.bits.length)}>>stream\n`,
      mask.bits,
      '\nendstream',
    ]);
  });
  const xref = length;
  const count = 3 + pages.length * 4;
  push(`xref\n0 ${String(count)}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`);
  push(`trailer<</Size ${String(count)}/Root 1 0 R>>\nstartxref\n${String(xref)}\n%%EOF`);
  return Buffer.concat(parts);
}

/**
 * A blank (white) picture as an embedded JBIG2 stream: page information, one generic region
 * in MMR coding (each row equals the one above: code `1`, then end of block), end of page.
 * pdf.js decodes JBIG2 only with its wasm module.
 */
export function blankJbig2(width: number, height: number): Buffer {
  const bits: number[] = Array.from({ length: height }, () => 1);
  for (const _ of [0, 1]) bits.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
  const mmr = Buffer.alloc(Math.ceil(bits.length / 8));
  bits.forEach((bit, i) => {
    if (bit) mmr[i >> 3] = (mmr[i >> 3] ?? 0) | (0x80 >> (i & 7));
  });
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  // Segment header: number, type, no referred-to segments, page 1, data length.
  const segment = (n: number, type: number, data: Buffer) =>
    Buffer.concat([u32(n), Buffer.from([type, 0, 1]), u32(data.length), data]);
  const pageInfo = Buffer.concat([u32(width), u32(height), u32(0), u32(0), Buffer.from([0, 0, 0])]);
  const region = Buffer.concat([u32(width), u32(height), u32(0), u32(0), Buffer.from([0, 1]), mmr]);
  return Buffer.concat([
    segment(0, 48, pageInfo),
    segment(1, 38, region),
    segment(2, 49, Buffer.alloc(0)),
  ]);
}
