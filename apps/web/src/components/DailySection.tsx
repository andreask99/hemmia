import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type DailySettings, Nearby, Town, ZODIAC_SIGNS, ZodiacSign } from '@hemmia/shared';
import { useDaily, useSaveDaily } from '../daily/hooks.ts';
import { type MessageKey, useI18n } from '../i18n/index.tsx';

const field =
  'min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none';
const label = 'mb-1.5 block text-sm font-medium text-muted';
const subheading = 'text-[15px] font-semibold';
/** Monday first; values are Date.getDay() numbers. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Planner settings: notifications (morning, weekly planning, evening) and snapshot parts. */
export function DailySection() {
  const { data } = useDaily();
  // Keyed form: starts from the saved settings, then keeps its own state while editing.
  return data ? <DailyForm initial={data} /> : null;
}

function DailyForm({ initial }: { initial: DailySettings }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const save = useSaveDaily();
  const [settings, setSettings] = useState(initial);
  const [town, setTown] = useState(initial.town ?? '');
  const [townInvalid, setTownInvalid] = useState(false);
  const [nearby, setNearby] = useState(initial.nearby.join(', '));
  const [nearbyInvalid, setNearbyInvalid] = useState(false);
  // 4 January 2026 was a Sunday: day n of the week is the 4th + n.
  const weekdayName = (day: number) =>
    new Date(2026, 0, 4 + day).toLocaleDateString(language, { weekday: 'long' });

  /** Every change saves at once. */
  const change = (next: Partial<DailySettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    save.mutate(merged);
  };

  const time = (id: string, value: string, onChange: (v: string) => void) => (
    <input
      id={id}
      type="time"
      step={300}
      value={value}
      onChange={(e) => {
        if (/^\d\d:\d\d$/.test(e.target.value)) onChange(e.target.value);
      }}
      className={field}
    />
  );
  /** The town saves when the field is left, not on every keystroke. */
  const saveTown = () => {
    const parsed = town.trim() === '' ? null : Town.safeParse(town);
    if (parsed && !parsed.success) {
      setTownInvalid(true);
      return;
    }
    setTownInvalid(false);
    const next = parsed ? parsed.data : null;
    setTown(next ?? '');
    if (next !== settings.town) change({ town: next });
  };

  /** Towns nearby: comma-separated, saved when the field is left. */
  const saveNearby = () => {
    const parsed = Nearby.safeParse(
      nearby
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n !== ''),
    );
    if (!parsed.success) {
      setNearbyInvalid(true);
      return;
    }
    setNearbyInvalid(false);
    setNearby(parsed.data.join(', '));
    if (parsed.data.join('\n') !== settings.nearby.join('\n')) change({ nearby: parsed.data });
  };

  const checkbox = (key: 'goals' | 'plans' | 'horoscope' | 'evening', text: string) => (
    <label className="flex min-h-11 items-center gap-3 text-[15px]">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => {
          change({ [key]: e.target.checked });
        }}
        className="h-5 w-5 shrink-0 accent-[var(--forest)]"
      />
      {text}
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('daily.hint')}</p>
      <button
        type="button"
        onClick={() => {
          void navigate('/planner');
        }}
        className="min-h-11 self-start rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-champagne"
      >
        {t('planner.card')}
      </button>

      <label className="flex min-h-11 items-center justify-between gap-4 text-[15px]">
        {t('daily.enabled')}
        <input
          type="checkbox"
          role="switch"
          aria-label={t('daily.enabled')}
          checked={settings.enabled}
          onChange={(e) => {
            change({ enabled: e.target.checked });
          }}
          className="h-6 w-6 shrink-0 accent-[var(--forest)]"
        />
      </label>

      {settings.enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="daily-time" className={label}>
                {t('daily.morning')}
              </label>
              {time('daily-time', settings.time, (v) => {
                change({ time: v });
              })}
            </div>
          </div>

          <h3 className={subheading}>{t('daily.weekPlanning')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="week-day" className={label}>
                {t('daily.weekDay')}
              </label>
              <select
                id="week-day"
                value={settings.weekDay}
                onChange={(e) => {
                  change({ weekDay: Number(e.target.value) });
                }}
                className={field}
              >
                {WEEK_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {weekdayName(d)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="week-time" className={label}>
                {t('daily.time')}
              </label>
              {time('week-time', settings.weekTime, (v) => {
                change({ weekTime: v });
              })}
            </div>
          </div>

          <div>
            {checkbox('evening', t('daily.evening'))}
            <p className="ml-8 text-sm text-muted">{t('daily.eveningHint')}</p>
          </div>
          {settings.evening && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="evening-time" className={label}>
                  {t('daily.time')}
                </label>
                {time('evening-time', settings.eveningTime, (v) => {
                  change({ eveningTime: v });
                })}
              </div>
            </div>
          )}

          <h3 className={subheading}>{t('daily.parts')}</h3>
          <div>
            {checkbox('goals', t('daily.goals'))}
            {checkbox('plans', t('daily.plans'))}
            {checkbox('horoscope', t('daily.horoscope'))}
          </div>
          {settings.horoscope && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="daily-sign" className={label}>
                  {t('daily.sign')}
                </label>
                <select
                  id="daily-sign"
                  value={settings.sign ?? ''}
                  onChange={(e) => {
                    const sign = ZodiacSign.safeParse(e.target.value);
                    change({ sign: sign.success ? sign.data : null });
                  }}
                  className={field}
                >
                  <option value="">{t('daily.signNone')}</option>
                  {ZODIAC_SIGNS.map((sign) => (
                    <option key={sign} value={sign}>
                      {t(`sign.${sign}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="daily-town" className={label}>
              {t('daily.town')}
            </label>
            <input
              id="daily-town"
              type="text"
              autoComplete="address-level2"
              maxLength={60}
              value={town}
              onChange={(e) => {
                setTown(e.target.value);
              }}
              onBlur={saveTown}
              aria-invalid={townInvalid}
              aria-describedby="daily-town-hint"
              className={`${field} sm:max-w-sm`}
            />
            <p
              id="daily-town-hint"
              className={`mt-1.5 text-sm ${townInvalid ? 'text-danger' : 'text-muted'}`}
            >
              {t(townInvalid ? 'daily.townInvalid' : 'daily.townHint')}
            </p>
          </div>
          <div>
            <label htmlFor="daily-nearby" className={label}>
              {t('daily.nearby')}
            </label>
            <input
              id="daily-nearby"
              type="text"
              maxLength={200}
              value={nearby}
              onChange={(e) => {
                setNearby(e.target.value);
              }}
              onBlur={saveNearby}
              aria-invalid={nearbyInvalid}
              aria-describedby="daily-nearby-hint"
              className={`${field} sm:max-w-sm`}
            />
            <p
              id="daily-nearby-hint"
              className={`mt-1.5 text-sm ${nearbyInvalid ? 'text-danger' : 'text-muted'}`}
            >
              {t(nearbyInvalid ? 'daily.nearbyInvalid' : 'daily.nearbyHint')}
            </p>
          </div>
        </>
      )}

      {save.isSuccess && (
        <p role="status" className="text-sm text-ok">
          {t('daily.saved')}
        </p>
      )}
    </div>
  );
}
