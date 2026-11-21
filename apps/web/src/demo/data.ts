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
  description: [string, string, string, string],
  details: [string, string, string, string],
  vision: boolean,
  thinking: boolean,
  maxMessageChars: number,
): ChatModelInfo => ({
  id,
  label: { en: label, de: label, fr: label, it: label },
  description: { en: description[0], de: description[1], fr: description[2], it: description[3] },
  engineModel,
  details: { en: details[0], de: details[1], fr: details[2], it: details[3] },
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
    [
      'Best all-rounder: fast, sees photos',
      'Bester Allrounder: schnell, sieht Fotos',
      'Le meilleur polyvalent : rapide, voit les photos',
      'Il miglior tuttofare: veloce, vede le foto',
    ],
    [
      'Uses 4B of its 26B parameters per word · ~45 words/s · 19 GB',
      'Nutzt 4B seiner 26B Parameter pro Wort · ~45 Wörter/s · 19 GB',
      'Utilise 4B de ses 26B paramètres par mot · ~45 mots/s · 19 Go',
      'Usa 4B dei suoi 26B parametri per parola · ~45 parole/s · 19 GB',
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
      'Plus petit et plus léger, laisse de la place pour les images',
      'Più piccolo e leggero, lascia spazio alle immagini',
    ],
    [
      'Uses all 12B parameters per word · ~25 words/s · 9 GB',
      'Nutzt alle 12B Parameter pro Wort · ~25 Wörter/s · 9 GB',
      'Utilise ses 12B paramètres par mot · ~25 mots/s · 9 Go',
      'Usa tutti i 12B parametri per parola · ~25 parole/s · 9 GB',
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
      'Le plus réfléchi, mais lent : pour les questions difficiles',
      'Il più riflessivo, ma lento: per le domande difficili',
    ],
    [
      'Uses all 27B parameters per word · ~9–25 words/s · 21+ GB',
      'Nutzt alle 27B Parameter pro Wort · ~9–25 Wörter/s · 21+ GB',
      'Utilise ses 27B paramètres par mot · ~9–25 mots/s · 21+ Go',
      'Usa tutti i 27B parametri per parola · ~9–25 parole/s · 21+ GB',
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

/** The text in the demo's language. */
const L = (lang: Language, en: string, de: string, fr: string, it: string) =>
  ({ en, de, fr, it })[lang];

export function seedChats(lang: Language): SeedChat[] {
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
  return [
    {
      id: 'demo-fridge',
      title: t(
        'Dinner from the fridge',
        'Abendessen aus dem Kühlschrank',
        'Le dîner avec ce qu’il y a dans le frigo',
        'La cena con quello che c’è in frigo',
      ),
      agentId: null,
      think: false,
      minutesAgo: 95,
      messages: [
        {
          role: 'user',
          content: t(
            'What can I cook tonight with this? Something quick, Mila is hungry.',
            'Was kann ich heute Abend damit kochen? Etwas Schnelles, Mila hat Hunger.',
            'Qu’est-ce que je peux cuisiner ce soir avec ça ? Quelque chose de rapide, Mila a faim.',
            'Cosa posso cucinare stasera con questo? Qualcosa di veloce, Mila ha fame.',
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
            'Je vois des œufs, un sachet d’épinards, des tomates cerises, un poivron jaune, un demi-citron et un pot de yaourt. Ça donne une **frittata aux épinards** en 20 minutes :\n\n1. Coupe le poivron en lamelles et une poignée de tomates en deux. Fais revenir le poivron dans un peu d’huile pendant 3 minutes.\n2. Ajoute les épinards et laisse-les tomber (1 à 2 minutes).\n3. Bats 6 œufs avec du sel et du poivre, verse-les par-dessus, répartis les tomates sur le dessus.\n4. Laisse cuire doucement à couvert 8 à 10 minutes, jusqu’à ce que ce soit juste pris.\n\n**Sauce :** du yaourt avec un filet de citron, du sel et un peu d’ail si tu en as.\n\nCoupe-la en parts : les enfants l’aiment souvent avec du pain. Tu veux une version sans poivron ?',
            'Vedo uova, una busta di spinaci, pomodorini, un peperone giallo, mezzo limone e un vasetto di yogurt. Ci viene una **frittata agli spinaci** in 20 minuti:\n\n1. Taglia il peperone a listarelle e una manciata di pomodorini a metà. Fai rosolare il peperone in un filo d’olio per 3 minuti.\n2. Aggiungi gli spinaci e lasciali appassire (1–2 minuti).\n3. Sbatti 6 uova con sale e pepe, versale sopra e distribuisci i pomodorini.\n4. Cuoci a fuoco basso con il coperchio per 8–10 minuti, finché si rapprende.\n\n**Salsa:** yogurt con una spruzzata di limone, sale e un po’ d’aglio se ce l’hai.\n\nTagliala a spicchi: ai bambini di solito piace con il pane. Vuoi una versione senza peperone?',
          ),
        },
      ],
    },
    {
      id: 'demo-dragon',
      title: t(
        'A dragon for Mila',
        'Ein Drache für Mila',
        'Un dragon pour Mila',
        'Un drago per Mila',
      ),
      agentId: null,
      think: false,
      minutesAgo: 60 * 22,
      messages: [
        {
          role: 'user',
          content: t(
            'Draw a friendly little dragon reading a book under an apple tree, watercolour, for a bedtime story.',
            'Mal einen freundlichen kleinen Drachen, der unter einem Apfelbaum ein Buch liest, Aquarell, für eine Gutenachtgeschichte.',
            'Dessine un petit dragon gentil qui lit un livre sous un pommier, à l’aquarelle, pour une histoire du soir.',
            'Disegna un draghetto simpatico che legge un libro sotto un melo, ad acquerello, per una storia della buonanotte.',
          ),
        },
        {
          role: 'assistant',
          content: t(
            'Here is your little dragon under the apple tree.',
            'Hier ist dein kleiner Drache unter dem Apfelbaum.',
            'Voici ton petit dragon sous le pommier.',
            'Ecco il tuo draghetto sotto il melo.',
          ),
          media: [{ id: 'demo-dragon', kind: 'generated' }],
        },
        {
          role: 'user',
          content: t(
            'Mila loves him! Now a short bedtime story about him, please.',
            'Mila liebt ihn! Jetzt bitte eine kurze Gutenachtgeschichte über ihn.',
            'Mila l’adore ! Maintenant une petite histoire du soir sur lui, s’il te plaît.',
            'Mila lo adora! Ora una breve storia della buonanotte su di lui, per favore.',
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
            '**Pip et le pommier**\n\nPip était le plus petit dragon de la vallée, et le seul qui ne savait pas cracher du feu. Quand il essayait, il ne sortait qu’un petit souffle d’air chaud qui sentait la pomme.\n\nLes autres dragons se moquaient de lui, alors Pip allait sous le vieux pommier au bord du pré et lisait son livre préféré. Un soir d’automne, une petite fille passa par là, toute grelottante. Pip hésita, puis souffla son air chaud parfumé à la pomme sur ses mains froides.\n\n« C’est le plus beau des feux », dit-elle, et elle s’assit à côté de lui. Depuis ce jour, ils lurent ensemble chaque soir, jusqu’à ce que les étoiles apparaissent et qu’ils bâillent tous les deux.\n\n*Fin. Dors bien, Mila.* 🌙',
            '**Pip e il melo**\n\nPip era il drago più piccolo della valle, e l’unico che non sapeva sputare fuoco. Quando ci provava, usciva solo un piccolo soffio d’aria calda che sapeva di mela.\n\nGli altri draghi ridevano di lui, così Pip andava sotto il vecchio melo ai margini del prato e leggeva il suo libro preferito. Una sera d’autunno passò di lì una bambina che tremava dal freddo. Pip esitò, poi soffiò il suo alito caldo alla mela sulle sue mani gelate.\n\n«È il fuoco più bello che ci sia», disse lei, e si sedette accanto a lui. Da quel giorno lessero insieme ogni sera, finché spuntavano le stelle e sbadigliavano tutti e due.\n\n*Fine. Dormi bene, Mila.* 🌙',
          ),
        },
      ],
    },
    {
      id: 'demo-plant',
      title: t(
        'Yellow leaves on the monstera',
        'Gelbe Blätter an der Monstera',
        'Feuilles jaunes sur le monstera',
        'Foglie gialle sulla monstera',
      ),
      agentId: null,
      think: false,
      minutesAgo: 60 * 50,
      messages: [
        {
          role: 'user',
          content: t(
            'Why are the leaves turning yellow?',
            'Warum werden die Blätter gelb?',
            'Pourquoi les feuilles jaunissent-elles ?',
            'Perché le foglie diventano gialle?',
          ),
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
            'Ton monstera a l’air en bonne santé dans l’ensemble : de nouvelles feuilles, une belle couleur. Les bords jaunes, un peu bruns, sur deux feuilles plus anciennes indiquent généralement l’une de ces causes :\n\n- **Soleil direct :** il est juste à la fenêtre. Le soleil de midi à travers la vitre brûle le bord des feuilles. Recule-le d’un mètre ou place-le derrière un voilage.\n- **Trop d’eau :** si la terre reste mouillée pendant des jours, les racines souffrent et les feuilles les plus anciennes jaunissent d’abord. N’arrose que quand les 3 à 4 premiers centimètres sont secs.\n- **Vieilles feuilles :** une ou deux qui jaunissent en bas, c’est normal.\n\nLes racines aériennes sur la terre ne posent pas de problème. Je commencerais par la lumière : c’est la cause la plus probable ici.',
            'La tua monstera nel complesso sembra in salute: foglie nuove, un bel colore. I bordi gialli, un po’ marroni, su due foglie più vecchie di solito indicano una di queste cause:\n\n- **Sole diretto:** è proprio alla finestra. Il sole di mezzogiorno attraverso il vetro brucia i bordi delle foglie. Spostala un metro più indietro o dietro una tenda leggera.\n- **Troppa acqua:** se il terriccio resta bagnato per giorni, le radici soffrono e le foglie più vecchie ingialliscono per prime. Annaffia solo quando i primi 3–4 cm sono asciutti.\n- **Foglie vecchie:** una o due che ingialliscono in basso sono normali.\n\nLe radici aeree sul terriccio vanno bene. Comincerei dalla luce: qui è la causa più probabile.',
          ),
        },
      ],
    },
    {
      id: 'demo-lake',
      title: t(
        'Weekend at Lake Constance',
        'Wochenende am Bodensee',
        'Week-end au lac de Constance',
        'Weekend sul lago di Costanza',
      ),
      agentId: null,
      think: false,
      minutesAgo: 60 * 75,
      messages: [
        {
          role: 'user',
          content: t(
            'Plan a Saturday at Lake Constance with a 9-year-old, starting from Freiburg by train.',
            'Plane einen Samstag am Bodensee mit einer Neunjährigen, Start in Freiburg mit dem Zug.',
            'Planifie un samedi au lac de Constance avec une enfant de 9 ans, en train depuis Fribourg-en-Brisgau.',
            'Pianifica un sabato sul lago di Costanza con una bambina di 9 anni, in treno da Friburgo in Brisgovia.',
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
            'Voici une journée tranquille qui convient bien à une enfant de 9 ans :\n\n**Matin**\n- Train tôt pour **Constance** (environ 2 h 30 ; il y a des liaisons directes, vérifie l’horaire la veille).\n- Promenade le long du port jusqu’à la statue Imperia : elle tourne lentement, les enfants adorent le remarquer.\n\n**Midi**\n- Bus ou bateau jusqu’à **l’île de Mainau** : jardins, maison aux papillons et grande aire de jeux. Pique-nique ou le café sur place.\n\n**Après-midi**\n- Retour en bateau vers **Unteruhldingen** pour voir les **maisons sur pilotis** (Pfahlbauten), un village de l’âge de pierre reconstruit sur l’eau. Compte 1 h 30.\n\n**Astuce :** un billet journalier pour les bateaux revient souvent moins cher que des billets simples, et prends un pull de rechange : il y a du vent sur le pont.',
            'Ecco una giornata tranquilla che va bene con una bambina di 9 anni:\n\n**Mattina**\n- Treno presto per **Costanza** (circa 2 ore e mezza; ci sono collegamenti diretti, controlla l’orario la sera prima).\n- Passeggiata lungo il porto fino alla statua Imperia: gira lentamente, i bambini adorano accorgersene.\n\n**Mezzogiorno**\n- Bus o battello per **l’isola di Mainau**: giardini, una casa delle farfalle e un grande parco giochi. Picnic o il caffè sul posto.\n\n**Pomeriggio**\n- Battello di ritorno verso **Unteruhldingen** per vedere le **palafitte** (Pfahlbauten), un villaggio dell’età della pietra ricostruito sull’acqua. Calcola un’ora e mezza.\n\n**Consiglio:** un biglietto giornaliero per i battelli spesso costa meno dei biglietti singoli, e porta un maglione in più: sul ponte c’è vento.',
          ),
          searches: [
            {
              query: t(
                'Lake Constance day trip with children Mainau stilt houses',
                'Bodensee Ausflug mit Kindern Mainau Pfahlbauten',
                'Excursion au lac de Constance avec enfants Mainau maisons sur pilotis',
                'Gita al lago di Costanza con bambini Mainau palafitte',
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
      title: t(
        'Fractions homework',
        'Bruchrechnen',
        'Devoirs sur les fractions',
        'Compiti sulle frazioni',
      ),
      agentId: 'demo-agent-homework',
      think: false,
      minutesAgo: 60 * 24 * 4,
      messages: [
        {
          role: 'user',
          content: t(
            'Mila asks why 1/2 is bigger than 1/3 when 3 is bigger than 2.',
            'Mila fragt, warum 1/2 größer ist als 1/3, obwohl 3 größer ist als 2.',
            'Mila demande pourquoi 1/2 est plus grand que 1/3 alors que 3 est plus grand que 2.',
            'Mila chiede perché 1/2 è più grande di 1/3 se 3 è più grande di 2.',
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
            'Excellente question ! Essaie avec une pizza 🍕\n\n- **1/2** veut dire : couper la pizza en **2** parts et en prendre une.\n- **1/3** veut dire : couper la même pizza en **3** parts et en prendre une.\n\nPlus tu coupes de parts, plus chaque part est **petite**. Le nombre du bas dit donc combien de parts il y a, pas leur taille.\n\n**À toi de jouer :** lequel est le plus grand, 1/4 ou 1/5 ? (Indice : imagine partager un gâteau avec 4 amis ou avec 5.)',
            'Ottima domanda! Prova con una pizza 🍕\n\n- **1/2** vuol dire: taglia la pizza in **2** pezzi e prendine uno.\n- **1/3** vuol dire: taglia la stessa pizza in **3** pezzi e prendine uno.\n\nPiù pezzi tagli, più ogni pezzo diventa **piccolo**. Il numero sotto ti dice quanti pezzi ci sono, non quanto sono grandi.\n\n**Prova tu:** quale è più grande, 1/4 o 1/5? (Suggerimento: immagina di dividere una torta con 4 amici o con 5.)',
          ),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Agents

export function seedAgents(lang: Language, now: number): Agent[] {
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
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
      name: t('Homework helper', 'Hausaufgabenhilfe', 'Aide aux devoirs', 'Aiuto compiti'),
      emoji: '📚',
      description: t(
        'Explains step by step, never just the answer',
        'Erklärt Schritt für Schritt, nie nur die Lösung',
        'Explique pas à pas, sans jamais donner directement la réponse',
        'Spiega passo per passo, senza mai dare subito la risposta',
      ),
      instructions: t(
        'You help a 9-year-old with homework. Explain with everyday examples, ask a question back, and never just give the final answer.',
        'Du hilfst einer Neunjährigen bei den Hausaufgaben. Erkläre mit Beispielen aus dem Alltag, stell eine Rückfrage und verrate nie einfach die Lösung.',
        'Tu aides une enfant de 9 ans à faire ses devoirs. Explique avec des exemples du quotidien, pose une question en retour et ne donne jamais directement la réponse finale.',
        'Aiuti una bambina di 9 anni con i compiti. Spiega con esempi di tutti i giorni, fai una domanda a tua volta e non dare mai subito la risposta finale.',
      ),
      examples: [
        t(
          'Why is 1/2 bigger than 1/3?',
          'Warum ist 1/2 größer als 1/3?',
          'Pourquoi 1/2 est-il plus grand que 1/3 ?',
          'Perché 1/2 è più grande di 1/3?',
        ),
        t(
          'Help me with my essay about autumn',
          'Hilf mir bei meinem Aufsatz über den Herbst',
          'Aide-moi pour ma rédaction sur l’automne',
          'Aiutami con il tema sull’autunno',
        ),
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
      name: t('Kitchen coach', 'Küchenhilfe', 'Coach cuisine', 'Coach in cucina'),
      emoji: '🍳',
      description: t(
        'Quick family meals from what is at home',
        'Schnelle Familienessen aus dem, was da ist',
        'Des repas de famille rapides avec ce qu’il y a à la maison',
        'Pasti di famiglia veloci con quello che c’è in casa',
      ),
      instructions: t(
        'Suggest quick, vegetarian-friendly family meals from the ingredients given. Keep recipes short, with times.',
        'Schlage schnelle, vegetarierfreundliche Familienessen aus den genannten Zutaten vor. Kurze Rezepte mit Zeitangaben.',
        'Propose des repas de famille rapides, adaptés aux végétariens, à partir des ingrédients donnés. Garde les recettes courtes, avec les temps.',
        'Proponi pasti di famiglia veloci, adatti anche ai vegetariani, con gli ingredienti indicati. Ricette brevi, con i tempi.',
      ),
      examples: [
        t(
          'What can I cook with this?',
          'Was kann ich damit kochen?',
          'Qu’est-ce que je peux cuisiner avec ça ?',
          'Cosa posso cucinare con questo?',
        ),
      ],
      scope: 'personal',
      editable: true,
      pinned: true,
      pinOrder: 1,
    },
    {
      ...base,
      id: 'demo-agent-letters',
      name: t('Letter writer', 'Briefe schreiben', 'Rédacteur de lettres', 'Scrittore di lettere'),
      emoji: '✉️',
      description: t(
        'Polite, clear letters and emails',
        'Höfliche, klare Briefe und E-Mails',
        'Des lettres et e-mails polis et clairs',
        'Lettere ed e-mail cortesi e chiare',
      ),
      instructions: t(
        'Write polite, clear letters and emails. Ask who it is for if that is unclear.',
        'Schreibe höfliche, klare Briefe und E-Mails. Frag nach, an wen sie gehen, wenn das unklar ist.',
        'Rédige des lettres et des e-mails polis et clairs. Demande à qui ils s’adressent si ce n’est pas clair.',
        'Scrivi lettere ed e-mail cortesi e chiare. Chiedi a chi sono destinate se non è chiaro.',
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
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
  return [
    {
      key: 'travel',
      name: t(
        'Trip planner',
        'Reiseplanung',
        'Planificateur de voyages',
        'Pianificatore di viaggi',
      ),
      emoji: '🧭',
      description: t(
        'Day trips and holidays',
        'Ausflüge und Urlaub',
        'Excursions et vacances',
        'Gite e vacanze',
      ),
      instructions: t(
        'Plan trips with realistic times and options for children.',
        'Plane Ausflüge mit realistischen Zeiten und Ideen für Kinder.',
        'Planifie des voyages avec des temps réalistes et des options pour les enfants.',
        'Pianifica viaggi con tempi realistici e opzioni per i bambini.',
      ),
      examples: [],
      modelId: null,
      think: null,
      webSearch: true,
      images: false,
    },
    {
      key: 'language',
      name: t('Language partner', 'Sprachpartner', 'Partenaire de langue', 'Compagno di lingua'),
      emoji: '🗣️',
      description: t(
        'Practise a language by chatting',
        'Eine Sprache im Gespräch üben',
        'Pratiquer une langue en discutant',
        'Esercitarsi in una lingua chiacchierando',
      ),
      instructions: t(
        'Chat in the language the user is learning and gently correct mistakes.',
        'Unterhalte dich in der Sprache, die gelernt wird, und korrigiere Fehler freundlich.',
        'Discute dans la langue que l’utilisateur apprend et corrige ses erreurs avec douceur.',
        'Chatta nella lingua che l’utente sta imparando e correggi gli errori con gentilezza.',
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
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
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
        t(
          'Finish the quarterly report',
          'Quartalsbericht fertigstellen',
          'Terminer le rapport trimestriel',
          'Finire il rapporto trimestrale',
        ),
        'done',
        0,
      ),
      goal(
        'demo-g2',
        'work',
        t(
          'Prepare the client presentation',
          'Präsentation für den Kunden vorbereiten',
          'Préparer la présentation client',
          'Preparare la presentazione per il cliente',
        ),
        'open',
        null,
      ),
      goal(
        'demo-g3',
        'home',
        t(
          'Book the summer holiday',
          'Sommerurlaub buchen',
          'Réserver les vacances d’été',
          'Prenotare le vacanze estive',
        ),
        'open',
        null,
      ),
      goal(
        'demo-g4',
        'home',
        t(
          "Fix Mila's bike",
          'Milas Fahrrad reparieren',
          'Réparer le vélo de Mila',
          'Aggiustare la bici di Mila',
        ),
        'done',
        1,
      ),
    ],
    tasks: [
      {
        id: 'demo-t1',
        date: today,
        kind: 'must',
        text: t(
          'Send the presentation draft to Jonas',
          'Präsentationsentwurf an Jonas schicken',
          'Envoyer le brouillon de la présentation à Jonas',
          'Inviare la bozza della presentazione a Jonas',
        ),
        goalId: 'demo-g2',
        status: 'open',
      },
      {
        id: 'demo-t2',
        date: today,
        kind: 'also',
        text: t(
          'Buy a birthday present for Grandma',
          'Geburtstagsgeschenk für Oma kaufen',
          'Acheter un cadeau d’anniversaire pour Mamie',
          'Comprare un regalo di compleanno per la nonna',
        ),
        goalId: null,
        status: 'open',
      },
      {
        id: 'demo-t3',
        date: today,
        kind: 'also',
        text: t(
          'Compare holiday flats in Ticino',
          'Ferienwohnungen im Tessin vergleichen',
          'Comparer des appartements de vacances au Tessin',
          'Confrontare appartamenti per le vacanze in Ticino',
        ),
        goalId: 'demo-g3',
        status: 'done',
      },
    ],
    plans: [
      {
        id: 'demo-p1',
        date: today,
        time: '17:30',
        text: t(
          'Mila: swimming lesson',
          'Mila: Schwimmkurs',
          'Mila : cours de natation',
          'Mila: lezione di nuoto',
        ),
      },
      {
        id: 'demo-p2',
        date: addDays(today, 1),
        time: '19:00',
        text: t(
          "Parents' evening at school",
          'Elternabend in der Schule',
          'Réunion de parents à l’école',
          'Colloquio genitori a scuola',
        ),
      },
      {
        id: 'demo-p3',
        date: addDays(today, 3),
        time: null,
        text: t(
          "Grandma's birthday",
          'Omas Geburtstag',
          'Anniversaire de Mamie',
          'Compleanno della nonna',
        ),
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
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
  return [
    t(
      'Lives in Freiburg with Ben and their daughter Mila (9)',
      'Wohnt in Freiburg mit Ben und Tochter Mila (9)',
      'Vit à Fribourg-en-Brisgau avec Ben et leur fille Mila (9 ans)',
      'Vive a Friburgo in Brisgovia con Ben e la loro figlia Mila (9 anni)',
    ),
    t(
      'Works as an architect',
      'Arbeitet als Architektin',
      'Travaille comme architecte',
      'Lavora come architetta',
    ),
    t(
      'Mostly vegetarian on weekdays',
      'Unter der Woche meist vegetarisch',
      'Surtout végétarienne en semaine',
      'Per lo più vegetariana nei giorni feriali',
    ),
    t(
      'Mila is learning to swim and loves dragons',
      'Mila lernt schwimmen und liebt Drachen',
      'Mila apprend à nager et adore les dragons',
      'Mila sta imparando a nuotare e adora i draghi',
    ),
  ];
}
