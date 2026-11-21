/**
 * Start-screen suggestions: a pool per language, three picked at random each time the
 * empty chat opens, so the start screen doesn't always show the same ideas.
 */
import type { Language } from '@hemmia/shared';

export const SUGGESTIONS: Record<Language, readonly string[]> = {
  en: [
    'Plan a cheap and healthy week of dinners',
    'Explain how vaccines work, simply',
    'Draw a cosy cabin in a snowy forest',
    'Help me write a polite complaint email',
    'What’s the weather this weekend?',
    'Give me a 15-minute workout without equipment',
    'Ideas for a rainy Sunday with kids',
    'Summarise the main points of a PDF I upload',
    'Turn my photo into a watercolour painting',
    'Explain compound interest with an example',
    'Write a birthday poem for my mum',
    'What can I cook with eggs, spinach and potatoes?',
    'Help me prepare for a job interview',
    'Plan a weekend trip to Lake Constance',
    'Quiz me on European capitals',
    'Explain this error message: TypeError: undefined is not a function',
    'Suggest a book for a 12-year-old who loves adventure',
    'How do I get rid of mould in the bathroom?',
    'Make a packing list for a camping trip',
    'Draw a birthday card with “Happy Birthday, Lena!”',
    'What are good indoor plants for a dark room?',
    'Help me understand my electricity bill',
    'Translate this into Spanish: Where is the nearest pharmacy?',
    'Give me three ideas for a family game night',
  ],
  de: [
    'Plane eine günstige und gesunde Woche Abendessen',
    'Erklär einfach, wie Impfungen funktionieren',
    'Mal eine gemütliche Hütte im verschneiten Wald',
    'Hilf mir, eine höfliche Beschwerde-Mail zu schreiben',
    'Wie wird das Wetter am Wochenende?',
    'Gib mir ein 15-Minuten-Training ohne Geräte',
    'Ideen für einen verregneten Sonntag mit Kindern',
    'Fass die wichtigsten Punkte eines PDFs zusammen, das ich hochlade',
    'Mach aus meinem Foto ein Aquarell',
    'Erklär den Zinseszins an einem Beispiel',
    'Schreib ein Geburtstagsgedicht für meine Mama',
    'Was kann ich mit Eiern, Spinat und Kartoffeln kochen?',
    'Hilf mir, mich auf ein Vorstellungsgespräch vorzubereiten',
    'Plane einen Wochenendausflug an den Bodensee',
    'Frag mich europäische Hauptstädte ab',
    'Erklär diese Fehlermeldung: TypeError: undefined is not a function',
    'Empfiehl ein Buch für eine Zwölfjährige, die Abenteuer liebt',
    'Wie werde ich Schimmel im Bad los?',
    'Erstelle eine Packliste fürs Zelten',
    'Mal eine Geburtstagskarte mit „Alles Gute, Lena!“',
    'Welche Zimmerpflanzen eignen sich für einen dunklen Raum?',
    'Hilf mir, meine Stromrechnung zu verstehen',
    'Übersetze ins Spanische: Wo ist die nächste Apotheke?',
    'Gib mir drei Ideen für einen Spieleabend mit der Familie',
  ],
  fr: [
    'Planifie une semaine de dîners bon marché et sains',
    'Explique simplement comment fonctionnent les vaccins',
    'Dessine une cabane douillette dans une forêt enneigée',
    'Aide-moi à écrire un e-mail de réclamation poli',
    'Quel temps fera-t-il ce week-end ?',
    'Donne-moi un entraînement de 15 minutes sans matériel',
    'Des idées pour un dimanche pluvieux avec des enfants',
    'Résume les points principaux d’un PDF que j’envoie',
    'Transforme ma photo en aquarelle',
    'Explique les intérêts composés avec un exemple',
    'Écris un poème d’anniversaire pour ma maman',
    'Que puis-je cuisiner avec des œufs, des épinards et des pommes de terre ?',
    'Aide-moi à préparer un entretien d’embauche',
    'Planifie une escapade d’un week-end au bord du Léman',
    'Interroge-moi sur les capitales européennes',
    'Explique ce message d’erreur : TypeError: undefined is not a function',
    'Propose un livre pour une fille de 12 ans qui aime l’aventure',
    'Comment me débarrasser de la moisissure dans la salle de bain ?',
    'Fais une liste de choses à emporter pour du camping',
    'Dessine une carte d’anniversaire avec « Joyeux anniversaire, Lena ! »',
    'Quelles plantes d’intérieur pour une pièce sombre ?',
    'Aide-moi à comprendre ma facture d’électricité',
    'Traduis en espagnol : Où est la pharmacie la plus proche ?',
    'Donne-moi trois idées pour une soirée jeux en famille',
  ],
  it: [
    'Pianifica una settimana di cene economiche e sane',
    'Spiega in modo semplice come funzionano i vaccini',
    'Disegna una baita accogliente in un bosco innevato',
    'Aiutami a scrivere un’e-mail di reclamo cortese',
    'Che tempo farà questo fine settimana?',
    'Dammi un allenamento di 15 minuti senza attrezzi',
    'Idee per una domenica piovosa con i bambini',
    'Riassumi i punti principali di un PDF che carico',
    'Trasforma la mia foto in un acquerello',
    'Spiega l’interesse composto con un esempio',
    'Scrivi una poesia di compleanno per la mia mamma',
    'Cosa posso cucinare con uova, spinaci e patate?',
    'Aiutami a prepararmi per un colloquio di lavoro',
    'Pianifica una gita di un fine settimana sul Lago Maggiore',
    'Interrogami sulle capitali europee',
    'Spiega questo messaggio di errore: TypeError: undefined is not a function',
    'Consiglia un libro per una dodicenne che ama l’avventura',
    'Come elimino la muffa in bagno?',
    'Fai una lista delle cose da portare in campeggio',
    'Disegna un biglietto d’auguri con «Buon compleanno, Lena!»',
    'Quali piante da interno vanno bene per una stanza buia?',
    'Aiutami a capire la mia bolletta della luce',
    'Traduci in spagnolo: Dov’è la farmacia più vicina?',
    'Dammi tre idee per una serata giochi in famiglia',
  ],
};

/**
 * `count` different positions in the pool, in random order. Positions rather than texts,
 * so a language switch shows the same ideas translated (both pools are parallel).
 */
export function pickSuggestionIndexes(count = 3, random: () => number = Math.random): number[] {
  const pool = SUGGESTIONS.en.map((_, i) => i);
  // Partial Fisher–Yates shuffle: the first `count` entries are a uniform random pick.
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
  }
  return pool.slice(0, count);
}

/** `count` different suggestions in random order. */
export function pickSuggestions(language: Language, count = 3, random?: () => number): string[] {
  return pickSuggestionIndexes(count, random).map((i) => SUGGESTIONS[language][i] ?? '');
}
