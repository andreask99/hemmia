/**
 * What the shopping list knows about common ingredients: weight per cup, weight per piece,
 * how they are sold (packs per country), what is usually at home, and names in German,
 * French and Italian for items typed by hand. Ingredients are matched by their generic English
 * name (the list's merge key), whole words, first match wins: specific entries come first.
 *
 * Pack sizes are the usual supermarket sizes; anything not listed is rounded by its aisle
 * (list.ts). Extend freely: every entry is plain data.
 */
import type { Aisle, BuyUnit, Country } from '@hemmia/shared';

/** One pack: `base` grams, millilitres or pieces, shown as `size` `unit` ("1 kg", "8 fl oz"). */
export interface Pack {
  base: number;
  unit: BuyUnit;
  /** Null for packs counted in pieces (eggs) or cans. */
  size: number | null;
}

export interface Ingredient {
  /** Generic English names (whole words); the first one is the canonical key. */
  match: string[];
  /** Names in other languages (typed items): matched whole, lower case. */
  names?: string[];
  aisle?: Aisle;
  /** Grams per millilitre, for solids measured in cups or spoons. */
  density?: number;
  /** Measured and sold by volume (milk, cream, stock). */
  liquid?: boolean;
  /** Weight of one piece in grams. */
  pieceGrams?: number;
  /** Sold by the piece (lemons, cucumbers): weights become pieces. */
  byPiece?: boolean;
  /** Fresh herbs: sold by the bunch, whatever the recipe measures. */
  herb?: boolean;
  /** Usually at home: starts in "At home" (salt, oil, flour). */
  pantry?: boolean;
  /** Never on a list (water, ice); matched only by the exact name. */
  drop?: boolean;
  /**
   * Matched only by the whole name, ignoring "fresh", "dried", "chopped", "leaves" (herbs,
   * spices): "basil pesto" isn't basil, "cinnamon rolls" aren't cinnamon.
   */
  exact?: boolean;
  /**
   * Several different products (spices, herbs, cheeses): lines keep their own name instead of
   * merging into the first one.
   */
  group?: boolean;
  /** Garlic: cloves per bulb. */
  clovesPerBulb?: number;
  /** Packs; `metric` applies to every country without its own entry. */
  packs?: Partial<Record<'metric' | Country, Pack[]>>;
}

const g = (...sizes: number[]): Pack[] =>
  sizes.map((s) =>
    s >= 1000 ? { base: s, unit: 'kg', size: s / 1000 } : { base: s, unit: 'g', size: s },
  );
const ml = (...sizes: number[]): Pack[] =>
  sizes.map((s) =>
    s >= 1000 ? { base: s, unit: 'l', size: s / 1000 } : { base: s, unit: 'ml', size: s },
  );
const lb = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: Math.round(s * 453.6), unit: 'lb', size: s }));
const oz = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: Math.round(s * 28.35), unit: 'oz', size: s }));
const floz = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: Math.round(s * 29.57), unit: 'fl_oz', size: s }));
const qt = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: Math.round(s * 946), unit: 'qt', size: s }));
const gal = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: Math.round(s * 3785), unit: 'gal', size: s }));
const pints = (...sizes: number[]): Pack[] =>
  sizes.map((s) => ({ base: s * 568, unit: 'pt', size: s }));
const pieces = (...counts: number[]): Pack[] =>
  counts.map((c) => ({ base: c, unit: 'piece', size: null }));
/** Cans of `grams` each (canned tomatoes 400 g). */
const cans = (grams: number): Pack[] => [{ base: grams, unit: 'can', size: null }];

