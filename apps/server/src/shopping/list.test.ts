import { describe, expect, it } from 'vitest';
import type { Country } from '@hemmia/shared';
import { mergeKey } from './ingredients.ts';
import { buildList, EMPTY_PANTRY, pickPack, type StoredLine, type StoredList } from './list.ts';
import { parseAmount, parseNumber, parseTyped, toBase } from './units.ts';

let n = 0;
function line(
  key: string,
  amount: string | number | null,
  unit: string | null,
  extra: Partial<StoredLine> = {},
): StoredLine {
  const base = toBase(amount, unit);
  n += 1;
  return {
    id: `l${n}`,
    recipeId: null,
    batchId: 'b1',
    key,
    name: key,
    aisle: 'other',
    amount: base.amount,
    unit: base.unit,
    original: `${amount ?? ''} ${unit ?? ''} ${key}`.trim(),
    swappedFrom: null,
    ...extra,
  };
}
const list = (lines: StoredLine[], extra: Partial<StoredList> = {}): StoredList => ({
  recipes: [],
  lines,
  states: {},
  ...extra,
});
const items = (lines: StoredLine[], country: Country = 'DE', extra: Partial<StoredList> = {}) =>
  buildList(list(lines, extra), EMPTY_PANTRY, country).items;
const one = (lines: StoredLine[], country: Country = 'DE') => {
  const all = items(lines, country);
  expect(all).toHaveLength(1);
  return all[0];
};

describe('amounts and units', () => {
  it('reads numbers as recipes write them', () => {
    expect(parseNumber('2')).toBe(2);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('½')).toBe(0.5);
    expect(parseNumber('1½')).toBe(1.5);
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('3/4')).toBe(0.75);
    expect(parseNumber('two')).toBe(2);
    expect(parseNumber('zwei')).toBe(2);
    expect(parseNumber('x')).toBeNull();
    expect(parseAmount('2-3')).toBe(3);
    expect(parseAmount('2 to 3')).toBe(3);
  });

  it('converts units in four languages', () => {
    expect(toBase('1', 'cup')).toEqual({ amount: 240, unit: 'ml' });
    expect(toBase('2', 'EL')).toEqual({ amount: 30, unit: 'ml' });
    expect(toBase('1', 'c. à c.')).toEqual({ amount: 5, unit: 'ml' });
    expect(toBase('1', 'lb')).toEqual({ amount: 453.6, unit: 'g' });
    expect(toBase('2', null)).toEqual({ amount: 2, unit: 'piece' });
    expect(toBase('3', 'Zehen')).toEqual({ amount: 3, unit: 'clove' });
    expect(toBase('1', 'pizzico')).toEqual({ amount: null, unit: 'g' });
  });

  it('reads typed items', () => {
    expect(parseTyped('milk')).toEqual({ name: 'milk', base: { amount: null, unit: 'piece' } });
    expect(parseTyped('2 l Milch')).toEqual({ name: 'Milch', base: { amount: 2000, unit: 'ml' } });
    expect(parseTyped('500g Hackfleisch')).toEqual({
      name: 'Hackfleisch',
      base: { amount: 500, unit: 'g' },
    });
    expect(parseTyped('6 eggs').base).toEqual({ amount: 6, unit: 'piece' });
    expect(parseTyped('2 chili peppers').name).toBe('chili peppers');
  });
});

describe('merge keys', () => {
  it('merges variants of one product, keeps groups apart', () => {
    expect(mergeKey('Whole Milk')).toBe('milk');
    expect(mergeKey('all-purpose flour')).toBe('flour');
    expect(mergeKey('cumin')).toBe('cumin');
    expect(mergeKey('red bell pepper')).toBe('bell pepper');
    expect(mergeKey('tomato paste')).toBe('tomato paste');
    expect(mergeKey('sweet potatoes')).toBe('sweet potato');
    expect(mergeKey('milk chocolate')).toBe('milk chocolate');
  });
});

