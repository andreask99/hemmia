import { describe, expect, it } from 'vitest';
import { pickSuggestions, SUGGESTIONS } from './suggestions.ts';

describe('pickSuggestions', () => {
  it('picks three different suggestions from the pool', () => {
    for (let n = 0; n < 50; n++) {
      const picked = pickSuggestions('de');
      expect(new Set(picked).size).toBe(3);
      for (const s of picked) expect(SUGGESTIONS.de).toContain(s);
    }
  });

  it('varies between calls', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 30; n++) for (const s of pickSuggestions('en')) seen.add(s);
    expect(seen.size).toBeGreaterThan(10);
  });

  it('has the same number of ideas in both languages', () => {
    expect(SUGGESTIONS.en.length).toBe(SUGGESTIONS.de.length);
    expect(SUGGESTIONS.en.length).toBeGreaterThanOrEqual(20);
  });
});
