import { describe, expect, it } from 'vitest';
import { SUGGESTIONS } from '../chat/suggestions.ts';
import { seedChats } from './data.ts';
import { scriptedReply } from './replies.ts';

describe('demo in French and Italian', () => {
  it('seeds the made-up family in each language', () => {
    expect(seedChats('fr')[0]?.title).toBe('Le dîner avec ce qu’il y a dans le frigo');
    expect(seedChats('it')[0]?.title).toBe('La cena con quello che c’è in frigo');
  });

  it('answers the start-screen suggestions it has replies for in the same language', () => {
    const fr = scriptedReply({
      text: SUGGESTIONS.fr[11] ?? '',
      photos: 0,
      documents: 0,
      lang: 'fr',
    });
    expect(fr.text).toContain('Tortilla');
    const it = scriptedReply({
      text: SUGGESTIONS.it[9] ?? '',
      photos: 0,
      documents: 0,
      lang: 'it',
    });
    expect(it.text).toContain('interesse');
  });

  it('says it cannot read a photo, with the right article', () => {
    expect(scriptedReply({ text: '', photos: 1, documents: 0, lang: 'fr' }).title).toBe('Ta photo');
    expect(scriptedReply({ text: '', photos: 0, documents: 1, lang: 'it' }).title).toBe(
      'Il tuo documento',
    );
  });
});
