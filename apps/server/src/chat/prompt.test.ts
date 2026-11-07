import { describe, expect, it } from 'vitest';
import type { DailySettings, DayTask, Goal } from '@hemmia/shared';
import { dailyPrompt, eveningPrompt, systemPrompt } from './prompt.ts';

const settings: DailySettings = {
  enabled: true,
  time: '07:30',
  sign: null,
  horoscope: false,
  plans: true,
  goals: true,
  weekDay: 1,
  weekTime: '07:30',
  evening: true,
  eveningTime: '20:00',
  town: 'Kiel',
  nearby: [],
};
const goals: Goal[] = [
  {
    id: 'g1',
    week: '2026-10-05',
    area: 'work',
    text: 'Angebot verschickt',
    status: 'open',
    day: null,
    doneOn: null,
  },
  {
    id: 'g2',
    week: '2026-10-05',
    area: 'home',
    text: 'Keller entrümpelt',
    status: 'open',
    day: null,
    doneOn: null,
  },
];
const morning = (
  weekend: boolean,
  canSearch: boolean,
  town: string | null = 'Kiel',
  nearby: string[] = [],
) =>
  dailyPrompt({
    settings: { ...settings, town, nearby },
    plans: [],
    goals,
    tasks: [],
    leftovers: [],
    days: { won: 0, days: 0 },
    today: '2026-10-10',
    restricted: false,
    language: 'de',
    weekend,
    canSearch,
  });
const evening = (weekday: number, tasks: DayTask[] = []) =>
  eveningPrompt({
    goals,
    tasks,
    tomorrowTasks: [],
    tomorrowPlans: [],
    plans: [],
    today: '2026-10-10',
    weekday,
    language: 'de',
  });

describe('planner prompts on the weekend', () => {
  it('proposes a must win on weekdays', () => {
    const p = morning(false, true);
    expect(p).toContain('propose the day plan');
    expect(p).toContain('Angebot verschickt');
    expect(p).not.toContain('weekend');
  });

  it('leaves work out of the weekend snapshot, mentions home goals lightly', () => {
    const p = morning(true, true);
    expect(p).toContain('It is the weekend: time off.');
    expect(p).not.toContain('Angebot verschickt');
    expect(p).toContain('Keller entrümpelt');
    expect(p).not.toContain('propose the day plan');
    expect(p).toContain('weather forecast in "Kiel"');
    expect(p).toContain('events in "Kiel" this weekend');
  });

  it('also searches events in the towns nearby', () => {
    expect(morning(true, true)).not.toContain('towns nearby');
    const p = morning(true, true, 'Hünenberg', ['Zug', 'Zürich']);
    expect(p).toContain('weather forecast in "Hünenberg"');
    expect(p).toContain('one search each for events this weekend in "Zug", "Zürich"');
  });

  it('asks for a place without a town, and claims no weather without search', () => {
    expect(morning(true, true, null)).toContain('no home town is set');
    const off = morning(true, false);
    expect(off).not.toContain('web_search');
    expect(off).toContain('do not claim to know them');
  });

  it('asks for tomorrow’s must win only from Monday to Thursday', () => {
    expect(evening(3)).toContain("Ask for tomorrow's ⭐ must win");
    expect(evening(5)).toContain('Tomorrow is the weekend: do not plan it.');
    expect(evening(6)).toContain('how their day off was');
    expect(evening(6)).not.toContain('Angebot verschickt');
    const sunday = evening(0);
    expect(sunday).toContain("Monday's plan comes with tomorrow's morning snapshot");
    expect(sunday).not.toContain("Ask for tomorrow's ⭐ must win");
  });

  it('tells every planner chat on the weekend not to bring up work', () => {
    const base = { language: 'de' as const, restricted: false, canPlan: true, canSearch: true };
    const saturday = systemPrompt({
      ...base,
      now: new Date(2026, 9, 10, 9),
      planningChat: 'day',
      town: 'Kiel',
    });
    expect(saturday).toContain('do not bring up work');
    expect(saturday).toContain('weather and events in "Kiel"');
    expect(saturday).not.toContain('when the user agrees to the day plan you proposed');
    const monday = systemPrompt({ ...base, now: new Date(2026, 9, 12, 9), planningChat: 'day' });
    expect(monday).not.toContain('do not bring up work');
    expect(monday).toContain('when the user agrees to the day plan you proposed');
  });
});
