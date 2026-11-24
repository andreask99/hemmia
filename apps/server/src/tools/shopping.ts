/**
 * Shopping list tools for the chat model (P12). The model reads recipes: what to buy, amounts
 * and units exactly as written, the aisle, and a local product when the original isn't sold in
 * the user's country. All arithmetic (units, servings, merging, pack sizes) is done by the
 * server (shopping/list.ts). Stored encrypted per user (db/shopping.ts).
 *
 * Recipe text can come from web pages (a linked page, a search): the worst a planted
 * instruction can do here is put items on the user's own list, which the reply shows with
 * Undo; lines per call are capped (MAX_RECIPE_LINES).
 */
import {
  AISLES,
  type Country,
  type ShoppingAddedRef,
  type ShoppingListResponse,
} from '@hemmia/shared';
import { z } from 'zod';
import type { NewLine } from '../db/shopping.ts';
import type { ToolSpec } from '../llm/types.ts';
import { toBase } from '../shopping/units.ts';

export const ADD_TO_SHOPPING_LIST_TOOL: ToolSpec = {
  name: 'add_to_shopping_list',
  description:
    "Put ingredients or other items on the user's shopping list: a recipe's ingredients when the user asks for it or " +
    'accepts your offer, or single items ("put milk on the list"). One entry per ingredient. Copy amounts and units ' +
    'exactly as the recipe writes them (e.g. amount "1 1/2", unit "cups"); never convert or add up yourself. ' +
    'Without a written recipe, give the usual amounts for the servings, with units (g, ml). ' +
    'List what is bought: lemons for lemon juice or zest, not the juice. Leave out water.',
  parameters: {
    type: 'object',
    properties: {
      recipe: {
        type: 'object',
        description: 'The recipe the items are for; leave out for single items.',
        properties: {
          title: { type: 'string', description: 'Short recipe name.' },
          servings: {
            type: 'integer',
            description: 'Servings the recipe is written for, if it says.',
          },
          servings_wanted: {
            type: 'integer',
            description: 'Servings the user wants, if they said (e.g. "for 6 people").',
          },
          url: { type: 'string', description: 'The recipe page, if it came from one.' },
        },
        required: ['title'],
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'What to buy, as sold in the user\'s country, in the user\'s language (e.g. "Schlagsahne").',
            },
            generic: {
              type: 'string',
              description:
                'Generic English name of the ingredient (e.g. "heavy cream", "flour", "chicken breast").',
            },
            amount: {
              type: 'string',
              description: 'Amount as written, e.g. "2", "1 1/2", "½". Empty if none.',
            },
            unit: {
              type: 'string',
              description:
                'Unit as written, e.g. "cups", "g", "tbsp", "EL", "cloves", "can". Empty for pieces.',
            },
            aisle: { type: 'string', enum: [...AISLES] },
            replaces: {
              type: 'string',
              description:
                "Only when the recipe's product isn't usually sold in the user's country: the original (e.g. \"heavy cream\").",
            },
          },
          required: ['name', 'generic', 'aisle'],
        },
      },
    },
    required: ['items'],
  },
};

export const SHOW_SHOPPING_LIST_TOOL: ToolSpec = {
  name: 'show_shopping_list',
  description:
    "Look up the user's shopping list, e.g. when asked what is on it or what is still missing.",
  parameters: { type: 'object', properties: {} },
};

const text = (max: number) =>
  z.union([z.string(), z.number()]).transform((v) => String(v).trim().slice(0, max));
const optText = (max: number) =>
  text(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));
const servings = z.coerce.number().int().min(1).max(50).nullish().catch(null);

export const AddToShoppingListArgs = z.object({
  recipe: z
    .object({
      title: text(80).pipe(z.string().min(1)),
      servings,
      servings_wanted: servings,
      url: optText(500),
    })
    .nullish()
    .catch(null),
  items: z
    .array(
      z.object({
        name: text(80).pipe(z.string().min(1)),
        generic: optText(80),
        amount: optText(20),
        unit: optText(30),
        aisle: z.enum(AISLES).catch('other'),
        replaces: optText(80),
      }),
    )
    .min(1)
    .max(60),
});
export type AddToShoppingListArgs = z.infer<typeof AddToShoppingListArgs>;

/** The lines to store for the model's items (amounts in base units). */
export function linesFrom(args: AddToShoppingListArgs): NewLine[] {
  return args.items.map((i) => {
    const base = toBase(i.amount, i.unit);
    return {
      key: i.generic ?? i.name,
      name: i.name,
      aisle: i.aisle,
      amount: base.amount,
      unit: base.unit,
      original: [i.amount, i.unit, i.name].filter(Boolean).join(' '),
      swappedFrom:
        i.replaces && i.replaces.toLowerCase() !== i.name.toLowerCase() ? i.replaces : null,
    };
  });
}

/** What the model hears back after adding. */
export function addedText(ref: ShoppingAddedRef): string {
  const parts = [`Added ${String(ref.count)} items to the shopping list.`];
  if (ref.atHome.length > 0) {
    parts.push(`Marked as usually at home (shown separately): ${ref.atHome.join(', ')}.`);
  }
  parts.push(
    'The app shows the list with an undo; confirm in one short sentence and mention any swaps.',
  );
  return parts.join(' ');
}

/** The list as the model sees it. */
export function shoppingText(list: ShoppingListResponse): string {
  if (list.items.length === 0) return 'The shopping list is empty.';
  const line = (i: ShoppingListResponse['items'][number]) => `- ${i.name}`;
  const open = list.items.filter((i) => i.status === 'open');
  const done = list.items.filter((i) => i.status === 'bought');
  const home = list.items.filter((i) => i.status === 'home');
  return [
    open.length > 0 ? `To buy:\n${open.map(line).join('\n')}` : 'Nothing left to buy.',
    done.length > 0 ? `Bought:\n${done.map(line).join('\n')}` : '',
    home.length > 0 ? `At home already:\n${home.map(line).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const COUNTRY_NAMES: Record<Country, string> = {
  DE: 'Germany',
  AT: 'Austria',
  CH: 'Switzerland',
  FR: 'France',
  IT: 'Italy',
  GB: 'the United Kingdom',
  US: 'the United States',
};

/** The system prompt's shopping instructions. */
export function shoppingPrompt(country: Country): string {
  return [
    `The user has a shopping list and shops in ${COUNTRY_NAMES[country]}.`,
    'When you give a recipe, or suggest dishes the user is choosing between, end your answer with one short question',
    'offering to put the ingredients on the shopping list (not when they already asked for that). When they ask or',
    'accept, call add_to_shopping_list once per recipe with all its ingredients; for several recipes, call it once',
    `for each. For a product that isn't usually sold in ${COUNTRY_NAMES[country]}, name the local product people`,
    'use instead and set "replaces". Use show_shopping_list for questions about the list.',
  ].join(' ');
}