describe('what to buy (Germany)', () => {
  it('rounds staples up to the usual pack and keeps them at home', () => {
    const flour = one([line('flour', '⅓', 'cup'), line('all-purpose flour', '1½', 'cups')]);
    expect(flour?.need).toEqual({ amount: 233.2, unit: 'g' });
    expect(flour?.buy).toEqual({ count: 1, size: 1, unit: 'kg' });
    expect(flour?.status).toBe('home');
    expect(flour?.alwaysHome).toBe(true);
  });

  it('adds butter from two recipes before rounding', () => {
    const butter = one([line('butter', '⅓', 'cup'), line('butter', '130', 'g')]);
    expect(butter?.buy).toEqual({ count: 1, size: 250, unit: 'g' });
    expect(butter?.sources).toHaveLength(2);
    expect(one([line('butter', '400', 'g')])?.buy).toEqual({ count: 2, size: 250, unit: 'g' });
  });

  it('keeps meat close to the recipe', () => {
    expect(one([line('chicken breast', '1', 'lb')])?.buy).toEqual({
      count: 1,
      size: 450,
      unit: 'g',
    });
    expect(one([line('ground beef', '1.2', 'kg')])?.buy).toEqual({
      count: 1,
      size: 1.2,
      unit: 'kg',
    });
  });

  it('buys cream, eggs, garlic and herbs the way shops sell them', () => {
    expect(one([line('heavy cream', '⅔', 'cup')])?.buy).toEqual({
      count: 1,
      size: 200,
      unit: 'ml',
    });
    expect(one([line('eggs', '3', null)])?.buy).toEqual({ count: 6, size: null, unit: 'piece' });
    expect(one([line('eggs', '8', null)])?.buy).toEqual({ count: 10, size: null, unit: 'piece' });
    expect(one([line('garlic', '3', 'cloves')])?.buy).toEqual({
      count: 1,
      size: null,
      unit: 'bulb',
    });
    expect(one([line('parsley', '2', 'tbsp')])?.buy).toEqual({
      count: 1,
      size: null,
      unit: 'bunch',
    });
  });

  it('counts pieces and converts weights for things sold by the piece', () => {
    expect(one([line('carrots', '2', null), line('carrot', '1', null)])?.buy).toEqual({
      count: 3,
      size: null,
      unit: 'piece',
    });
    expect(one([line('lemon', '250', 'g')])?.buy).toEqual({ count: 3, size: null, unit: 'piece' });
  });

  it('drops water and keeps unknown amounts as a plain item', () => {
    const shown = items([line('water', '2', 'cups'), line('saffron', null, null)]);
    expect(shown.map((i) => i.key)).toEqual(['saffron']);
    expect(shown[0]?.buy).toBeNull();
  });

  it('scales recipe lines to the servings wanted', () => {
    const recipe = {
      id: 'r1',
      batchId: 'b1',
      title: 'Pie',
      url: null,
      baseServings: 4,
      servings: 8,
    };
    const [chicken] = items([line('chicken breast', '1', 'lb', { recipeId: 'r1' })], 'DE', {
      recipes: [recipe],
    });
    expect(chicken?.buy).toEqual({ count: 1, size: 900, unit: 'g' });
    expect(chicken?.sources[0]?.recipeTitle).toBe('Pie');
  });

  it('sorts by aisle and applies a count set by hand', () => {
    const shown = items(
      [line('milk', '1', 'cup'), line('carrot', '2', null, { aisle: 'produce' })],
      'DE',
      {
        states: { milk: { count: 2, status: 'bought' } },
      },
    );
    expect(shown.map((i) => i.key)).toEqual(['carrot', 'milk']);
    expect(shown[1]?.buy).toEqual({ count: 2, size: 1, unit: 'l' });
    expect(shown[1]?.adjusted).toBe(true);
    expect(shown[1]?.status).toBe('bought');
  });
});

