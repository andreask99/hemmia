/**
 * Amounts and units as recipes write them, in English, German, French and Italian:
 * "1½ cups", "1 1/2", "2-3", "⅓", "1,5 l", "2 EL", "1 c. à soupe", "un pizzico". Converts to
 * base units (grams, millilitres, pieces and a few countable units). Pure functions.
 */
import type { LineUnit } from '@hemmia/shared';

const VULGAR: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half: 0.5,
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  halbe: 0.5,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
};

/** One number: "2", "1.5", "1,5", "½", "1½", "1 1/2", "3/4", "two". Null if it isn't one. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === '') return null;
  if (s in WORDS) return WORDS[s] ?? null;
  // "1½" or "1 ½"
  const mixedVulgar = /^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/u.exec(s);
  if (mixedVulgar) {
    const whole = mixedVulgar[1] ? Number(mixedVulgar[1]) : 0;
    return whole + (VULGAR[mixedVulgar[2] ?? ''] ?? 0);
  }
  // "1 1/2" or "3/4" (also with the fraction slash ⁄)
  const frac = /^(?:(\d+)\s+)?(\d+)\s*[/⁄]\s*(\d+)$/u.exec(s);
  if (frac) {
    const den = Number(frac[3]);
    if (den === 0) return null;
    return (frac[1] ? Number(frac[1]) : 0) + Number(frac[2]) / den;
  }
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return null;
}

/** An amount, possibly a range ("2-3", "2 to 3", "2–3"): the upper end, for shopping. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  const range = /^(.+?)\s*(?:-|–|—|to|bis|à|a|o)\s*(.+)$/iu.exec(s);
  if (range) {
    const lo = parseNumber(range[1] ?? '');
    const hi = parseNumber(range[2] ?? '');
    if (lo !== null && hi !== null) return Math.max(lo, hi);
  }
  return parseNumber(s);
}

/** How a recipe unit converts: `factor` base units of `base` each; `none` = no amount ("to taste"). */
export type UnitInfo = { base: LineUnit; factor: number } | { base: 'none' };

