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
