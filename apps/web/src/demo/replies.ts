/**
 * Prepared answers for the demo. No model runs: a message is matched against a few topics
 * (the start screen's suggestions among them), and anything else gets an honest note that
 * this is the demo. Pictures come from the bundle (data.ts MEDIA).
 */
import type { BriefingKind, DayTask, Goal, Language, Plan, WebSearch } from '@hemmia/shared';

export interface ScriptedReply {
  text: string;
  /** A picture "made" for the reply (MEDIA id). */
  image?: string;
  search?: WebSearch;
  /** Title for a new chat. */
  title: string;
}

interface Topic {
  match: RegExp;
  reply: (lang: Language) => ScriptedReply;
}

const L = (lang: Language, en: string, de: string) => (lang === 'de' ? de : en);

const TOPICS: Topic[] = [
  {
    // Pictures: before the recipe and plan topics ("draw a birthday card").
    match:
      /\b(draw|paint|picture|image|illustrat|sketch|watercolou?r)|\bmal (eine?n?|mir)\b|\bmalen?\b|zeichne|\bbild(er)?\b|aquarell|illustrier/i,
    reply: (lang) => ({
      title: L(lang, 'A picture', 'Ein Bild'),
      image: 'demo-lighthouse',
      text: L(
        lang,
        "Here's a picture for you. (In the demo every picture is prepared in advance; on your own hub, the image model on your computer draws exactly what you describe, in about half a minute.)",
        'Hier ist ein Bild für dich. (In der Demo sind alle Bilder vorbereitet; auf deinem eigenen Hub malt das Bildmodell auf deinem Computer genau das, was du beschreibst, in etwa einer halben Minute.)',
      ),
    }),
  },
  {
    match: /cabin|hütte/i,
    reply: (lang) => ({
      title: L(lang, 'Cosy cabin', 'Gemütliche Hütte'),
      image: 'demo-cabin',
      text: L(
        lang,
        'A cosy cabin in the snow, as you asked.',
        'Eine gemütliche Hütte im Schnee, wie gewünscht.',
      ),
    }),
  },
  {
    match: /weather|wetter/i,
    reply: (lang) => ({
      title: L(lang, 'Weekend weather', 'Wetter am Wochenende'),
      search: {
        query: L(lang, 'weather forecast Freiburg weekend', 'Wetter Freiburg Wochenende'),
        sources: [{ title: 'Deutscher Wetterdienst', url: 'https://www.dwd.de/' }],
      },
      text: L(
        lang,
        `For questions like this, Hemmia searches the web (privately, through a search engine on your own computer) and shows you its sources, like the one above.

In the demo the search is only pretend, so I won't make up a forecast. On your hub you'd get the real weekend forecast for your town here.`,
        `Bei solchen Fragen sucht Hemmia im Web (privat, über eine Suchmaschine auf deinem eigenen Computer) und zeigt dir die Quellen, wie oben.

In der Demo ist die Suche nur gespielt, deshalb erfinde ich keine Vorhersage. Auf deinem Hub bekämst du hier die echte Wochenendvorhersage für deinen Ort.`,
      ),
    }),
  },
  {
    match: /dinners|abendessen|meal plan|essensplan|week of|woche/i,
    reply: (lang) => ({
      title: L(lang, 'A week of dinners', 'Eine Woche Abendessen'),
      text: L(
        lang,
        `A cheap, healthy week (mostly vegetarian, about 20–30 minutes each):

| Day | Dinner |
| --- | --- |
| Mon | Lentil bolognese with wholemeal pasta |
| Tue | Spinach frittata with a tomato salad |
| Wed | Chickpea curry with rice (make double) |
| Thu | Leftover curry in wraps with yoghurt |
| Fri | Homemade pizza: everyone tops their own |
| Sat | Vegetable soup with bread and cheese |
| Sun | Oven-roasted potatoes, carrots and fish fingers or halloumi |

**Shopping basics:** lentils, chickpeas, rice, pasta, eggs, spinach, tomatoes, carrots, potatoes, onions, yoghurt, cheese. Want a shopping list sorted by aisle?`,
        `Eine günstige, gesunde Woche (meist vegetarisch, je etwa 20–30 Minuten):

| Tag | Abendessen |
| --- | --- |
| Mo | Linsen-Bolognese mit Vollkornnudeln |
| Di | Spinat-Frittata mit Tomatensalat |
| Mi | Kichererbsen-Curry mit Reis (doppelte Menge) |
| Do | Curry-Reste im Wrap mit Joghurt |
| Fr | Selbstgemachte Pizza: Jeder belegt seine eigene |
| Sa | Gemüsesuppe mit Brot und Käse |
| So | Ofenkartoffeln und Karotten mit Fischstäbchen oder Halloumi |

**Grundeinkauf:** Linsen, Kichererbsen, Reis, Nudeln, Eier, Spinat, Tomaten, Karotten, Kartoffeln, Zwiebeln, Joghurt, Käse. Soll ich eine Einkaufsliste nach Regalen sortieren?`,
      ),
    }),
  },
  {
    match: /eggs|spinach|potato|eier|spinat|kartoffel|cook|koch|recipe|rezept/i,
    reply: (lang) => ({
      title: L(lang, 'Eggs, spinach and potatoes', 'Eier, Spinat und Kartoffeln'),
      text: L(
        lang,
        `**Spanish-style potato and spinach tortilla** (30 minutes, serves 3):

1. Slice 4 potatoes thinly and fry them gently in olive oil with an onion for 15 minutes.
2. Stir in two handfuls of spinach until it wilts.
3. Beat 6 eggs with salt, mix in the potatoes and pour everything back into the pan.
4. Cook on low heat for 8 minutes, flip with a plate, then 3 more minutes.

Serve warm or cold, with a green salad.`,
        `**Kartoffel-Spinat-Tortilla nach spanischer Art** (30 Minuten, für 3):

1. 4 Kartoffeln in dünne Scheiben schneiden und mit einer Zwiebel 15 Minuten sanft in Olivenöl braten.
2. Zwei Handvoll Spinat unterrühren, bis er zusammenfällt.
3. 6 Eier mit Salz verquirlen, die Kartoffeln untermischen und alles zurück in die Pfanne geben.
4. Bei kleiner Hitze 8 Minuten stocken lassen, mit einem Teller wenden, noch 3 Minuten.

Warm oder kalt servieren, mit grünem Salat.`,
      ),
    }),
  },
  {
    match: /vaccin|impf/i,
    reply: (lang) => ({
      title: L(lang, 'How vaccines work', 'Wie Impfungen funktionieren'),
      text: L(
        lang,
        `Think of your immune system as a security team that has to recognise intruders.

1. A vaccine shows the team a **wanted poster**: a harmless piece or weakened version of a germ, or instructions for your cells to make one piece of it.
2. The team studies it and trains **specialists** (antibodies and memory cells) for exactly that germ.
3. If the real germ shows up later, the specialists recognise it straight away and stop it before it can make you properly ill.

That's why you might feel a bit tired after a jab: the training is happening.`,
        `Stell dir dein Immunsystem als Sicherheitsteam vor, das Eindringlinge erkennen muss.

1. Eine Impfung zeigt dem Team einen **Steckbrief**: ein harmloses Stück oder eine abgeschwächte Form eines Erregers, oder eine Bauanleitung, mit der deine Zellen ein Stück davon herstellen.
2. Das Team studiert ihn und bildet **Spezialisten** aus (Antikörper und Gedächtniszellen), genau für diesen Erreger.
3. Kommt später der echte Erreger, erkennen ihn die Spezialisten sofort und stoppen ihn, bevor er dich richtig krank macht.

Deshalb fühlt man sich nach einer Impfung manchmal etwas müde: Da läuft gerade das Training.`,
      ),
    }),
  },
  {
    match: /workout|exercise|training|übung|sport/i,
    reply: (lang) => ({
      title: L(lang, '15-minute workout', '15-Minuten-Training'),
      text: L(
        lang,
        `**15 minutes, no equipment.** 40 seconds work, 20 seconds rest, 3 rounds:

1. Jumping jacks
2. Squats
3. Push-ups (on your knees is fine)
4. Lunges, alternating legs
5. Plank

Warm up with a minute of marching on the spot, and stretch for a minute at the end.`,
        `**15 Minuten, ohne Geräte.** 40 Sekunden Übung, 20 Sekunden Pause, 3 Runden:

1. Hampelmänner
2. Kniebeugen
3. Liegestütze (auf den Knien ist okay)
4. Ausfallschritte, Beine abwechselnd
5. Unterarmstütz

Zum Aufwärmen eine Minute auf der Stelle gehen, am Ende eine Minute dehnen.`,
      ),
    }),
  },
  {
    match: /\brain|\bregen|game night|spieleabend|ideas for|ideen für/i,
    reply: (lang) => ({
      title: L(lang, 'Ideas for at home', 'Ideen für zu Hause'),
      text: L(
        lang,
        `Some ideas that work for all ages:

- **Blanket fort cinema:** build a fort, make popcorn, everyone votes on one film.
- **Kitchen challenge:** each person decorates their own pizza or cupcake.
- **Treasure hunt:** hide clues around the flat; the last one leads to a small treat.
- **Game tournament:** three short games, points table on paper, a silly trophy.
- **Story jar:** everyone writes three words; pull them out and invent a story together.`,
        `Ein paar Ideen, die für alle Altersstufen funktionieren:

- **Höhlenkino:** Eine Deckenhöhle bauen, Popcorn machen, alle stimmen über einen Film ab.
- **Küchen-Challenge:** Jeder verziert seine eigene Pizza oder seinen Muffin.
- **Schatzsuche:** Hinweise in der Wohnung verstecken; der letzte führt zu einer kleinen Belohnung.
- **Spieleturnier:** Drei kurze Spiele, Punkteliste auf Papier, ein lustiger Pokal.
- **Geschichtenglas:** Jeder schreibt drei Wörter auf; ziehen und zusammen eine Geschichte erfinden.`,
      ),
    }),
  },
  {
    match: /compound|zinseszins|interest|zins/i,
    reply: (lang) => ({
      title: L(lang, 'Compound interest', 'Zinseszins'),
      text: L(
        lang,
        `Compound interest means you earn interest **on your interest**.

Example: you put **€1,000** away at **5%** a year.

| Year | Interest | Balance |
| --- | --- | --- |
| 1 | €50.00 | €1,050.00 |
| 2 | €52.50 | €1,102.50 |
| 3 | €55.13 | €1,157.63 |
| 10 | — | €1,628.89 |

Without compounding you'd have €1,500 after 10 years; with it, €1,628.89. The longer you wait, the bigger the difference.`,
        `Zinseszins heißt: Du bekommst Zinsen **auf deine Zinsen**.

Beispiel: Du legst **1.000 €** zu **5 %** im Jahr an.

| Jahr | Zinsen | Guthaben |
| --- | --- | --- |
| 1 | 50,00 € | 1.050,00 € |
| 2 | 52,50 € | 1.102,50 € |
| 3 | 55,13 € | 1.157,63 € |
| 10 | — | 1.628,89 € |

Ohne Zinseszins hättest du nach 10 Jahren 1.500 €, mit ihm 1.628,89 €. Je länger, desto größer der Unterschied.`,
      ),
    }),
  },
  {
    match: /poem|gedicht|birthday|geburtstag/i,
    reply: (lang) => ({
      title: L(lang, 'Birthday poem', 'Geburtstagsgedicht'),
      text: L(
        lang,
        `*For you, Mum*

You taught me how to tie my shoes,
to share, to try, to win and lose.
You're there with tea when days go wrong,
you laugh the loudest, sing along.

So here's a wish, from me to you:
a year as kind as all you do.
Happy birthday! 🎂`,
        `*Für dich, Mama*

Du hast mir Schuhe binden beigebracht,
hast mit mir geweint und mit mir gelacht.
Du bist mit Tee da, wenn mal nichts gelingt,
und lachst am lautesten, wenn jemand singt.

Drum wünsch ich dir von Herzen sehr
ein Jahr voll Freude – und noch mehr.
Alles Gute zum Geburtstag! 🎂`,
      ),
    }),
  },
  {
    match: /pack|camping|zelt/i,
    reply: (lang) => ({
      title: L(lang, 'Camping packing list', 'Packliste fürs Zelten'),
      text: L(
        lang,
        `**Sleeping:** tent (check the pegs!), sleeping bags, mats, pillows
**Kitchen:** stove and gas, pot, pan, mugs, cutlery, washing-up kit, lighter
**Clothes:** warm layer for the evening, rain jacket, spare socks, hat
**Other:** head torches, first-aid kit, sun cream, insect repellent, bin bags, power bank
**For kids:** a favourite toy, cards or a small game, a torch of their own`,
        `**Schlafen:** Zelt (Heringe prüfen!), Schlafsäcke, Isomatten, Kissen
**Küche:** Kocher und Gas, Topf, Pfanne, Becher, Besteck, Spülzeug, Feuerzeug
**Kleidung:** warme Schicht für abends, Regenjacke, Ersatzsocken, Mütze
**Sonstiges:** Stirnlampen, Erste-Hilfe-Set, Sonnencreme, Mückenschutz, Müllbeutel, Powerbank
**Für Kinder:** Lieblingskuscheltier, Karten oder ein kleines Spiel, eine eigene Taschenlampe`,
      ),
    }),
  },
  {
    match: /spanish|spanisch|translate|übersetz/i,
    reply: (lang) => ({
      title: L(lang, 'Translation', 'Übersetzung'),
      text: L(
        lang,
        '**¿Dónde está la farmacia más cercana?**\n\nPronounced roughly: *DON-deh es-TAH la far-MAH-see-ah mas ser-KAH-nah*.',
        '**¿Dónde está la farmacia más cercana?**\n\nUngefähr gesprochen: *DON-de es-TA la far-MA-ssia mas sser-KA-na*.',
      ),
    }),
  },
  {
    match: /suggest a book|recommend a book|book for|\bbuch für|empfiehl (mir )?ein buch/i,
    reply: (lang) => ({
      title: L(lang, 'A book for a 12-year-old', 'Ein Buch für eine Zwölfjährige'),
      text: L(
        lang,
        `Three adventure classics that work well at 12:

- **The Hobbit** (J. R. R. Tolkien): a reluctant hero, dragons and riddles.
- **Treasure Island** (R. L. Stevenson): pirates, maps and a great villain.
- **Momo** (Michael Ende): a girl who takes on the grey men who steal people's time.

If she likes series, the next step could be a longer fantasy saga.`,
        `Drei Abenteuerklassiker, die mit 12 gut passen:

- **Der Hobbit** (J. R. R. Tolkien): ein widerwilliger Held, Drachen und Rätsel.
- **Die Schatzinsel** (R. L. Stevenson): Piraten, Karten und ein toller Bösewicht.
- **Momo** (Michael Ende): ein Mädchen, das sich gegen die grauen Herren stellt, die den Menschen die Zeit stehlen.

Wenn sie Reihen mag, könnte als Nächstes eine längere Fantasy-Saga kommen.`,
      ),
    }),
  },
  {
    match: /plant|pflanze/i,
    reply: (lang) => ({
      title: L(lang, 'Plants for a dark room', 'Pflanzen für dunkle Räume'),
      text: L(
        lang,
        `Plants that cope with little light:

- **ZZ plant:** almost indestructible, water every 2–3 weeks.
- **Snake plant:** upright leaves, very forgiving.
- **Pothos:** trailing, grows even in a corner; keep away from pets.
- **Cast-iron plant (Aspidistra):** the name says it all.

Water less in a dark room: plants there use much less.`,
        `Pflanzen, die mit wenig Licht zurechtkommen:

- **Zamioculcas:** fast unverwüstlich, alle 2–3 Wochen gießen.
- **Bogenhanf:** aufrechte Blätter, sehr verzeihend.
- **Efeutute:** hängend, wächst sogar in einer Ecke; nicht für Haustiere erreichbar.
- **Schusterpalme (Aspidistra):** hält fast alles aus.

In dunklen Räumen weniger gießen: Pflanzen brauchen dort viel weniger Wasser.`,
      ),
    }),
  },
  {
    match: /e-?mail|\bletter\b|\bbrief\b|complain|beschwer/i,
    reply: (lang) => ({
      title: L(lang, 'A polite complaint', 'Höfliche Beschwerde'),
      text: L(
        lang,
        `**Subject:** Order 12345: damaged on delivery

Dear Sir or Madam,

On 3 November I received my order 12345. Unfortunately the item was damaged when it arrived (photos attached).

Could you please send a replacement or refund the purchase price? I'd be grateful for a reply within 14 days.

Kind regards,
Anna Berg

Tell me what happened and I'll adapt it.`,
        `**Betreff:** Bestellung 12345: beschädigt geliefert

Sehr geehrte Damen und Herren,

am 3. November habe ich meine Bestellung 12345 erhalten. Leider war der Artikel bei der Lieferung beschädigt (Fotos anbei).

Bitte senden Sie mir einen Ersatz oder erstatten Sie den Kaufpreis. Über eine Antwort innerhalb von 14 Tagen würde ich mich freuen.

Mit freundlichen Grüßen
Anna Berg

Erzähl mir, was passiert ist, dann passe ich es an.`,
      ),
    }),
  },
  {
    match: /^(hi|hello|hey|hallo|moin|servus|grüezi)\b/i,
    reply: (lang) => ({
      title: L(lang, 'Hello', 'Hallo'),
      text: L(
        lang,
        'Hello! 👋 This is the Hemmia demo with the made-up Berg family. Ask me for a recipe, a picture, a plan for the weekend, or have a look at the Planner in the menu.',
        'Hallo! 👋 Das ist die Hemmia-Demo mit der erfundenen Familie Berg. Frag mich nach einem Rezept, einem Bild, einem Plan fürs Wochenende, oder schau dir im Menü den Planer an.',
      ),
    }),
  },
];

