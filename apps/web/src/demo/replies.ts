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

/** The text in the demo's language. */
const L = (lang: Language, en: string, de: string, fr: string, it: string) =>
  ({ en, de, fr, it })[lang];

const TOPICS: Topic[] = [
  {
    // Pictures: before the recipe and plan topics ("draw a birthday card").
    match:
      /\b(draw|paint|picture|image|illustrat|sketch|watercolou?r)|\bmal (eine?n?|mir)\b|\bmalen?\b|zeichne|\bbild(er)?\b|aquarell|illustrier/i,
    reply: (lang) => ({
      title: L(lang, 'A picture', 'Ein Bild', 'Une image', 'Un’immagine'),
      image: 'demo-lighthouse',
      text: L(
        lang,
        "Here's a picture for you. (In the demo every picture is prepared in advance; on your own hub, the image model on your computer draws exactly what you describe, in about half a minute.)",
        'Hier ist ein Bild für dich. (In der Demo sind alle Bilder vorbereitet; auf deinem eigenen Hub malt das Bildmodell auf deinem Computer genau das, was du beschreibst, in etwa einer halben Minute.)',
        'Voici une image pour toi. (Dans la démo, chaque image est préparée à l’avance ; sur ton propre hub, le modèle d’images de ton ordinateur dessine exactement ce que tu décris, en une demi-minute environ.)',
        'Ecco un’immagine per te. (Nella demo ogni immagine è preparata in anticipo; sul tuo hub, il modello di immagini del tuo computer disegna esattamente ciò che descrivi, in circa mezzo minuto.)',
      ),
    }),
  },
  {
    match: /cabin|hütte|cabane|baita/i,
    reply: (lang) => ({
      title: L(lang, 'Cosy cabin', 'Gemütliche Hütte', 'Cabane douillette', 'Baita accogliente'),
      image: 'demo-cabin',
      text: L(
        lang,
        'A cosy cabin in the snow, as you asked.',
        'Eine gemütliche Hütte im Schnee, wie gewünscht.',
        'Une cabane douillette dans la neige, comme tu l’as demandé.',
        'Una baita accogliente nella neve, come hai chiesto.',
      ),
    }),
  },
  {
    match: /weather|wetter|météo|meteo|temps fera|tempo farà/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Weekend weather',
        'Wetter am Wochenende',
        'La météo du week-end',
        'Il meteo del weekend',
      ),
      search: {
        query: L(
          lang,
          'weather forecast Freiburg weekend',
          'Wetter Freiburg Wochenende',
          'prévisions météo Fribourg-en-Brisgau week-end',
          'previsioni meteo Friburgo in Brisgovia weekend',
        ),
        sources: [{ title: 'Deutscher Wetterdienst', url: 'https://www.dwd.de/' }],
      },
      text: L(
        lang,
        `For questions like this, Hemmia searches the web (privately, through a search engine on your own computer) and shows you its sources, like the one above.

In the demo the search is only pretend, so I won't make up a forecast. On your hub you'd get the real weekend forecast for your town here.`,
        `Bei solchen Fragen sucht Hemmia im Web (privat, über eine Suchmaschine auf deinem eigenen Computer) und zeigt dir die Quellen, wie oben.

In der Demo ist die Suche nur gespielt, deshalb erfinde ich keine Vorhersage. Auf deinem Hub bekämst du hier die echte Wochenendvorhersage für deinen Ort.`,
        'Pour ce genre de question, Hemmia cherche sur le web (de façon privée, via un moteur de recherche sur ton propre ordinateur) et te montre ses sources, comme celle ci-dessus.\n\nDans la démo, la recherche est seulement simulée, donc je n’invente pas de prévisions. Sur ton hub, tu aurais ici les vraies prévisions du week-end pour ta ville.',
        'Per domande come questa, Hemmia cerca sul web (in modo privato, tramite un motore di ricerca sul tuo computer) e ti mostra le fonti, come quella qui sopra.\n\nNella demo la ricerca è solo simulata, quindi non mi invento le previsioni. Sul tuo hub qui avresti le vere previsioni del weekend per la tua città.',
      ),
    }),
  },
  {
    match:
      /dinners|abendessen|meal plan|essensplan|week of|woche|dîners|semaine de|cene|settimana di/i,
    reply: (lang) => ({
      title: L(
        lang,
        'A week of dinners',
        'Eine Woche Abendessen',
        'Une semaine de dîners',
        'Una settimana di cene',
      ),
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
        'Une semaine bon marché et saine (surtout végétarienne, 20 à 30 minutes chaque soir) :\n\n| Jour | Dîner |\n| --- | --- |\n| Lun | Bolognaise de lentilles avec des pâtes complètes |\n| Mar | Frittata aux épinards et salade de tomates |\n| Mer | Curry de pois chiches avec du riz (en faire le double) |\n| Jeu | Le reste du curry en wraps avec du yaourt |\n| Ven | Pizza maison : chacun garnit la sienne |\n| Sam | Soupe de légumes avec du pain et du fromage |\n| Dim | Pommes de terre et carottes au four avec des bâtonnets de poisson ou du halloumi |\n\n**Les bases à acheter :** lentilles, pois chiches, riz, pâtes, œufs, épinards, tomates, carottes, pommes de terre, oignons, yaourt, fromage. Tu veux une liste de courses triée par rayon ?',
        'Una settimana economica e sana (per lo più vegetariana, 20–30 minuti ogni sera):\n\n| Giorno | Cena |\n| --- | --- |\n| Lun | Ragù di lenticchie con pasta integrale |\n| Mar | Frittata agli spinaci con insalata di pomodori |\n| Mer | Curry di ceci con riso (fanne il doppio) |\n| Gio | Il curry avanzato in piadine con yogurt |\n| Ven | Pizza fatta in casa: ognuno condisce la sua |\n| Sab | Minestrone con pane e formaggio |\n| Dom | Patate e carote al forno con bastoncini di pesce o halloumi |\n\n**Spesa di base:** lenticchie, ceci, riso, pasta, uova, spinaci, pomodori, carote, patate, cipolle, yogurt, formaggio. Vuoi una lista della spesa ordinata per reparto?',
      ),
    }),
  },
  {
    match:
      /eggs|spinach|potato|eier|spinat|kartoffel|cook|koch|recipe|rezept|œufs|oeufs|épinards|pommes de terre|cuisiner|recette|uova|spinaci|patate|cucinare|ricetta/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Eggs, spinach and potatoes',
        'Eier, Spinat und Kartoffeln',
        'Œufs, épinards et pommes de terre',
        'Uova, spinaci e patate',
      ),
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
        '**Tortilla aux pommes de terre et aux épinards, à l’espagnole** (30 minutes, pour 3) :\n\n1. Coupe 4 pommes de terre en fines rondelles et fais-les revenir doucement 15 minutes dans l’huile d’olive avec un oignon.\n2. Incorpore deux poignées d’épinards jusqu’à ce qu’ils tombent.\n3. Bats 6 œufs avec du sel, mélange-y les pommes de terre et remets le tout dans la poêle.\n4. Laisse cuire 8 minutes à feu doux, retourne à l’aide d’une assiette, puis encore 3 minutes.\n\nSers chaud ou froid, avec une salade verte.',
        '**Tortilla di patate e spinaci alla spagnola** (30 minuti, per 3):\n\n1. Taglia 4 patate a fettine sottili e falle rosolare dolcemente nell’olio d’oliva con una cipolla per 15 minuti.\n2. Aggiungi due manciate di spinaci finché appassiscono.\n3. Sbatti 6 uova con il sale, unisci le patate e rimetti tutto in padella.\n4. Cuoci a fuoco basso per 8 minuti, girala con un piatto, poi altri 3 minuti.\n\nServila calda o fredda, con un’insalata verde.',
      ),
    }),
  },
  {
    match: /vaccin|impf|vacc/i,
    reply: (lang) => ({
      title: L(
        lang,
        'How vaccines work',
        'Wie Impfungen funktionieren',
        'Comment fonctionnent les vaccins',
        'Come funzionano i vaccini',
      ),
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
        'Imagine ton système immunitaire comme une équipe de sécurité qui doit reconnaître les intrus.\n\n1. Un vaccin montre à l’équipe un **avis de recherche** : un morceau inoffensif ou une version affaiblie d’un microbe, ou des instructions pour que tes cellules en fabriquent un morceau.\n2. L’équipe l’étudie et forme des **spécialistes** (anticorps et cellules mémoire) pour ce microbe précis.\n3. Si le vrai microbe arrive plus tard, les spécialistes le reconnaissent tout de suite et l’arrêtent avant qu’il ne puisse vraiment te rendre malade.\n\nC’est pour ça que tu peux te sentir un peu fatigué après une piqûre : l’entraînement est en cours.',
        'Immagina il tuo sistema immunitario come una squadra di sicurezza che deve riconoscere gli intrusi.\n\n1. Un vaccino mostra alla squadra un **manifesto da ricercato**: un pezzo innocuo o una versione indebolita di un germe, o le istruzioni perché le tue cellule ne producano un pezzo.\n2. La squadra lo studia e addestra degli **specialisti** (anticorpi e cellule della memoria) proprio per quel germe.\n3. Se più tardi arriva il germe vero, gli specialisti lo riconoscono subito e lo fermano prima che possa farti ammalare sul serio.\n\nPer questo dopo una puntura puoi sentirti un po’ stanco: è in corso l’allenamento.',
      ),
    }),
  },
  {
    match: /workout|exercise|training|übung|sport|entraînement|allenamento|esercizi/i,
    reply: (lang) => ({
      title: L(
        lang,
        '15-minute workout',
        '15-Minuten-Training',
        'Entraînement de 15 minutes',
        'Allenamento di 15 minuti',
      ),
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
        '**15 minutes, sans matériel.** 40 secondes d’effort, 20 secondes de repos, 3 tours :\n\n1. Jumping jacks\n2. Squats\n3. Pompes (sur les genoux, c’est bien aussi)\n4. Fentes, en alternant les jambes\n5. Gainage\n\nÉchauffe-toi avec une minute de marche sur place, et étire-toi une minute à la fin.',
        '**15 minuti, senza attrezzi.** 40 secondi di lavoro, 20 secondi di pausa, 3 giri:\n\n1. Jumping jack\n2. Squat\n3. Piegamenti (anche sulle ginocchia va bene)\n4. Affondi, alternando le gambe\n5. Plank\n\nScaldati con un minuto di marcia sul posto, e allungati per un minuto alla fine.',
      ),
    }),
  },
  {
    match:
      /\brain|\bregen|game night|spieleabend|ideas for|ideen für|pluvieux|soirée jeux|idées pour|piovosa|serata giochi|idee per/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Ideas for at home',
        'Ideen für zu Hause',
        'Des idées pour la maison',
        'Idee per stare a casa',
      ),
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
        'Quelques idées qui marchent à tout âge :\n\n- **Cinéma dans une cabane de couvertures :** construisez une cabane, faites du pop-corn, tout le monde vote pour un film.\n- **Défi cuisine :** chacun décore sa propre pizza ou son cupcake.\n- **Chasse au trésor :** cache des indices dans l’appartement ; le dernier mène à une petite surprise.\n- **Tournoi de jeux :** trois jeux courts, un tableau des points sur papier, un trophée rigolo.\n- **Bocal à histoires :** chacun écrit trois mots ; tirez-les au sort et inventez une histoire ensemble.',
        'Qualche idea che funziona a tutte le età:\n\n- **Cinema nella tenda di coperte:** costruite una tenda, fate i popcorn, tutti votano un film.\n- **Sfida in cucina:** ognuno decora la propria pizza o il proprio cupcake.\n- **Caccia al tesoro:** nascondi indizi per casa; l’ultimo porta a una piccola sorpresa.\n- **Torneo di giochi:** tre giochi brevi, una tabella dei punti su carta, un trofeo buffo.\n- **Barattolo delle storie:** ognuno scrive tre parole; pescatele e inventate insieme una storia.',
      ),
    }),
  },
  {
    match: /compound|zinseszins|interest|zins|intérêts|interesse/i,
    reply: (lang) => ({
      title: L(lang, 'Compound interest', 'Zinseszins', 'Intérêts composés', 'Interesse composto'),
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
        'Les intérêts composés, c’est gagner des intérêts **sur tes intérêts**.\n\nExemple : tu places **1 000 €** à **5 %** par an.\n\n| Année | Intérêts | Solde |\n| --- | --- | --- |\n| 1 | 50,00 € | 1 050,00 € |\n| 2 | 52,50 € | 1 102,50 € |\n| 3 | 55,13 € | 1 157,63 € |\n| 10 | — | 1 628,89 € |\n\nSans intérêts composés, tu aurais 1 500 € après 10 ans ; avec, 1 628,89 €. Plus tu attends, plus la différence est grande.',
        'L’interesse composto significa che guadagni interessi **sui tuoi interessi**.\n\nEsempio: metti da parte **1.000 €** al **5%** all’anno.\n\n| Anno | Interessi | Saldo |\n| --- | --- | --- |\n| 1 | 50,00 € | 1.050,00 € |\n| 2 | 52,50 € | 1.102,50 € |\n| 3 | 55,13 € | 1.157,63 € |\n| 10 | — | 1.628,89 € |\n\nSenza interesse composto avresti 1.500 € dopo 10 anni; con, 1.628,89 €. Più aspetti, più grande è la differenza.',
      ),
    }),
  },
  {
    match: /poem|gedicht|birthday|geburtstag|poème|anniversaire|poesia|compleanno/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Birthday poem',
        'Geburtstagsgedicht',
        'Poème d’anniversaire',
        'Poesia di compleanno',
      ),
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
        '*Pour toi, Maman*\n\nTu m’as appris à lacer mes souliers,\nà partager, à oser, à gagner, à perdre aussi.\nTu es là avec un thé quand tout va de travers,\ntu ris le plus fort, tu chantes avec nous.\n\nAlors voici un vœu, de moi pour toi :\nune année aussi douce que tout ce que tu fais.\nJoyeux anniversaire ! 🎂',
        '*Per te, mamma*\n\nMi hai insegnato ad allacciarmi le scarpe,\na dividere, a provare, a vincere e a perdere.\nCi sei con un tè quando le giornate vanno storte,\nridi più forte di tutti e canti con noi.\n\nEcco allora un augurio, da me per te:\nun anno gentile come tutto ciò che fai.\nBuon compleanno! 🎂',
      ),
    }),
  },
  {
    match: /pack|camping|zelt|bagages|emporter|campeggio|valigia/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Camping packing list',
        'Packliste fürs Zelten',
        'Liste pour le camping',
        'Lista per il campeggio',
      ),
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
        '**Pour dormir :** tente (vérifie les sardines !), sacs de couchage, matelas, oreillers\n**Cuisine :** réchaud et gaz, casserole, poêle, tasses, couverts, nécessaire à vaisselle, briquet\n**Vêtements :** une couche chaude pour le soir, veste de pluie, chaussettes de rechange, bonnet\n**Autres :** lampes frontales, trousse de secours, crème solaire, anti-moustiques, sacs-poubelle, batterie externe\n**Pour les enfants :** un jouet préféré, des cartes ou un petit jeu, leur propre lampe de poche',
        '**Per dormire:** tenda (controlla i picchetti!), sacchi a pelo, materassini, cuscini\n**Cucina:** fornello e gas, pentola, padella, tazze, posate, kit per lavare i piatti, accendino\n**Vestiti:** uno strato caldo per la sera, giacca antipioggia, calze di ricambio, berretto\n**Altro:** lampade frontali, kit di pronto soccorso, crema solare, repellente per insetti, sacchi della spazzatura, power bank\n**Per i bambini:** un giocattolo preferito, carte o un piccolo gioco, una torcia tutta loro',
      ),
    }),
  },
  {
    match: /spanish|spanisch|translate|übersetz|espagnol|tradui|spagnolo|tradu/i,
    reply: (lang) => ({
      title: L(lang, 'Translation', 'Übersetzung', 'Traduction', 'Traduzione'),
      text: L(
        lang,
        '**¿Dónde está la farmacia más cercana?**\n\nPronounced roughly: *DON-deh es-TAH la far-MAH-see-ah mas ser-KAH-nah*.',
        '**¿Dónde está la farmacia más cercana?**\n\nUngefähr gesprochen: *DON-de es-TA la far-MA-ssia mas sser-KA-na*.',
        '**¿Dónde está la farmacia más cercana?**\n\nÇa se prononce à peu près : *DONN-dé ess-TA la far-MA-ssia mass sser-KA-na*.',
        '**¿Dónde está la farmacia más cercana?**\n\nSi pronuncia più o meno: *DON-de es-TÀ la far-MÀ-sia mas ser-KÀ-na*.',
      ),
    }),
  },
  {
    match:
      /suggest a book|recommend a book|book for|\bbuch für|empfiehl (mir )?ein buch|un livre|livre pour|un libro|libro per/i,
    reply: (lang) => ({
      title: L(
        lang,
        'A book for a 12-year-old',
        'Ein Buch für eine Zwölfjährige',
        'Un livre pour une fille de 12 ans',
        'Un libro per una dodicenne',
      ),
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
        'Trois classiques de l’aventure qui marchent bien à 12 ans :\n\n- **Le Hobbit** (J. R. R. Tolkien) : un héros malgré lui, des dragons et des énigmes.\n- **L’Île au trésor** (R. L. Stevenson) : des pirates, des cartes et un grand méchant.\n- **Momo** (Michael Ende) : une fille qui affronte les hommes en gris qui volent le temps des gens.\n\nSi elle aime les séries, l’étape suivante pourrait être une longue saga fantasy.',
        'Tre classici d’avventura che vanno bene a 12 anni:\n\n- **Lo Hobbit** (J. R. R. Tolkien): un eroe riluttante, draghi e indovinelli.\n- **L’isola del tesoro** (R. L. Stevenson): pirati, mappe e un grande cattivo.\n- **Momo** (Michael Ende): una ragazza che sfida gli uomini grigi che rubano il tempo alle persone.\n\nSe le piacciono le serie, il passo successivo potrebbe essere una lunga saga fantasy.',
      ),
    }),
  },
  {
    match: /plant|pflanze|piante|pianta/i,
    reply: (lang) => ({
      title: L(
        lang,
        'Plants for a dark room',
        'Pflanzen für dunkle Räume',
        'Des plantes pour une pièce sombre',
        'Piante per una stanza buia',
      ),
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
        'Des plantes qui supportent peu de lumière :\n\n- **Zamioculcas (plante ZZ) :** presque indestructible, arrosage toutes les 2 à 3 semaines.\n- **Sansevieria :** feuilles droites, très tolérante.\n- **Pothos :** retombant, pousse même dans un coin ; à tenir hors de portée des animaux.\n- **Aspidistra :** surnommée « plante de fer », tout est dit.\n\nArrose moins dans une pièce sombre : les plantes y consomment beaucoup moins.',
        'Piante che si accontentano di poca luce:\n\n- **Zamioculcas:** quasi indistruttibile, annaffia ogni 2–3 settimane.\n- **Sansevieria:** foglie erette, molto tollerante.\n- **Pothos:** ricadente, cresce anche in un angolo; tienilo lontano dagli animali.\n- **Aspidistra:** detta «pianta di ferro», il nome dice tutto.\n\nAnnaffia meno in una stanza buia: lì le piante consumano molta meno acqua.',
      ),
    }),
  },
  {
    match: /e-?mail|\bletter\b|\bbrief\b|complain|beschwer|lettre|réclamation|lettera|reclamo/i,
    reply: (lang) => ({
      title: L(
        lang,
        'A polite complaint',
        'Höfliche Beschwerde',
        'Une réclamation polie',
        'Un reclamo cortese',
      ),
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
        '**Objet :** Commande 12345 : endommagée à la livraison\n\nMadame, Monsieur,\n\nLe 3 novembre, j’ai reçu ma commande 12345. Malheureusement, l’article était endommagé à son arrivée (photos jointes).\n\nPourriez-vous m’envoyer un article de remplacement ou me rembourser le prix d’achat ? Je vous serais reconnaissante d’une réponse sous 14 jours.\n\nCordialement,\nAnna Berg\n\nDis-moi ce qui s’est passé et je l’adapterai.',
        '**Oggetto:** Ordine 12345: danneggiato alla consegna\n\nGentili Signore e Signori,\n\nil 3 novembre ho ricevuto il mio ordine 12345. Purtroppo l’articolo è arrivato danneggiato (foto in allegato).\n\nPotreste inviarmi un articolo sostitutivo o rimborsarmi il prezzo d’acquisto? Vi sarei grata di una risposta entro 14 giorni.\n\nCordiali saluti,\nAnna Berg\n\nDimmi cosa è successo e lo adatto.',
      ),
    }),
  },
  {
    match: /^(hi|hello|hey|hallo|moin|servus|grüezi|bonjour|salut|coucou|ciao|buongiorno)\b/i,
    reply: (lang) => ({
      title: L(lang, 'Hello', 'Hallo', 'Bonjour', 'Ciao'),
      text: L(
        lang,
        'Hello! 👋 This is the Hemmia demo with the made-up Berg family. Ask me for a recipe, a picture, a plan for the weekend, or have a look at the Planner in the menu.',
        'Hallo! 👋 Das ist die Hemmia-Demo mit der erfundenen Familie Berg. Frag mich nach einem Rezept, einem Bild, einem Plan fürs Wochenende, oder schau dir im Menü den Planer an.',
        'Bonjour ! 👋 Voici la démo de Hemmia avec la famille Berg, inventée. Demande-moi une recette, une image, un programme pour le week-end, ou jette un œil au Planificateur dans le menu.',
        'Ciao! 👋 Questa è la demo di Hemmia con la famiglia Berg, inventata. Chiedimi una ricetta, un’immagine, un programma per il weekend, o dai un’occhiata all’Agenda nel menu.',
      ),
    }),
  },
];