const UNIT_LIST: [string[], UnitInfo][] = [
  [
    ['g', 'gr', 'gram', 'grams', 'gramm', 'gramme', 'grammes', 'grammi', 'grammo'],
    { base: 'g', factor: 1 },
  ],
  [['kg', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramm'], { base: 'g', factor: 1000 }],
  [['mg'], { base: 'g', factor: 0.001 }],
  [['oz', 'ounce', 'ounces'], { base: 'g', factor: 28.35 }],
  [['lb', 'lbs', 'pound', 'pounds'], { base: 'g', factor: 453.6 }],
  [['pfund'], { base: 'g', factor: 500 }],
  [['stick', 'sticks'], { base: 'g', factor: 113.4 }],
  [
    ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'millilitri'],
    { base: 'ml', factor: 1 },
  ],
  [['cl', 'centilitre', 'centilitres', 'centilitri'], { base: 'ml', factor: 10 }],
  [['dl', 'decilitre', 'deciliter', 'decilitri'], { base: 'ml', factor: 100 }],
  [['l', 'liter', 'liters', 'litre', 'litres', 'litro', 'litri'], { base: 'ml', factor: 1000 }],
  [['cup', 'cups', 'c'], { base: 'ml', factor: 240 }],
  [['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'], { base: 'ml', factor: 29.57 }],
  [['pint', 'pints', 'pt'], { base: 'ml', factor: 473 }],
  [['quart', 'quarts', 'qt'], { base: 'ml', factor: 946 }],
  [['gallon', 'gallons', 'gal'], { base: 'ml', factor: 3785 }],
  [
    [
      'tbsp',
      'tbs',
      'tablespoon',
      'tablespoons',
      'el',
      'esslöffel',
      'eßlöffel',
      'c. à s.',
      'c. à soupe',
      'c.à.s.',
      'cs',
      'cuillère à soupe',
      'cuillères à soupe',
      'cucchiaio',
      'cucchiai',
    ],
    { base: 'ml', factor: 15 },
  ],
  [
    [
      'tsp',
      'teaspoon',
      'teaspoons',
      'tl',
      'teelöffel',
      'c. à c.',
      'c. à café',
      'c.à.c.',
      'cc',
      'cuillère à café',
      'cuillères à café',
      'cucchiaino',
      'cucchiaini',
    ],
    { base: 'ml', factor: 5 },
  ],
  [
    [
      'piece',
      'pieces',
      'pc',
      'pcs',
      'stück',
      'stk',
      'stk.',
      'pièce',
      'pièces',
      'pezzo',
      'pezzi',
      'medium',
      'large',
      'small',
    ],
    { base: 'piece', factor: 1 },
  ],
  [
    [
      'can',
      'cans',
      'tin',
      'tins',
      'dose',
      'dosen',
      'boîte',
      'boîtes',
      'lattina',
      'lattine',
      'barattolo',
      'barattoli',
    ],
    { base: 'can', factor: 1 },
  ],
  [
    ['bunch', 'bunches', 'bund', 'botte', 'bottes', 'mazzo', 'mazzi', 'mazzetto'],
    { base: 'bunch', factor: 1 },
  ],
  [
    ['clove', 'cloves', 'zehe', 'zehen', 'gousse', 'gousses', 'spicchio', 'spicchi'],
    { base: 'clove', factor: 1 },
  ],
  [
    [
      'pack',
      'packs',
      'box',
      'boxes',
      'schachtel',
      'jar',
      'jars',
      'glas',
      'gläser',
      'bocal',
      'pot',
      'vasetto',
      'vasetti',
      'bottle',
      'bottles',
      'flasche',
      'bouteille',
      'bottiglia',
      'package',
      'packages',
      'packet',
      'packets',
      'packung',
      'packungen',
      'päckchen',
      'pck',
      'pck.',
      'pkg',
      'paquet',
      'paquets',
      'sachet',
      'sachets',
      'bustina',
      'bustine',
      'confezione',
      'confezioni',
    ],
    { base: 'pack', factor: 1 },
  ],
  [
    ['slice', 'slices', 'scheibe', 'scheiben', 'tranche', 'tranches', 'fetta', 'fette'],
    { base: 'slice', factor: 1 },
  ],
  [
    [
      'pinch',
      'pinches',
      'dash',
      'prise',
      'prisen',
      'pincée',
      'pincées',
      'pizzico',
      'pizzichi',
      'q.b.',
      'qb',
      'to taste',
      'nach geschmack',
      'etwas',
      'some',
    ],
    { base: 'none' },
  ],
];

const UNITS = new Map<string, UnitInfo>();
for (const [names, info] of UNIT_LIST) for (const n of names) UNITS.set(n, info);

/** A unit as written ("Cups", "EL", "c. à s."); undefined when unknown. */
export function unitInfo(raw: string): UnitInfo | undefined {
  return UNITS.get(raw.trim().toLowerCase().replace(/\s+/g, ' '));
}

/** An amount in base units (null amount: "to taste", or no number given). */
export interface BaseAmount {
  amount: number | null;
  unit: LineUnit;
}

/**
 * Converts an amount and unit as the recipe writes them. No unit means pieces ("2 onions").
 * An unknown unit is treated as pieces too, so nothing gets lost.
 */
export function toBase(amount: string | number | null, unit: string | null): BaseAmount {
  // Models sometimes put the unit in the amount: "250 g", "2 fillets".
  if (typeof amount === 'string' && parseAmount(amount) === null) {
    const m = NUMBER_PREFIX.exec(amount.trim().replace(/\s+/g, ' '));
    if (m) {
      const rest = amount.trim().slice(m[0].length);
      const own = unit && unit.trim() !== '' ? unit : leadingUnit(rest);
      return toBase(m[1] ?? null, own);
    }
  }
  const n = typeof amount === 'number' ? amount : amount === null ? null : parseAmount(amount);
  const info = unit && unit.trim() !== '' ? unitInfo(unit) : { base: 'piece' as const, factor: 1 };
  if (info === undefined) return { amount: n, unit: 'piece' };
  if (info.base === 'none') return { amount: null, unit: 'g' };
  return { amount: n === null ? null : n * info.factor, unit: info.base };
}

/** A number at the start of a text: "1 1/2 cups", "½ tsp", "2-3 apples", "250g". */
const NUMBER_PREFIX =
  /^((?:\d+\s+)?\d+\s*[/⁄]\s*\d+|\d*\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*/u;

/** The longest unit at the start of `s` (after the number): "cups flour" → "cups". */
function leadingUnit(s: string): string | null {
  const lower = s.toLowerCase();
  let best: string | null = null;
  for (const name of UNITS.keys()) {
    if (lower.startsWith(name) && (best === null || name.length > best.length)) {
      const next = lower.charAt(name.length);
      if (next === '' || /[\s.,)]/u.test(next)) best = name;
    }
  }
  return best;
}

/**
 * An item typed by hand: "milk", "2 l Milch", "500g Hackfleisch", "6 eggs", "½ cup cream".
 * Returns the name and the amount in base units (null amount when none is given).
 */
export function parseTyped(text: string): { name: string; base: BaseAmount } {
  const s = text.trim().replace(/\s+/g, ' ');
  const num = NUMBER_PREFIX.exec(s);
  if (!num) return { name: s, base: { amount: null, unit: 'piece' } };
  const rest = s.slice(num[0].length);
  const unit = leadingUnit(rest);
  const name = (unit ? rest.slice(unit.length) : rest).replace(/^[\s.]+/, '').trim();
  if (name === '') return { name: s, base: { amount: null, unit: 'piece' } };
  return { name, base: toBase(num[1] ?? null, unit) };
}