function fallback(lang: Language, text: string): ScriptedReply {
  const words = text.trim().split(/\s+/).slice(0, 5).join(' ');
  return {
    title: words.length > 0 ? words : L(lang, 'New chat', 'Neuer Chat'),
    text: L(
      lang,
      `This is the demo, so no AI model is running here: answers are prepared in advance for a few questions only.

On your own hub, the model on your computer would answer this now, privately and without sending it anywhere.

To see more of the demo, try:
- *What can I cook with eggs, spinach and potatoes?*
- *Draw a cosy cabin in a snowy forest*
- *Explain compound interest with an example*
- or open the **Planner** in the menu.`,
      `Das ist die Demo, hier läuft kein KI-Modell: Antworten sind nur für ein paar Fragen vorbereitet.

Auf deinem eigenen Hub würde jetzt das Modell auf deinem Computer antworten, privat und ohne etwas nach außen zu schicken.

Um mehr von der Demo zu sehen, probier:
- *Was kann ich mit Eiern, Spinat und Kartoffeln kochen?*
- *Mal eine gemütliche Hütte im verschneiten Wald*
- *Erklär den Zinseszins an einem Beispiel*
- oder öffne den **Planer** im Menü.`,
    ),
  };
}

export function scriptedReply(input: {
  text: string;
  photos: number;
  documents: number;
  lang: Language;
}): ScriptedReply {
  const { text, lang } = input;
  if (input.photos > 0 || input.documents > 0) {
    const what = input.photos > 0 ? L(lang, 'photo', 'Foto') : L(lang, 'document', 'Dokument');
    return {
      title: L(lang, 'Your ' + what, 'Dein ' + what),
      text: L(
        lang,
        `Thanks! In the demo I can't really read your ${what}: answers are prepared in advance, and your ${what} stays on this phone.

On your own hub, a model that sees photos describes them, reads the text in them, or tells you what to cook with what's in your fridge (have a look at the chat *Dinner from the fridge*). Documents (PDF, Word, Excel) are read and summarised the same way.`,
        `Danke! In der Demo kann ich dein ${what} nicht wirklich lesen: Die Antworten sind vorbereitet, und dein ${what} bleibt auf diesem Telefon.

Auf deinem eigenen Hub beschreibt ein Modell, das Fotos sieht, deine Bilder, liest den Text darin oder sagt dir, was du aus deinem Kühlschrank kochen kannst (schau dir den Chat *Abendessen aus dem Kühlschrank* an). Dokumente (PDF, Word, Excel) werden genauso gelesen und zusammengefasst.`,
      ),
    };
  }
  // "cabin" is more specific than "draw".
  const cabin = TOPICS[1];
  if (cabin?.match.test(text)) return cabin.reply(lang);
  for (const topic of TOPICS) {
    if (topic.match.test(text)) return topic.reply(lang);
  }
  return fallback(lang, text);
}

