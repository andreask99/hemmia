/** How shopping amounts read: "250 g", "2 × 250 g", "1 bunch", "6", "8 fl oz". */
import type { BuyAmount, Country, ShoppingItem } from '@hemmia/shared';
import type { MessageKey, TFunction } from '../i18n/index.tsx';

const SYMBOLS: Partial<Record<BuyAmount['unit'], string>> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  lb: 'lb',
  oz: 'oz',
  fl_oz: 'fl oz',
  qt: 'qt',
  gal: 'gal',
};

/** Units said with a word ("bunch", "Bund"): one and many. */
const WORDS: Record<string, [MessageKey, MessageKey]> = {
  pack: ['shopping.unit.pack1', 'shopping.unit.packN'],
  bunch: ['shopping.unit.bunch1', 'shopping.unit.bunchN'],
  can: ['shopping.unit.can1', 'shopping.unit.canN'],
  bulb: ['shopping.unit.bulb1', 'shopping.unit.bulbN'],
  jar: ['shopping.unit.jar1', 'shopping.unit.jarN'],
  pt: ['shopping.unit.pint1', 'shopping.unit.pintN'],
  clove: ['shopping.unit.clove1', 'shopping.unit.cloveN'],
};

export function numberFormat(language: string) {
  const f = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return (n: number) => f.format(n);
}

function word(unit: string, n: number, t: TFunction, num: (n: number) => string): string {
  const keys = WORDS[unit];
  if (!keys) return num(n);
  return t(n === 1 ? keys[0] : keys[1], { n: num(n) });
}

export function formatBuy(b: BuyAmount, t: TFunction, language: string): string {
  const num = numberFormat(language);
  const symbol = SYMBOLS[b.unit];
  if (b.size !== null && symbol) {
    const one = `${num(b.size)} ${symbol}`;
    return b.count > 1 ? `${num(b.count)} × ${one}` : one;
  }
  if (b.unit === 'pt' && b.size !== null) {
    const one = word('pt', b.size, t, num);
    return b.count > 1 ? `${num(b.count)} × ${one}` : one;
  }
  if (b.unit === 'piece') return num(b.count);
  return word(b.unit, b.count, t, num);
}

/** What the recipes need together, in the country's units. */
export function formatNeed(
  need: NonNullable<ShoppingItem['need']>,
  country: Country,
  t: TFunction,
  language: string,
): string {
  const num = numberFormat(language);
  const round = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  switch (need.unit) {
    case 'g':
      if (country === 'US') {
        return need.amount >= 453.6
          ? `${num(round(need.amount / 453.6))} lb`
          : `${num(round(need.amount / 28.35))} oz`;
      }
      return need.amount >= 1000
        ? `${num(round(need.amount / 1000))} kg`
        : `${num(round(need.amount))} g`;
    case 'ml':
      if (country === 'US') return `${num(round(need.amount / 29.57))} fl oz`;
      return need.amount >= 1000
        ? `${num(round(need.amount / 1000))} l`
        : `${num(round(need.amount))} ml`;
    case 'piece':
    case 'slice':
      return num(round(need.amount));
    default:
      return word(need.unit, round(need.amount), t, num);
  }
}
