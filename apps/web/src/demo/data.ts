/**
 * The demo's made-up family "Berg" (the same family as the website's screenshots): Anna (the
 * demo user, admin), Ben and their daughter Mila. Everything here is invented; dates are
 * relative to today. Ids are the same in both languages, so switching language keeps the page.
 */
import type {
  Agent,
  AgentTemplate,
  AttachmentRef,
  ChatModelInfo,
  DailySettings,
  DayTask,
  Goal,
  Language,
  Plan,
  WebSearch,
} from '@hemmia/shared';
import fridge from './media/fridge.jpg';
import dragon from './media/dragon.jpg';
import plant from './media/plant.jpg';
import cabin from './media/cabin.jpg';
import lighthouse from './media/lighthouse.jpg';

/** Pictures in the bundle, by attachment id. */
export const MEDIA: Record<string, { url: string; width: number; height: number }> = {
  'demo-fridge': { url: fridge, width: 768, height: 854 },
  'demo-dragon': { url: dragon, width: 1024, height: 880 },
  'demo-plant': { url: plant, width: 768, height: 1024 },
  'demo-cabin': { url: cabin, width: 1024, height: 768 },
  'demo-lighthouse': { url: lighthouse, width: 1024, height: 768 },
};

export function mediaRef(id: string, kind: AttachmentRef['kind']): AttachmentRef {
  const m = MEDIA[id];
  return {
    id,
    kind,
    mime: 'image/jpeg',
    width: m?.width ?? 1024,
    height: m?.height ?? 768,
    name: null,
    pages: null,
    scanPages: 0,
    source: null,
  };
}

// ---------------------------------------------------------------------------
// Dates

const pad = (n: number) => String(n).padStart(2, '0');
export function isoDay(d: Date): string {
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return addDays(day, -((d.getDay() + 6) % 7));
}

// ---------------------------------------------------------------------------
// Models (as on a fresh hub, config/models.json)

const model = (
  id: string,
  engineModel: string,
  label: string,
  description: [string, string],
  details: [string, string],
  vision: boolean,
  thinking: boolean,
  maxMessageChars: number,
): ChatModelInfo => ({
  id,
  label: { en: label, de: label },
  description: { en: description[0], de: description[1] },
  engineModel,
  details: { en: details[0], de: details[1] },
  vision,
  thinking,
  maxMessageChars,
  cloud: false,
  provider: null,
});

export const CHAT_MODELS: ChatModelInfo[] = [
  model(
    'gemma4-26b',
    'gemma4:26b',
    'gemma4 26B',
    ['Best all-rounder: fast, sees photos', 'Bester Allrounder: schnell, sieht Fotos'],
    [
      'Uses 4B of its 26B parameters per word · ~45 words/s · 19 GB',
      'Nutzt 4B seiner 26B Parameter pro Wort · ~45 Wörter/s · 19 GB',
    ],
    true,
    true,
    311_000,
  ),
  model(
    'gemma4-12b',
    'gemma4:12b',
    'gemma4 12B',
    [
      'Smaller and lighter, leaves room for pictures',
      'Kleiner und leichter, lässt Platz für Bilder',
    ],
    [
      'Uses all 12B parameters per word · ~25 words/s · 9 GB',
      'Nutzt alle 12B Parameter pro Wort · ~25 Wörter/s · 9 GB',
    ],
    true,
    false,
    65_000,
  ),
  model(
    'qwen38-27b',
    'qwen3.8:27b-mlx',
    'Qwen3.8 27B',
    [
      'Strongest thinker, but slow: for hard questions',
      'Denkt am gründlichsten, aber langsam: für schwierige Fragen',
    ],
    [
      'Uses all 27B parameters per word · ~9–25 words/s · 21+ GB',
      'Nutzt alle 27B Parameter pro Wort · ~9–25 Wörter/s · 21+ GB',
    ],
    false,
    true,
    147_000,
  ),
];
export const DEFAULT_MODEL = 'gemma4-26b';

// ---------------------------------------------------------------------------
// Seed content

export interface SeedMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Media ids (MEDIA) with their kind. */
  media?: { id: string; kind: AttachmentRef['kind'] }[];
  searches?: WebSearch[];
}
export interface SeedChat {
  id: string;
  title: string;
  agentId: string | null;
  think: boolean;
  /** How long ago the last message was written. */
  minutesAgo: number;
  messages: SeedMessage[];
}

const L = (lang: Language, en: string, de: string) => (lang === 'de' ? de : en);