// ---------------------------------------------------------------------------
// Planner chats (morning snapshot, weekly planning, evening check-in)

export function briefingReply(
  kind: BriefingKind,
  lang: Language,
  today: string,
  planner: { goals: Goal[]; tasks: DayTask[]; plans: Plan[] },
): string {
  const t = (en: string, de: string) => L(lang, en, de);
  const todayPlans = planner.plans
    .filter((p) => p.date === today)
    .map((p) => `- ${p.time ? `**${p.time}** ` : ''}${p.text}`);
  const tasks = planner.tasks.filter((x) => x.date === today);
  const open = tasks.filter((x) => x.status === 'open').map((x) => `- ${x.text}`);
  const done = tasks.filter((x) => x.status === 'done').map((x) => `- ✓ ${x.text}`);
  const goals = planner.goals.filter((g) => g.status !== 'dropped');
  const goalsDone = goals.filter((g) => g.status === 'done').length;
  const openGoals = goals.filter((g) => g.status === 'open').map((g) => `- ${g.text}`);
  const none = t('- nothing', '- nichts');

  if (kind === 'week') {
    return t(
      `Let's plan your week. **Your goals** (${String(goalsDone)} of ${String(goals.length)} done):

${openGoals.join('\n') || none}

What matters most this week? I'd put the presentation on Tuesday or Wednesday morning, when you have no appointments, and the holiday booking on Thursday evening. Shall I add those as tasks?`,
      `Lass uns deine Woche planen. **Deine Ziele** (${String(goalsDone)} von ${String(goals.length)} erledigt):

${openGoals.join('\n') || none}

Was ist diese Woche am wichtigsten? Die Präsentation würde ich auf Dienstag- oder Mittwochvormittag legen, wenn du keine Termine hast, und die Urlaubsbuchung auf Donnerstagabend. Soll ich das als Aufgaben eintragen?`,
    );
  }
  if (kind === 'evening') {
    return t(
      `Good evening! Here's your day:

**Done**
${done.join('\n') || none}

**Still open**
${open.join('\n') || none}

Anything to move to tomorrow? And how was Mila's swimming lesson?`,
      `Guten Abend! So war dein Tag:

**Erledigt**
${done.join('\n') || none}

**Noch offen**
${open.join('\n') || none}

Soll ich etwas auf morgen verschieben? Und wie war Milas Schwimmkurs?`,
    );
  }
  return t(
    `Good morning, Anna! ☀️ Freiburg: dry and mild today, around 14 °C (in the demo the weather is made up).

**Today**
${todayPlans.join('\n') || none}

**To do**
${open.join('\n') || none}

**This week:** ${String(goalsDone)} of ${String(goals.length)} goals done. A good moment for the presentation draft is before lunch, so it's off your desk before swimming.`,
    `Guten Morgen, Anna! ☀️ Freiburg: heute trocken und mild, um 14 °C (in der Demo ist das Wetter erfunden).

**Heute**
${todayPlans.join('\n') || none}

**Zu erledigen**
${open.join('\n') || none}

**Diese Woche:** ${String(goalsDone)} von ${String(goals.length)} Zielen erledigt. Ein guter Moment für den Präsentationsentwurf ist vor dem Mittag, dann ist er vor dem Schwimmen erledigt.`,
  );
}