describe('what to buy (other countries)', () => {
  it('uses US units and pack sizes', () => {
    expect(one([line('heavy cream', '⅔', 'cup')], 'US')?.buy).toEqual({
      count: 1,
      size: 8,
      unit: 'fl_oz',
    });
    expect(one([line('chicken breast', '500', 'g')], 'US')?.buy).toEqual({
      count: 1,
      size: 1,
      unit: 'lb',
    });
    expect(one([line('butter', '1', 'stick')], 'US')?.buy).toEqual({
      count: 1,
      size: 0.5,
      unit: 'lb',
    });
    expect(one([line('eggs', '3', null)], 'US')?.buy).toEqual({
      count: 12,
      size: null,
      unit: 'piece',
    });
  });

  it('uses British pints for milk and bigger cream pots', () => {
    expect(one([line('milk', '2', 'cups')], 'GB')?.buy).toEqual({ count: 1, size: 1, unit: 'pt' });
    expect(one([line('double cream', '250', 'ml')], 'GB')?.buy).toEqual({
      count: 1,
      size: 300,
      unit: 'ml',
    });
  });

  it('picks the pack combination with the least left over', () => {
    const packs = [
      { base: 125, unit: 'g' as const, size: 125 },
      { base: 250, unit: 'g' as const, size: 250 },
    ];
    expect(pickPack(100, packs).pack.base).toBe(125);
    expect(pickPack(240, packs)).toEqual({ pack: packs[1], count: 1 });
    expect(pickPack(300, packs)).toEqual({ pack: packs[0], count: 3 });
  });

  it('turns what a real model sent into sensible amounts', () => {
    // From a test with gemma4 26B (2026-11-24): an American pot pie for Germany.
    expect(one([line('carrots', '1/2', 'cup')])?.buy).toEqual({
      count: 1,
      size: null,
      unit: 'piece',
    });
    expect(one([line('carrots', '500', 'g')])?.buy).toEqual({ count: 1, size: 500, unit: 'g' });
    expect(one([line('cooked chicken', '3', 'cups')])?.buy).toEqual({
      count: 1,
      size: 400,
      unit: 'g',
    });
    expect(one([line('salt', '1/2', 'tsp')])?.buy).toBeNull();
    expect(one([line('soy sauce', '2', 'tbsp')])?.buy).toBeNull();
    expect(one([line('corn', '1/2', 'cup')])?.buy).toEqual({ count: 1, size: 450, unit: 'g' });
    expect(one([line('refrigerated pie crusts', '1', 'box')])?.buy).toEqual({
      count: 1,
      size: 275,
      unit: 'g',
    });
    expect(one([line('diced celeriac', '2', 'cups', { aisle: 'produce' })])?.buy).toEqual({
      count: 1,
      size: 500,
      unit: 'g',
    });
  });

  it('copes with units inside the amount, singular names, jars and herb words', () => {
    expect(one([line('pasta', '250 g', null)])?.buy).toEqual({ count: 1, size: 500, unit: 'g' });
    expect(one([line('salmon fillet', '2 fillets', null)])?.buy).toEqual({
      count: 2,
      size: null,
      unit: 'piece',
    });
    expect(one([line('cherry tomato', '1', 'Packung')])?.buy).toEqual({
      count: 1,
      size: 250,
      unit: 'g',
    });
    expect(one([line('basil pesto', '1', 'Glas')])?.buy).toEqual({
      count: 1,
      size: 190,
      unit: 'g',
    });
    expect(one([line('fresh basil leaves', '1', 'cup')])?.buy).toEqual({
      count: 1,
      size: null,
      unit: 'bunch',
    });
    expect(mergeKey('cinnamon rolls')).toBe('cinnamon rolls');
    expect(one([line('cinnamon rolls', '1', 'pack')])?.status).toBe('open');
  });

  it('reads a big number without a unit as grams', () => {
    expect(one([line('parmesan', '200', null)])?.buy).toEqual({ count: 1, size: 200, unit: 'g' });
    expect(one([line('spaghetti', '500', null)])?.buy).toEqual({ count: 1, size: 500, unit: 'g' });
    expect(one([line('bacon', '150-200', null)])?.buy).toEqual({ count: 1, size: 200, unit: 'g' });
    expect(one([line('pesto', '2', null)])?.buy).toEqual({ count: 2, size: 190, unit: 'g' });
    expect(one([line('milk', '500', null)])?.buy).toEqual({ count: 1, size: 1, unit: 'l' });
  });
});