export function seedChats(lang: Language): SeedChat[] {
  const t = (en: string, de: string) => L(lang, en, de);
  return [
    {
      id: 'demo-fridge',
      title: t('Dinner from the fridge', 'Abendessen aus dem Kühlschrank'),
      agentId: null,
      think: false,
      minutesAgo: 95,
      messages: [
        {
          role: 'user',
          content: t(
            'What can I cook tonight with this? Something quick, Mila is hungry.',
            'Was kann ich heute Abend damit kochen? Etwas Schnelles, Mila hat Hunger.',
          ),
          media: [{ id: 'demo-fridge', kind: 'upload' }],
        },
        {
          role: 'assistant',
          content: t(
            `I can see eggs, a bag of spinach, cherry tomatoes, a yellow pepper, half a lemon and a jar of yoghurt. That's a **spinach frittata** in 20 minutes:

1. Slice the pepper and halve a handful of tomatoes. Fry the pepper in a little oil for 3 minutes.
2. Add the spinach and let it wilt (1–2 minutes).
3. Beat 6 eggs with salt and pepper, pour them over, scatter the tomatoes on top.
4. Cook gently with a lid for 8–10 minutes until just set.

**Dip:** yoghurt with a squeeze of lemon, salt and a little garlic if you have it.

Cut it into wedges: kids usually like it with bread. Want a version without the pepper?`,
            `Ich sehe Eier, eine Tüte Spinat, Cherrytomaten, eine gelbe Paprika, eine halbe Zitrone und ein Glas Joghurt. Das reicht für eine **Spinat-Frittata** in 20 Minuten:

1. Paprika in Streifen schneiden, eine Handvoll Tomaten halbieren. Paprika 3 Minuten in etwas Öl anbraten.
2. Spinat dazugeben und zusammenfallen lassen (1–2 Minuten).
3. 6 Eier mit Salz und Pfeffer verquirlen, darübergießen, Tomaten darauf verteilen.
4. Mit Deckel bei kleiner Hitze 8–10 Minuten stocken lassen.

**Dip:** Joghurt mit einem Spritzer Zitrone, Salz und etwas Knoblauch, falls da.

In Stücke schneiden: Kinder mögen sie meist mit Brot. Soll ich eine Variante ohne Paprika vorschlagen?`,
          ),
        },
      ],
    },
    {
      id: 'demo-dragon',
      title: t('A dragon for Mila', 'Ein Drache für Mila'),
      agentId: null,
      think: false,
      minutesAgo: 60 * 22,
      messages: [
        {
          role: 'user',
          content: t(
            'Draw a friendly little dragon reading a book under an apple tree, watercolour, for a bedtime story.',
            'Mal einen freundlichen kleinen Drachen, der unter einem Apfelbaum ein Buch liest, Aquarell, für eine Gutenachtgeschichte.',
          ),
        },
        {
          role: 'assistant',
          content: t(
            'Here is your little dragon under the apple tree.',
            'Hier ist dein kleiner Drache unter dem Apfelbaum.',
          ),
          media: [{ id: 'demo-dragon', kind: 'generated' }],
        },
        {
          role: 'user',
          content: t(
            'Mila loves him! Now a short bedtime story about him, please.',
            'Mila liebt ihn! Jetzt bitte eine kurze Gutenachtgeschichte über ihn.',
          ),
        },
        {
          role: 'assistant',
          content: t(
            `**Pip and the Apple Tree**

Pip was the smallest dragon in the valley, and the only one who couldn't breathe fire. When he tried, out came a tiny puff of warm air that smelled of apples.

The other dragons laughed, so Pip went to the old apple tree at the edge of the meadow and read his favourite book instead. One autumn evening, a little girl came by, shivering. Pip hesitated, then blew his warm apple breath over her cold hands.

"That's the best kind of fire," she said, and sat down next to him. From then on, they read together every evening, until the stars came out and both of them were yawning.

*The end. Sleep well, Mila.* 🌙`,
            `**Pip und der Apfelbaum**

Pip war der kleinste Drache im Tal und der einzige, der kein Feuer speien konnte. Wenn er es versuchte, kam nur ein winziger warmer Hauch heraus, der nach Äpfeln duftete.

Die anderen Drachen lachten, also ging Pip zum alten Apfelbaum am Rand der Wiese und las stattdessen sein Lieblingsbuch. An einem Herbstabend kam ein kleines Mädchen vorbei und fror. Pip zögerte, dann hauchte er seinen warmen Apfelatem über ihre kalten Hände.

„Das ist die schönste Art von Feuer“, sagte sie und setzte sich neben ihn. Von da an lasen sie jeden Abend zusammen, bis die Sterne kamen und beide gähnten.

*Ende. Schlaf gut, Mila.* 🌙`,
          ),
        },
      ],
    },
    {
      id: 'demo-plant',
      title: t('Yellow leaves on the monstera', 'Gelbe Blätter an der Monstera'),
      agentId: null,
      think: false,
      minutesAgo: 60 * 50,
      messages: [
        {
          role: 'user',
          content: t('Why are the leaves turning yellow?', 'Warum werden die Blätter gelb?'),
          media: [{ id: 'demo-plant', kind: 'upload' }],
        },
        {
          role: 'assistant',
          content: t(
            `Your monstera looks healthy overall: new leaves, good colour. The yellow, slightly brown edges on two older leaves usually mean one of these:

- **Direct sun:** it's right at the window. Midday sun through glass scorches the leaf edges. Move it a metre back or behind a thin curtain.
- **Too much water:** if the soil stays wet for days, the roots suffer and older leaves yellow first. Water only when the top 3–4 cm are dry.
- **Old leaves:** one or two yellowing at the bottom is normal.

The aerial roots on the soil are fine. I'd start with the light: it's the most likely cause here.`,
            `Deine Monstera sieht insgesamt gesund aus: neue Blätter, gute Farbe. Die gelben, leicht braunen Ränder an zwei älteren Blättern bedeuten meist eins davon:

- **Direkte Sonne:** Sie steht direkt am Fenster. Mittagssonne durchs Glas verbrennt die Blattränder. Stell sie einen Meter zurück oder hinter einen dünnen Vorhang.
- **Zu viel Wasser:** Bleibt die Erde tagelang nass, leiden die Wurzeln, und ältere Blätter werden zuerst gelb. Gieß erst, wenn die oberen 3–4 cm trocken sind.
- **Alte Blätter:** Ein, zwei gelbe Blätter unten sind normal.

Die Luftwurzeln auf der Erde sind in Ordnung. Ich würde beim Licht anfangen: Das ist hier am wahrscheinlichsten.`,
          ),
        },
      ],
    },
    {
      id: 'demo-lake',
      title: t('Weekend at Lake Constance', 'Wochenende am Bodensee'),
      agentId: null,
      think: false,
      minutesAgo: 60 * 75,
      messages: [
        {
          role: 'user',
          content: t(
            'Plan a Saturday at Lake Constance with a 9-year-old, starting from Freiburg by train.',
            'Plane einen Samstag am Bodensee mit einer Neunjährigen, Start in Freiburg mit dem Zug.',
          ),
        },
        {
          role: 'assistant',
          content: t(
            `Here's a relaxed day that works well with a 9-year-old:

**Morning**
- Early train to **Konstanz** (about 2½ hours; there are direct connections, check the timetable the evening before).
- Walk along the harbour to the Imperia statue: it slowly turns, kids love spotting that.

**Midday**
- Bus or boat to **Mainau Island**: gardens, a butterfly house and a big playground. Picnic or the café there.

**Afternoon**
- Boat back towards **Unteruhldingen** to see the **stilt houses** (Pfahlbauten), a reconstructed Stone Age village on the water. Allow 1½ hours.

**Tip:** a day ticket for the boats is often cheaper than single tickets, and pack a spare jumper: it gets windy on deck.`,
            `So ein entspannter Tag klappt gut mit einer Neunjährigen:

**Vormittag**
- Früher Zug nach **Konstanz** (etwa 2½ Stunden; es gibt Direktverbindungen, am Vorabend den Fahrplan prüfen).
- Am Hafen entlang zur Imperia: Sie dreht sich langsam, das entdecken Kinder gern.

**Mittag**
- Mit Bus oder Schiff auf die **Insel Mainau**: Gärten, Schmetterlingshaus und ein großer Spielplatz. Picknick oder das Café dort.

**Nachmittag**
- Mit dem Schiff nach **Unteruhldingen** zu den **Pfahlbauten**, einem nachgebauten Steinzeitdorf auf dem Wasser. 1½ Stunden einplanen.

**Tipp:** Eine Tageskarte für die Schiffe ist oft günstiger als Einzelfahrten, und einen Pulli einpacken: An Deck wird es windig.`,
          ),
          searches: [
            {
              query: t(
                'Lake Constance day trip with children Mainau stilt houses',
                'Bodensee Ausflug mit Kindern Mainau Pfahlbauten',
              ),
              sources: [
                { title: 'Insel Mainau', url: 'https://www.mainau.de/' },
                { title: 'Pfahlbaumuseum Unteruhldingen', url: 'https://www.pfahlbauten.de/' },
                { title: 'Bodensee', url: 'https://www.bodensee.eu/' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'demo-fractions',
      title: t('Fractions homework', 'Bruchrechnen'),
      agentId: 'demo-agent-homework',
      think: false,
      minutesAgo: 60 * 24 * 4,
      messages: [
        {
          role: 'user',
          content: t(
            'Mila asks why 1/2 is bigger than 1/3 when 3 is bigger than 2.',
            'Mila fragt, warum 1/2 größer ist als 1/3, obwohl 3 größer ist als 2.',
          ),
        },
        {
          role: 'assistant',
          content: t(
            `Great question! Try it with a pizza 🍕

- **1/2** means: cut the pizza into **2** pieces and take one.
- **1/3** means: cut the same pizza into **3** pieces and take one.

The more pieces you cut, the **smaller** each piece gets. So the bottom number tells you how many pieces, not how big.

**Try it yourself:** which is bigger, 1/4 or 1/5? (Hint: imagine sharing a cake with 4 friends or with 5.)`,
            `Super Frage! Probier es mit einer Pizza 🍕

- **1/2** heißt: Die Pizza in **2** Stücke schneiden und eins nehmen.
- **1/3** heißt: Dieselbe Pizza in **3** Stücke schneiden und eins nehmen.

Je mehr Stücke du schneidest, desto **kleiner** wird jedes Stück. Die untere Zahl sagt also, wie viele Stücke es gibt, nicht wie groß sie sind.

**Probier selbst:** Was ist größer, 1/4 oder 1/5? (Tipp: Stell dir vor, du teilst einen Kuchen mit 4 oder mit 5 Freundinnen.)`,
          ),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Agents

export function seedAgents(lang: Language, now: number): Agent[] {
  const t = (en: string, de: string) => L(lang, en, de);
  const base = {
    modelId: null,
    think: null,
    webSearch: true,
    images: true,
    lastUsedAt: null,
    updatedAt: now - 86_400_000 * 10,
  };
  return [
    {
      ...base,
      id: 'demo-agent-homework',
      name: t('Homework helper', 'Hausaufgabenhilfe'),
      emoji: '📚',
      description: t(
        'Explains step by step, never just the answer',
        'Erklärt Schritt für Schritt, nie nur die Lösung',
      ),
      instructions: t(
        'You help a 9-year-old with homework. Explain with everyday examples, ask a question back, and never just give the final answer.',
        'Du hilfst einer Neunjährigen bei den Hausaufgaben. Erkläre mit Beispielen aus dem Alltag, stell eine Rückfrage und verrate nie einfach die Lösung.',
      ),
      examples: [
        t('Why is 1/2 bigger than 1/3?', 'Warum ist 1/2 größer als 1/3?'),
        t('Help me with my essay about autumn', 'Hilf mir bei meinem Aufsatz über den Herbst'),
      ],
      scope: 'family',
      editable: true,
      pinned: true,
      pinOrder: 0,
      lastUsedAt: now - 86_400_000 * 4,
    },
    {
      ...base,
      id: 'demo-agent-kitchen',
      name: t('Kitchen coach', 'Küchenhilfe'),
      emoji: '🍳',
      description: t(
        'Quick family meals from what is at home',
        'Schnelle Familienessen aus dem, was da ist',
      ),
      instructions: t(
        'Suggest quick, vegetarian-friendly family meals from the ingredients given. Keep recipes short, with times.',
        'Schlage schnelle, vegetarierfreundliche Familienessen aus den genannten Zutaten vor. Kurze Rezepte mit Zeitangaben.',
      ),
      examples: [t('What can I cook with this?', 'Was kann ich damit kochen?')],
      scope: 'personal',
      editable: true,
      pinned: true,
      pinOrder: 1,
    },
    {
      ...base,
      id: 'demo-agent-letters',
      name: t('Letter writer', 'Briefe schreiben'),
      emoji: '✉️',
      description: t('Polite, clear letters and emails', 'Höfliche, klare Briefe und E-Mails'),
      instructions: t(
        'Write polite, clear letters and emails. Ask who it is for if that is unclear.',
        'Schreibe höfliche, klare Briefe und E-Mails. Frag nach, an wen sie gehen, wenn das unklar ist.',
      ),
      examples: [],
      scope: 'personal',
      editable: true,
      pinned: false,
      pinOrder: null,
    },
  ];
}

export function agentTemplates(lang: Language): AgentTemplate[] {
  const t = (en: string, de: string) => L(lang, en, de);
  return [
    {
      key: 'travel',
      name: t('Trip planner', 'Reiseplanung'),
      emoji: '🧭',
      description: t('Day trips and holidays', 'Ausflüge und Urlaub'),
      instructions: t(
        'Plan trips with realistic times and options for children.',
        'Plane Ausflüge mit realistischen Zeiten und Ideen für Kinder.',
      ),
      examples: [],
      modelId: null,
      think: null,
      webSearch: true,
      images: false,
    },
    {
      key: 'language',
      name: t('Language partner', 'Sprachpartner'),
      emoji: '🗣️',
      description: t('Practise a language by chatting', 'Eine Sprache im Gespräch üben'),
      instructions: t(
        'Chat in the language the user is learning and gently correct mistakes.',
        'Unterhalte dich in der Sprache, die gelernt wird, und korrigiere Fehler freundlich.',
      ),
      examples: [],
      modelId: null,
      think: null,
      webSearch: false,
      images: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Planner

export interface PlannerSeed {
  goals: Goal[];
  tasks: DayTask[];
  plans: Plan[];
}

export function seedPlanner(lang: Language, today: string): PlannerSeed {
  const t = (en: string, de: string) => L(lang, en, de);
  const week = weekStart(today);
  const goal = (
    id: string,
    area: Goal['area'],
    text: string,
    status: Goal['status'],
    doneOffset: number | null,
  ): Goal => ({
    id,
    week,
    area,
    text,
    status,
    day: null,
    doneOn: doneOffset === null ? null : addDays(week, doneOffset),
  });
  return {
    goals: [
      goal(
        'demo-g1',
        'work',
        t('Finish the quarterly report', 'Quartalsbericht fertigstellen'),
        'done',
        0,
      ),
      goal(
        'demo-g2',
        'work',
        t('Prepare the client presentation', 'Präsentation für den Kunden vorbereiten'),
        'open',
        null,
      ),
      goal('demo-g3', 'home', t('Book the summer holiday', 'Sommerurlaub buchen'), 'open', null),
      goal('demo-g4', 'home', t("Fix Mila's bike", 'Milas Fahrrad reparieren'), 'done', 1),
    ],
    tasks: [
      {
        id: 'demo-t1',
        date: today,
        kind: 'must',
        text: t('Send the presentation draft to Jonas', 'Präsentationsentwurf an Jonas schicken'),
        goalId: 'demo-g2',
        status: 'open',
      },
      {
        id: 'demo-t2',
        date: today,
        kind: 'also',
        text: t('Buy a birthday present for Grandma', 'Geburtstagsgeschenk für Oma kaufen'),
        goalId: null,
        status: 'open',
      },
      {
        id: 'demo-t3',
        date: today,
        kind: 'also',
        text: t('Compare holiday flats in Ticino', 'Ferienwohnungen im Tessin vergleichen'),
        goalId: 'demo-g3',
        status: 'done',
      },
    ],
    plans: [
      {
        id: 'demo-p1',
        date: today,
        time: '17:30',
        text: t('Mila: swimming lesson', 'Mila: Schwimmkurs'),
      },
      {
        id: 'demo-p2',
        date: addDays(today, 1),
        time: '19:00',
        text: t("Parents' evening at school", 'Elternabend in der Schule'),
      },
      {
        id: 'demo-p3',
        date: addDays(today, 3),
        time: null,
        text: t("Grandma's birthday", 'Omas Geburtstag'),
      },
    ],
  };
}

export const DAILY: DailySettings = {
  enabled: true,
  time: '07:00',
  sign: null,
  horoscope: false,
  plans: true,
  goals: true,
  weekDay: 1,
  weekTime: '07:30',
  evening: true,
  eveningTime: '20:30',
  town: 'Freiburg',
  nearby: [],
};

export function seedProfile(lang: Language): string[] {
  const t = (en: string, de: string) => L(lang, en, de);
  return [
    t(
      'Lives in Freiburg with Ben and their daughter Mila (9)',
      'Wohnt in Freiburg mit Ben und Tochter Mila (9)',
    ),
    t('Works as an architect', 'Arbeitet als Architektin'),
    t('Mostly vegetarian on weekdays', 'Unter der Woche meist vegetarisch'),
    t('Mila is learning to swim and loves dragons', 'Mila lernt schwimmen und liebt Drachen'),
  ];
}
