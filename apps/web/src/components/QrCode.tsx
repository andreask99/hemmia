import { useMemo } from 'react';
import { useSensitiveScreen } from '../native/hooks.ts';
import qrcode from 'qrcode-generator';

const QUIET = 4;

/** The modules of a QR code (error correction M) for a text, as a matrix of dark/light. */
export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * A QR code as SVG built from React elements: one path for the dark modules on a light
 * square with a 4-module quiet zone. Always dark on light, also in dark mode, so cameras
 * read it.
 */
export function QrCode({
  value,
  size = 224,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  useSensitiveScreen();
  const { path, total } = useMemo(() => {
    const m = qrMatrix(value);
    let d = '';
    m.forEach((row, r) => {
      row.forEach((dark, c) => {
        if (dark) d += `M${String(c + QUIET)} ${String(r + QUIET)}h1v1h-1z`;
      });
    });
    return { path: d, total: m.length + QUIET * 2 };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${String(total)} ${String(total)}`}
      shapeRendering="crispEdges"
      className="rounded-xl"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#17231f" />
    </svg>
  );
}
