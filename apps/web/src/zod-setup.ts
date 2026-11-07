/**
 * Imported first in main.tsx, before any schema exists: zod 4 checks once whether
 * `new Function` works (to speed up parsing) when the first object schema is created. Our CSP
 * forbids eval, so the check fails harmlessly but is reported as a CSP violation. jitless
 * skips it; validation results are identical.
 */
import { z } from 'zod';

z.config({ jitless: true });
