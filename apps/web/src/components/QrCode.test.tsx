import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import qrcode from 'qrcode-generator';
import { QrCode, qrMatrix } from './QrCode.tsx';

const LINK = 'https://join.relay.example/j#1~zt0jr4qknd6e.h.relay.example~l~' + 'A'.repeat(43);

describe('QrCode', () => {
  it('matches the generator module for module', () => {
    const ref = qrcode(0, 'M');
    ref.addData(LINK, 'Byte');
    ref.make();
    const m = qrMatrix(LINK);
    expect(m.length).toBe(ref.getModuleCount());
    // A ~100-character link needs version 6 at level M (41 × 41 modules).
    expect(m.length).toBe(41);
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m.length; c++) expect(m[r]?.[c]).toBe(ref.isDark(r, c));
    }
  });

  it('draws one path inside a quiet zone of 4 modules, with a label', () => {
    const { container } = render(<QrCode value={LINK} label="Sign-in code" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Sign-in code');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 49 49');
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    const d = paths[0]?.getAttribute('d') ?? '';
    const darkCount = qrMatrix(LINK).flat().filter(Boolean).length;
    expect(d.split('M').length - 1).toBe(darkCount);
    // The top-left finder pattern starts right after the quiet zone.
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
    expect(d.includes('M3 ')).toBe(false);
  });
});