export const INGREDIENTS: readonly Ingredient[] = [
  {
    match: [
      'water',
      'cold water',
      'warm water',
      'lukewarm water',
      'hot water',
      'boiling water',
      'ice cubes',
      'ice',
    ],
    names: ['wasser', 'eau', 'acqua'],
    drop: true,
  },
  {
    match: ['orange juice'],
    aisle: 'drinks',
    liquid: true,
    packs: { metric: ml(1000), US: floz(52), GB: ml(1000) },
  },
  {
    match: [
      'bell pepper',
      'bell peppers',
      'red pepper',
      'green pepper',
      'yellow pepper',
      'capsicum',
    ],
    names: ['paprika', 'paprikaschote', 'poivron', 'peperone', 'peperoni'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 160,
  },
  {
    match: ['cherry tomatoes', 'grape tomatoes'],
    names: ['kirschtomaten', 'cocktailtomaten', 'tomates cerises', 'pomodorini'],
    aisle: 'produce',
    pieceGrams: 15,
    packs: { metric: g(250, 500), US: oz(10) },
  },
  {
    match: [
      'canned tomatoes',
      'diced tomatoes',
      'crushed tomatoes',
      'chopped tomatoes',
      'tinned tomatoes',
      'peeled tomatoes',
    ],
    names: [
      'dosentomaten',
      'gehackte tomaten',
      'tomates concassées',
      'pelati',
      'polpa di pomodoro',
    ],
    aisle: 'pantry',
    packs: { metric: cans(400), US: [{ base: 411, unit: 'can', size: null }] },
  },
  {
    match: ['passata', 'tomato puree', 'tomato sauce', 'pasta sauce'],
    names: ['passierte tomaten', 'passata'],
    aisle: 'pantry',
    liquid: true,
    packs: { metric: ml(500, 700), US: oz(24) },
  },
  {
    match: ['tomato paste', 'tomato purée concentrate'],
    names: ['tomatenmark', 'concentré de tomate', 'concentrato di pomodoro'],
    aisle: 'pantry',
    density: 1.1,
    packs: { metric: g(200), US: oz(6) },
  },
  {
    match: ['pesto', 'basil pesto', 'green pesto', 'red pesto', 'pesto genovese'],
    names: ['pesto'],
    aisle: 'pantry',
    density: 1.0,
    packs: { metric: g(190), US: oz(6) },
  },
  {
    match: ['sweetcorn', 'sweet corn', 'corn kernels', 'frozen corn', 'corn'],
    names: ['mais', 'maïs'],
    aisle: 'frozen',
    density: 0.65,
    packs: { metric: g(450), US: lb(1) },
  },
  {
    match: ['green beans', 'french beans', 'string beans'],
    names: ['grüne bohnen', 'haricots verts', 'fagiolini'],
    aisle: 'produce',
    density: 0.5,
    packs: { metric: g(250, 500), US: lb(1) },
  },
  {
    match: ['sweet potato', 'sweet potatoes'],
    names: ['süßkartoffel', 'süßkartoffeln', 'patate douce', 'patata dolce'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 250,
  },
  {
    match: ['peanut butter'],
    names: ['erdnussbutter', 'beurre de cacahuète', 'burro di arachidi'],
    aisle: 'pantry',
    density: 1.08,
    packs: { metric: g(350), US: oz(16) },
  },
  {
    match: ['coconut milk', 'coconut cream'],
    names: ['kokosmilch', 'lait de coco', 'latte di cocco'],
    aisle: 'pantry',
    liquid: true,
    packs: {
      metric: [{ base: 400, unit: 'can', size: null }],
      US: [{ base: 400, unit: 'can', size: null }],
    },
  },
  {
    match: ['buttermilk'],
    names: ['buttermilch', 'babeurre', 'latticello'],
    aisle: 'dairy',
    liquid: true,
    packs: { metric: ml(500), US: qt(1) },
  },
  {
    match: ['chocolate chips', 'chocolate chunks'],
    names: ['schokotropfen', 'pépites de chocolat', 'gocce di cioccolato'],
    aisle: 'pantry',
    density: 0.71,
    packs: { metric: g(100, 200), US: oz(12) },
  },
  {
    match: ['cocoa powder', 'cocoa', 'unsweetened cocoa'],
    names: ['kakao', 'kakaopulver', 'cacao', 'cacao en poudre', 'cacao amaro'],
    aisle: 'pantry',
    density: 0.42,
    packs: { metric: g(125, 250), US: oz(8) },
  },
  {
    match: [
      'dark chocolate',
      'milk chocolate',
      'chocolate',
      'bittersweet chocolate',
      'semisweet chocolate',
    ],
    group: true,
    names: ['schokolade', 'zartbitterschokolade', 'chocolat', 'cioccolato'],
    aisle: 'pantry',
    density: 0.6,
    packs: { metric: g(100), US: oz(4) },
  },
  {
    match: ['pine nuts'],
    names: ['pinienkerne', 'pignons', 'pinoli'],
    aisle: 'pantry',
    density: 0.55,
    packs: { metric: g(50, 100), US: oz(2, 4) },
  },
  {
    match: ['ground almonds', 'almond flour', 'almond meal'],
    names: ['gemahlene mandeln', "poudre d'amande", 'farina di mandorle'],
    aisle: 'pantry',
    density: 0.4,
    packs: { metric: g(200), US: oz(16) },
  },
  {
    match: [
      'spring onions',
      'spring onion',
      'green onions',
      'green onion',
      'scallions',
      'scallion',
    ],
    names: ['frühlingszwiebeln', 'lauchzwiebeln', 'oignons nouveaux', 'cipollotti'],
    aisle: 'produce',
    herb: true,
  },
  {
    match: ['red onion', 'red onions'],
    names: ['rote zwiebel', 'rote zwiebeln', 'oignon rouge', 'cipolla rossa'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 150,
    density: 0.6,
  },
  {
    match: ['salt', 'sea salt', 'kosher salt'],
    names: ['salz', 'sel', 'sale'],
    aisle: 'pantry',
    pantry: true,
    density: 1.2,
  },
  {
    match: ['black pepper', 'pepper', 'ground pepper', 'white pepper', 'peppercorns'],
    names: ['pfeffer', 'poivre', 'pepe'],
    aisle: 'pantry',
    pantry: true,
  },
  {
    match: [
      'olive oil',
      'extra virgin olive oil',
      'vegetable oil',
      'sunflower oil',
      'canola oil',
      'rapeseed oil',
      'neutral oil',
      'cooking oil',
      'oil',
    ],
    group: true,
    names: [
      'öl',
      'olivenöl',
      'sonnenblumenöl',
      'rapsöl',
      'huile',
      "huile d'olive",
      'olio',
      "olio d'oliva",
    ],
    aisle: 'pantry',
    pantry: true,
    liquid: true,
    packs: { metric: ml(500, 750, 1000), US: floz(16, 25, 48) },
  },
  {
    match: [
      'vinegar',
      'white wine vinegar',
      'balsamic vinegar',
      'apple cider vinegar',
      'red wine vinegar',
    ],
    group: true,
    names: ['essig', 'vinaigre', 'aceto'],
    aisle: 'pantry',
    pantry: true,
    liquid: true,
  },
  {
    match: ['baking powder'],
    names: ['backpulver', 'levure chimique', 'lievito per dolci'],
    aisle: 'pantry',
    pantry: true,
  },
  {
    match: ['baking soda', 'bicarbonate of soda', 'bicarbonate'],
    names: ['natron'],
    aisle: 'pantry',
    pantry: true,
  },
  { match: ['vanilla extract', 'vanilla essence'], aisle: 'pantry', pantry: true, liquid: true },
  {
    match: [
      'ground cinnamon',
      'cinnamon',
      'paprika',
      'smoked paprika',
      'cumin',
      'ground cumin',
      'nutmeg',
      'dried oregano',
      'oregano',
      'dried thyme',
      'chili flakes',
      'red pepper flakes',
      'chili powder',
      'cayenne',
      'cayenne pepper',
      'curry powder',
      'turmeric',
      'ground ginger',
      'ground coriander',
      'garam masala',
      'bay leaf',
      'bay leaves',
      'dried basil',
      'italian seasoning',
      'garlic powder',
      'onion powder',
      'cloves ground',
      'allspice',
    ],
    exact: true,
    group: true,
    aisle: 'pantry',
    pantry: true,
  },
  {
    match: ['brown sugar', 'light brown sugar', 'dark brown sugar'],
    names: ['brauner zucker', 'rohrzucker', 'sucre roux', 'zucchero di canna'],
    aisle: 'pantry',
    density: 0.9,
    packs: { metric: g(500, 1000), US: lb(2) },
  },
  {
    match: ['powdered sugar', 'icing sugar', "confectioners' sugar", 'confectioners sugar'],
    names: ['puderzucker', 'sucre glace', 'zucchero a velo'],
    aisle: 'pantry',
    density: 0.5,
    packs: { metric: g(250, 500), US: lb(1, 2) },
  },
  {
    match: ['sugar', 'granulated sugar', 'caster sugar', 'white sugar'],
    names: ['zucker', 'sucre', 'zucchero'],
    aisle: 'pantry',
    pantry: true,
    density: 0.83,
    packs: { metric: g(1000), US: lb(2, 4) },
  },
  {
    match: [
      'flour',
      'all-purpose flour',
      'all purpose flour',
      'plain flour',
      'wheat flour',
      'bread flour',
      'self-raising flour',
      'self-rising flour',
      'whole wheat flour',
      'spelt flour',
    ],
    names: ['mehl', 'weizenmehl', 'farine', 'farina'],
    aisle: 'pantry',
    pantry: true,
    density: 0.53,
    packs: { metric: g(1000), US: lb(2, 5) },
  },
  {
    match: ['cornstarch', 'corn starch', 'cornflour', 'starch'],
    names: ['speisestärke', 'maisstärke', 'maïzena', 'amido di mais'],
    aisle: 'pantry',
    density: 0.53,
    packs: { metric: g(250, 400), US: oz(16) },
  },
  {
    match: ['butter', 'unsalted butter', 'salted butter'],
    names: ['butter', 'beurre', 'burro'],
    aisle: 'dairy',
    density: 0.96,
    packs: { metric: g(250), FR: g(125, 250), IT: g(125, 250), US: lb(0.5, 1) },
  },
  {
    match: ['sour cream', 'creme fraiche', 'crème fraîche', 'schmand', 'smetana'],
    group: true,
    names: ['saure sahne', 'sauerrahm', 'schmand', 'crème fraîche', 'creme fraiche', 'panna acida'],
    aisle: 'dairy',
    density: 1.0,
    packs: { metric: g(200), US: oz(8, 16) },
  },
  {
    match: ['cream cheese', 'soft cheese'],
    names: ['frischkäse', 'fromage frais', 'formaggio spalmabile'],
    aisle: 'dairy',
    density: 0.96,
    packs: { metric: g(200), US: oz(8) },
  },
  { match: ['mascarpone'], aisle: 'dairy', density: 1.0, packs: { metric: g(250), US: oz(8) } },
  { match: ['ricotta'], aisle: 'dairy', density: 1.0, packs: { metric: g(250), US: oz(15) } },
  {
    match: ['mozzarella'],
    aisle: 'dairy',
    density: 0.45,
    pieceGrams: 125,
    packs: { metric: g(125), US: oz(8, 16) },
  },
  {
    match: ['parmesan', 'parmigiano', 'parmigiano reggiano', 'grana padano', 'pecorino'],
    group: true,
    names: ['parmesan', 'parmigiano'],
    aisle: 'dairy',
    density: 0.42,
    packs: { metric: g(100, 200), US: oz(5, 8) },
  },
  {
    match: [
      'cheddar',
      'grated cheese',
      'shredded cheese',
      'gouda',
      'emmental',
      'gruyere',
      'gruyère',
      'cheese',
    ],
    group: true,
    names: ['käse', 'reibekäse', 'fromage', 'fromage râpé', 'formaggio'],
    aisle: 'dairy',
    density: 0.42,
    packs: { metric: g(200), US: oz(8, 16) },
  },
  {
    match: ['greek yogurt', 'yogurt', 'yoghurt', 'natural yogurt', 'plain yogurt'],
    group: true,
    names: ['joghurt', 'yaourt', 'yogurt'],
    aisle: 'dairy',
    density: 1.03,
    packs: { metric: g(150, 500), US: oz(5.3, 32) },
  },
  {
    match: [
      'heavy cream',
      'whipping cream',
      'heavy whipping cream',
      'double cream',
      'single cream',
      'cream',
      'half-and-half',
      'half and half',
      'cooking cream',
    ],
    names: [
      'sahne',
      'schlagsahne',
      'rahm',
      'kochsahne',
      'crème',
      'crème liquide',
      'crème entière',
      'panna',
      'panna fresca',
      'panna da cucina',
    ],
    aisle: 'dairy',
    liquid: true,
    packs: {
      metric: ml(200),
      CH: ml(250, 500),
      FR: ml(200, 500),
      GB: ml(300, 600),
      US: [...floz(8, 16), ...qt(1)],
    },
  },
  {
    match: ['milk', 'whole milk', 'skim milk', 'semi-skimmed milk', 'low-fat milk'],
    names: ['milch', 'vollmilch', 'lait', 'latte'],
    aisle: 'dairy',
    liquid: true,
    packs: { metric: ml(1000), GB: pints(1, 2, 4), US: [...qt(1), ...gal(0.5, 1)] },
  },
  {
    match: ['eggs', 'egg', 'egg yolks', 'egg yolk', 'egg whites', 'egg white'],
    names: ['eier', 'ei', 'oeufs', 'œufs', 'oeuf', 'uova', 'uovo'],
    aisle: 'dairy',
    pieceGrams: 55,
    packs: {
      metric: pieces(6, 10),
      FR: pieces(6, 12),
      IT: pieces(4, 6),
      GB: pieces(6, 12),
      US: pieces(12, 18),
    },
  },
  {
    match: ['bacon', 'pancetta', 'streaky bacon'],
    names: ['speck', 'bacon', 'frühstücksspeck', 'lardons', 'pancetta'],
    aisle: 'meat',
    pieceGrams: 25,
    packs: { metric: g(100, 200), US: oz(12, 16) },
  },
  {
    match: [
      'chicken stock',
      'chicken broth',
      'beef stock',
      'beef broth',
      'vegetable stock',
      'vegetable broth',
      'stock',
      'broth',
    ],
    group: true,
    names: ['brühe', 'gemüsebrühe', 'hühnerbrühe', 'bouillon', 'brodo'],
    aisle: 'pantry',
    liquid: true,
    packs: { metric: ml(500, 1000), US: qt(1) },
  },
  {
    match: [
      'chicken breast',
      'chicken breasts',
      'chicken thighs',
      'chicken thigh',
      'chicken',
      'whole chicken',
    ],
    group: true,
    names: [
      'hähnchenbrust',
      'hähnchen',
      'hühnchen',
      'poulet',
      'blanc de poulet',
      'pollo',
      'petto di pollo',
    ],
    aisle: 'meat',
    pieceGrams: 180,
    // Cooked and shredded, as recipes measure it in cups.
    density: 0.58,
  },
  {
    match: ['ground beef', 'minced beef', 'beef mince', 'ground meat', 'minced meat', 'mince'],
    names: ['hackfleisch', 'rinderhack', 'viande hachée', 'carne macinata'],
    aisle: 'meat',
  },
  {
    match: ['salmon', 'salmon fillet', 'salmon fillets'],
    names: ['lachs', 'saumon', 'salmone'],
    aisle: 'meat',
    pieceGrams: 125,
  },
  {
    match: ['sausage', 'sausages'],
    names: ['wurst', 'würstchen', 'saucisse', 'salsiccia'],
    aisle: 'meat',
    pieceGrams: 100,
  },
  {
    match: [
      'beef',
      'pork',
      'lamb',
      'veal',
      'turkey',
      'fish',
      'shrimp',
      'prawns',
      'tuna steak',
      'cod',
      'steak',
    ],
    group: true,
    aisle: 'meat',
  },
  {
    match: ['garlic', 'garlic cloves', 'garlic clove'],
    names: ['knoblauch', 'ail', 'aglio'],
    aisle: 'produce',
    clovesPerBulb: 10,
    pieceGrams: 5,
  },
  {
    match: ['lemon', 'lemons'],
    names: ['zitrone', 'zitronen', 'citron', 'citrons', 'limone', 'limoni'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 100,
  },
  {
    match: ['lime', 'limes'],
    names: ['limette', 'limetten', 'citron vert', 'lime'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 70,
  },
  {
    match: ['orange', 'oranges'],
    names: ['orange', 'orangen', 'arancia', 'arance'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 180,
  },
  { match: ['avocado', 'avocados'], aisle: 'produce', byPiece: true, pieceGrams: 170 },
  {
    match: ['shallot', 'shallots'],
    names: ['schalotte', 'schalotten', 'échalote', 'échalotes', 'scalogno'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 40,
  },
  {
    match: ['onion', 'onions', 'yellow onion', 'white onion', 'brown onion'],
    names: ['zwiebel', 'zwiebeln', 'oignon', 'oignons', 'cipolla', 'cipolle'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 150,
    density: 0.6,
  },
  {
    match: ['zucchini', 'courgette', 'courgettes'],
    names: ['zucchini', 'courgette', 'zucchina', 'zucchine'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 200,
  },
  {
    match: ['cucumber', 'cucumbers'],
    names: ['gurke', 'salatgurke', 'concombre', 'cetriolo'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 300,
  },
  {
    match: ['eggplant', 'aubergine', 'aubergines'],
    names: ['aubergine', 'melanzana', 'melanzane'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 300,
  },
  {
    match: ['leek', 'leeks'],
    names: ['lauch', 'porree', 'poireau', 'porro'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 200,
  },
  {
    match: ['cauliflower'],
    names: ['blumenkohl', 'chou-fleur', 'cavolfiore'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 600,
  },
  {
    match: ['broccoli'],
    names: ['brokkoli', 'brocoli', 'broccoli'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 400,
  },
  {
    match: ['tomato', 'tomatoes'],
    names: ['tomate', 'tomaten', 'tomates', 'pomodoro', 'pomodori'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 120,
  },
  {
    match: ['potato', 'potatoes'],
    names: [
      'kartoffel',
      'kartoffeln',
      'erdäpfel',
      'pomme de terre',
      'pommes de terre',
      'patata',
      'patate',
    ],
    aisle: 'produce',
    pieceGrams: 170,
    packs: { metric: g(1000, 1500, 2500), US: lb(3, 5) },
  },
  {
    match: ['carrot', 'carrots'],
    names: [
      'karotte',
      'karotten',
      'möhre',
      'möhren',
      'rüebli',
      'carotte',
      'carottes',
      'carota',
      'carote',
    ],
    aisle: 'produce',
    pieceGrams: 80,
    density: 0.55,
  },
  {
    match: ['mushrooms', 'mushroom', 'button mushrooms', 'champignons'],
    names: ['pilze', 'champignons', 'funghi'],
    aisle: 'produce',
    pieceGrams: 20,
    density: 0.3,
    packs: { metric: g(250, 500), US: oz(8, 16) },
  },
  {
    match: ['spinach', 'baby spinach'],
    names: ['spinat', 'épinards', 'spinaci'],
    aisle: 'produce',
    density: 0.13,
    packs: { metric: g(200), US: oz(5, 10) },
  },
  {
    match: ['apple', 'apples'],
    names: ['apfel', 'äpfel', 'pomme', 'pommes', 'mela', 'mele'],
    aisle: 'produce',
    pieceGrams: 180,
  },
  {
    match: ['banana', 'bananas'],
    names: ['banane', 'bananen', 'bananes', 'banana', 'banane'],
    aisle: 'produce',
    byPiece: true,
    pieceGrams: 120,
  },
  {
    match: ['celery'],
    names: ['sellerie', 'staudensellerie', 'céleri', 'sedano'],
    aisle: 'produce',
    herb: true,
  },
  {
    match: ['ginger', 'fresh ginger', 'ginger root'],
    names: ['ingwer', 'gingembre', 'zenzero'],
    aisle: 'produce',
    density: 0.5,
  },
  {
    match: [
      'parsley',
      'flat-leaf parsley',
      'basil',
      'fresh basil',
      'cilantro',
      'coriander',
      'fresh coriander',
      'dill',
      'chives',
      'mint',
      'fresh thyme',
      'thyme',
      'rosemary',
      'fresh rosemary',
      'sage',
      'tarragon',
    ],
    exact: true,
    group: true,
    names: [
      'petersilie',
      'basilikum',
      'koriander',
      'dill',
      'schnittlauch',
      'minze',
      'thymian',
      'rosmarin',
      'salbei',
      'persil',
      'basilic',
      'ciboulette',
      'menthe',
      'thym',
      'romarin',
      'prezzemolo',
      'basilico',
      'erba cipollina',
      'menta',
      'timo',
      'rosmarino',
      'salvia',
    ],
    aisle: 'produce',
    herb: true,
  },
  {
    match: [
      'spaghetti',
      'pasta',
      'penne',
      'fusilli',
      'rigatoni',
      'macaroni',
      'linguine',
      'tagliatelle',
      'noodles',
      'lasagne sheets',
      'lasagna noodles',
      'rice noodles',
      'egg noodles',
    ],
    group: true,
    names: ['nudeln', 'pasta', 'spaghetti', 'pâtes', 'penne'],
    aisle: 'pantry',
    packs: { metric: g(500), US: lb(1) },
  },
  {
    match: [
      'rice',
      'basmati rice',
      'jasmine rice',
      'risotto rice',
      'arborio rice',
      'long grain rice',
    ],
    group: true,
    names: ['reis', 'basmatireis', 'risottoreis', 'riz', 'riso'],
    aisle: 'pantry',
    density: 0.78,
    packs: { metric: g(500, 1000), US: lb(1, 2) },
  },
  {
    match: ['rolled oats', 'oats', 'oatmeal', 'porridge oats'],
    names: ['haferflocken', "flocons d'avoine", "fiocchi d'avena"],
    aisle: 'pantry',
    density: 0.37,
    packs: { metric: g(500), US: oz(18, 42) },
  },
  {
    match: ['breadcrumbs', 'panko', 'bread crumbs'],
    names: ['paniermehl', 'semmelbrösel', 'chapelure', 'pangrattato'],
    aisle: 'pantry',
    density: 0.45,
    packs: { metric: g(400), US: oz(8, 15) },
  },
  {
    match: ['honey'],
    names: ['honig', 'miel', 'miele'],
    aisle: 'pantry',
    density: 1.42,
    packs: { metric: g(250, 500), US: oz(12, 16) },
  },
  {
    match: ['maple syrup'],
    names: ['ahornsirup', "sirop d'érable", "sciroppo d'acero"],
    aisle: 'pantry',
    liquid: true,
    packs: { metric: ml(250), US: floz(12) },
  },
  {
    match: ['raisins', 'sultanas'],
    names: ['rosinen', 'raisins secs', 'uvetta'],
    aisle: 'pantry',
    density: 0.63,
    packs: { metric: g(250), US: oz(12) },
  },
  {
    match: ['walnuts', 'almonds', 'hazelnuts', 'pecans', 'cashews', 'peanuts', 'nuts'],
    group: true,
    names: [
      'walnüsse',
      'mandeln',
      'haselnüsse',
      'nüsse',
      'noix',
      'amandes',
      'noisettes',
      'noci',
      'mandorle',
      'nocciole',
    ],
    aisle: 'pantry',
    density: 0.55,
    packs: { metric: g(100, 200), US: oz(6, 16) },
  },
  {
    match: ['lentils', 'red lentils', 'green lentils'],
    names: ['linsen', 'lentilles', 'lenticchie'],
    aisle: 'pantry',
    density: 0.8,
    packs: { metric: g(500), US: lb(1) },
  },
  {
    match: ['chickpeas', 'kidney beans', 'black beans', 'white beans', 'cannellini beans', 'beans'],
    group: true,
    names: [
      'kichererbsen',
      'kidneybohnen',
      'bohnen',
      'pois chiches',
      'haricots',
      'ceci',
      'fagioli',
    ],
    aisle: 'pantry',
    density: 0.7,
    packs: { metric: cans(240), US: [{ base: 250, unit: 'can', size: null }] },
  },
  {
    match: ['puff pastry'],
    names: ['blätterteig', 'pâte feuilletée', 'pasta sfoglia'],
    aisle: 'dairy',
    packs: { metric: g(275), FR: g(230), IT: g(230), GB: g(320), US: oz(17.3) },
  },
  {
    match: ['pie crust', 'shortcrust pastry', 'pie dough'],
    names: ['mürbeteig', 'pâte brisée', 'pasta brisée'],
    aisle: 'dairy',
    packs: { metric: g(275), FR: g(230), IT: g(230), GB: g(320), US: oz(14) },
  },
  {
    match: ['dry yeast', 'instant yeast', 'active dry yeast', 'yeast'],
    names: ['hefe', 'trockenhefe', 'levure', 'lievito'],
    aisle: 'pantry',
    density: 0.6,
    packs: { metric: g(7), US: oz(0.25) },
  },
  {
    match: ['soy sauce', 'fish sauce'],
    group: true,
    names: ['sojasauce', 'sauce soja', 'salsa di soia'],
    aisle: 'pantry',
    liquid: true,
  },
  {
    match: ['white wine', 'red wine', 'wine'],
    group: true,
    names: ['weißwein', 'rotwein', 'wein', 'vin blanc', 'vin rouge', 'vino bianco', 'vino rosso'],
    aisle: 'drinks',
    liquid: true,
    packs: { metric: ml(750), US: ml(750) },
  },
  {
    match: ['frozen peas', 'peas', 'frozen corn', 'frozen spinach'],
    group: true,
    names: ['erbsen', 'tiefkühlerbsen', 'petits pois', 'piselli'],
    aisle: 'frozen',
    density: 0.6,
    packs: { metric: g(450, 1000), GB: g(500, 1000), US: lb(1) },
  },
  {
    match: ['bread', 'loaf', 'baguette'],
    group: true,
    names: ['brot', 'pain', 'pane'],
    aisle: 'bakery',
  },
];

/**
 * Whole-word "contains": "all-purpose flour" contains "flour"; plurals count too
 * ("refrigerated pie crusts" contains "pie crust").
 */
function hasWords(text: string, phrase: string): boolean {
  if (text === phrase) return true;
  const singular = phrase.endsWith('es')
    ? phrase.slice(0, -2)
    : phrase.endsWith('s')
      ? phrase.slice(0, -1)
      : null;
  const forms = [phrase, `${phrase}s`, `${phrase}es`];
  if (singular && singular.length >= 4) forms.push(singular);
  for (const form of forms) {
    let i = text.indexOf(form);
    while (i >= 0) {
      const before = i === 0 ? ' ' : text.charAt(i - 1);
      const after = text.charAt(i + form.length);
      if (/[\s\-(]/u.test(before) && (after === '' || /[\s,)]/u.test(after))) return true;
      i = text.indexOf(form, i + 1);
    }
  }
  return false;
}

/** The canonical form of a key: lower case, single spaces. */
export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

/** The ingredient for an English key; specific entries win because they come first. */
export function findIngredient(key: string): Ingredient | undefined {
  const k = normalizeKey(key);
  const bare = k
    .replace(
      /\b(fresh|freshly|dried|ground|chopped|minced|finely|roughly|leaves|leaf|sprigs?|of)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return INGREDIENTS.find((i) => {
    if (i.drop === true) return i.match.includes(k);
    if (i.exact === true) {
      return i.match.some((m) => m === k || m === bare || `${m}s` === bare || m === `${bare}s`);
    }
    return i.match.some((m) => hasWords(k, m));
  });
}

/** The ingredient for a name typed in any of the four languages ("Milch", "lait"). */
export function findByName(name: string): Ingredient | undefined {
  const n = normalizeKey(name);
  return (
    INGREDIENTS.find((i) => i.names?.includes(n) === true) ??
    INGREDIENTS.find((i) => i.match.includes(n))
  );
}

/** The canonical key of an ingredient. */
export const canonicalKey = (i: Ingredient): string => i.match[0] ?? '';

/**
 * The key lines merge under: the ingredient's canonical name ("whole milk" and "milk" are one
 * item), except for groups of different products, where the line keeps its own name.
 */
export function mergeKey(key: string): string {
  const k = normalizeKey(key);
  const i = findIngredient(k);
  return i && i.group !== true && !i.drop ? canonicalKey(i) : k;
}

/** The packs for a country, if the ingredient is sold in packs. */
export function packsFor(i: Ingredient, country: Country): Pack[] | undefined {
  return i.packs?.[country] ?? (country === 'US' ? undefined : i.packs?.metric);
}
