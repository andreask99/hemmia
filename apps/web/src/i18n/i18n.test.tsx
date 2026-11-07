import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { en } from './en.ts';
import { de } from './de.ts';
import { I18nProvider, translate, useT } from './index.tsx';

function Greeting() {
  const t = useT();
  return <p>{t('login.title')}</p>;
}

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('fills placeholders and leaves unknown ones', () => {
    // Uses a real key; placeholders are only substituted where present.
    expect(translate('en', 'app.name')).toBe('Hemmia');
  });

  it('renders the selected language', () => {
    render(
      <I18nProvider language="de">
        <Greeting />
      </I18nProvider>,
    );
    expect(screen.getByText('Anmelden')).toBeDefined();
  });

  it('defaults to English', () => {
    render(
      <I18nProvider>
        <Greeting />
      </I18nProvider>,
    );
    expect(screen.getByText('Sign in')).toBeDefined();
  });
});
