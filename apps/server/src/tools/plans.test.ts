import { describe, expect, it } from 'vitest';
import type { Goal } from '@hemmia/shared';
import { matchGoal, progressLine } from './plans.ts';

const goal = (id: string, text: string, week = '2026-10-05'): Goal => ({
  id,
  week,
  area: 'home',
  text,
  status: 'open',
  day: null,
  doneOn: null,
});
const cellar = goal('a1b2c3d4-0000', 'Keller ausgemistet/ausgeräumt');
const talk = goal('e5f6a7b8-0000', 'Präsentation an den Kunden verschickt');

describe('matchGoal', () => {
  it('finds goals by short id, text, part of the text or shared words', () => {
    expect(matchGoal([cellar, talk], 'e5f6a7b8')).toBe(talk);
    expect(matchGoal([cellar, talk], 'Präsentation an den Kunden (id e5f6a7b8, planned)')).toBe(
      talk,
    );
    expect(matchGoal([cellar, talk], 'keller')).toBe(cellar);
    expect(matchGoal([cellar, talk], 'Der Keller')).toBe(cellar);
    expect(matchGoal([cellar, talk], 'die Präsentation für den Kunden')).toBe(talk);
  });

  it('asks for the id when several goals match, and says when none does', () => {
    const second = goal('c0ffee00-0000', 'Keller streichen');
    expect(matchGoal([cellar, second], 'Keller')).toContain('Several match');
    expect(matchGoal([cellar, talk], 'Steuern')).toContain('No goal matches');
  });

  it('prefers the week listed first', () => {
    const lastWeek = goal('00000000-1111', 'Keller ausgemistet/ausgeräumt', '2026-09-28');
    expect(matchGoal([cellar, lastWeek], 'Keller')).toBe(cellar);
  });
});

describe('progressLine', () => {
  it('counts done goals, not dropped ones, in the app language', () => {
    const goals = [
      { ...cellar, status: 'done' as const },
      talk,
      { ...talk, status: 'dropped' as const },
    ];
    expect(progressLine(goals)).toBe('1 of 2 done ▓░');
    expect(progressLine(goals, 'de')).toBe('1 von 2 erledigt ▓░');
  });
});