function fallback(lang: Language, text: string): ScriptedReply {
  const words = text.trim().split(/\s+/).slice(0, 5).join(' ');
  return {
    title:
      words.length > 0
        ? words
        : L(lang, 'New chat', 'Neuer Chat', 'Nouvelle discussion', 'Nuova chat'),
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
      'C’est la démo, donc aucun modèle d’IA ne tourne ici : les réponses sont préparées à l’avance pour quelques questions seulement.\n\nSur ton propre hub, le modèle de ton ordinateur y répondrait maintenant, en privé et sans rien envoyer ailleurs.\n\nPour en voir plus dans la démo, essaie :\n- *Qu’est-ce que je peux cuisiner avec des œufs, des épinards et des pommes de terre ?*\n- *Dessine une cabane douillette dans une forêt enneigée*\n- *Explique les intérêts composés avec un exemple*\n- ou ouvre le **Planificateur** dans le menu.',
      'Questa è la demo, quindi qui non gira nessun modello di IA: le risposte sono preparate in anticipo solo per alcune domande.\n\nSul tuo hub, il modello del tuo computer risponderebbe adesso, in privato e senza inviare nulla altrove.\n\nPer vedere di più della demo, prova:\n- *Cosa posso cucinare con uova, spinaci e patate?*\n- *Disegna una baita accogliente in un bosco innevato*\n- *Spiega l’interesse composto con un esempio*\n- oppure apri l’**Agenda** nel menu.',
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
    const photo = input.photos > 0;
    const what = photo
      ? L(lang, 'photo', 'Foto', 'photo', 'foto')
      : L(lang, 'document', 'Dokument', 'document', 'documento');
    // French and Italian need the article with the right gender.
    const fr = photo ? 'ta photo' : 'ton document';
    const it = photo ? 'la tua foto' : 'il tuo documento';
    const frIt = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      title: L(lang, 'Your ' + what, 'Dein ' + what, frIt(fr), frIt(it)),
      text: L(
        lang,
        `Thanks! In the demo I can't really read your ${what}: answers are prepared in advance, and your ${what} stays on this phone.

On your own hub, a model that sees photos describes them, reads the text in them, or tells you what to cook with what's in your fridge (have a look at the chat *Dinner from the fridge*). Documents (PDF, Word, Excel) are read and summarised the same way.`,
        `Danke! In der Demo kann ich dein ${what} nicht wirklich lesen: Die Antworten sind vorbereitet, und dein ${what} bleibt auf diesem Telefon.

Auf deinem eigenen Hub beschreibt ein Modell, das Fotos sieht, deine Bilder, liest den Text darin oder sagt dir, was du aus deinem Kühlschrank kochen kannst (schau dir den Chat *Abendessen aus dem Kühlschrank* an). Dokumente (PDF, Word, Excel) werden genauso gelesen und zusammengefasst.`,
        `Merci ! Dans la démo, je ne peux pas vraiment lire ${fr} : les réponses sont préparées à l’avance, et ${fr} reste sur ce téléphone.

Sur ton propre hub, un modèle qui voit les photos les décrit, lit le texte qu’elles contiennent ou te dit quoi cuisiner avec ce qu’il y a dans ton frigo (regarde la discussion *Le dîner avec ce qu’il y a dans le frigo*). Les documents (PDF, Word, Excel) sont lus et résumés de la même façon.`,
        `Grazie! Nella demo non posso leggere davvero ${it}: le risposte sono preparate in anticipo, e ${it} resta su questo telefono.

Sul tuo hub, un modello che vede le foto le descrive, ne legge il testo o ti dice cosa cucinare con quello che c’è in frigo (guarda la chat *La cena con quello che c’è in frigo*). I documenti (PDF, Word, Excel) vengono letti e riassunti allo stesso modo.`,
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
  const t = (en: string, de: string, fr: string, it: string) => L(lang, en, de, fr, it);
  const todayPlans = planner.plans
    .filter((p) => p.date === today)
    .map((p) => `- ${p.time ? `**${p.time}** ` : ''}${p.text}`);
  const tasks = planner.tasks.filter((x) => x.date === today);
  const open = tasks.filter((x) => x.status === 'open').map((x) => `- ${x.text}`);
  const done = tasks.filter((x) => x.status === 'done').map((x) => `- ✓ ${x.text}`);
  const goals = planner.goals.filter((g) => g.status !== 'dropped');
  const goalsDone = goals.filter((g) => g.status === 'done').length;
  const openGoals = goals.filter((g) => g.status === 'open').map((g) => `- ${g.text}`);
  const none = t('- nothing', '- nichts', '- rien', '- niente');

  if (kind === 'week') {
    return t(
      `Let's plan your week. **Your goals** (${String(goalsDone)} of ${String(goals.length)} done):

${openGoals.join('\n') || none}

What matters most this week? I'd put the presentation on Tuesday or Wednesday morning, when you have no appointments, and the holiday booking on Thursday evening. Shall I add those as tasks?`,
      `Lass uns deine Woche planen. **Deine Ziele** (${String(goalsDone)} von ${String(goals.length)} erledigt):

${openGoals.join('\n') || none}

Was ist diese Woche am wichtigsten? Die Präsentation würde ich auf Dienstag- oder Mittwochvormittag legen, wenn du keine Termine hast, und die Urlaubsbuchung auf Donnerstagabend. Soll ich das als Aufgaben eintragen?`,
      `Planifions ta semaine. **Tes objectifs** (${String(goalsDone)} sur ${String(goals.length)} faits) :

${openGoals.join('\n') || none}

Qu’est-ce qui compte le plus cette semaine ? Je mettrais la présentation mardi ou mercredi matin, quand tu n’as pas de rendez-vous, et la réservation des vacances jeudi soir. Je les ajoute comme tâches ?`,
      `Pianifichiamo la tua settimana. **I tuoi obiettivi** (${String(goalsDone)} di ${String(goals.length)} fatti):

${openGoals.join('\n') || none}

Cosa conta di più questa settimana? Metterei la presentazione martedì o mercoledì mattina, quando non hai appuntamenti, e la prenotazione delle vacanze giovedì sera. Le aggiungo come attività?`,
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
      `Bonsoir ! Voici ta journée :

**Fait**
${done.join('\n') || none}

**Encore ouvert**
${open.join('\n') || none}

Quelque chose à reporter à demain ? Et comment s’est passé le cours de natation de Mila ?`,
      `Buonasera! Ecco la tua giornata:

**Fatto**
${done.join('\n') || none}

**Ancora aperto**
${open.join('\n') || none}

C’è qualcosa da spostare a domani? E com’è andata la lezione di nuoto di Mila?`,
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
    `Bonjour, Anna ! ☀️ Fribourg-en-Brisgau : sec et doux aujourd’hui, autour de 14 °C (dans la démo, la météo est inventée).

**Aujourd’hui**
${todayPlans.join('\n') || none}

**À faire**
${open.join('\n') || none}

**Cette semaine :** ${String(goalsDone)} objectifs atteints sur ${String(goals.length)}. Un bon moment pour le brouillon de la présentation, c’est avant le déjeuner : il sera bouclé avant la natation.`,
    `Buongiorno, Anna! ☀️ Friburgo in Brisgovia: oggi asciutto e mite, intorno ai 14 °C (nella demo il meteo è inventato).

**Oggi**
${todayPlans.join('\n') || none}

**Da fare**
${open.join('\n') || none}

**Questa settimana:** ${String(goalsDone)} obiettivi raggiunti su ${String(goals.length)}. Un buon momento per la bozza della presentazione è prima di pranzo, così è fatta prima del nuoto.`,
  );
}
