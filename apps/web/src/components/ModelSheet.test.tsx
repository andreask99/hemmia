import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatModelInfo } from '@hemmia/shared';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../i18n/index.tsx';
import { ModelChip, ModelSheet } from './ModelSheet.tsx';

const model = (id: string, extra: Partial<ChatModelInfo> = {}): ChatModelInfo => ({
  id,
  label: { en: id, de: id },
  description: null,
  engineModel: `${id}:1b`,
  details: null,
  vision: true,
  thinking: true,
  maxMessageChars: 65_000,
  cloud: false,
  provider: null,
  ...extra,
});
const MODELS = [
  model('Gemma'),
  model('Claude', { cloud: true, provider: 'anthropic' }),
  model('GPT', { cloud: true, provider: 'openai' }),
];

function sheet(value: string, hasHistory: boolean) {
  const onSelect = vi.fn();
  render(
    <I18nProvider language="en">
      <ModelSheet
        models={MODELS}
        value={value}
        think={false}
        hasHistory={hasHistory}
        onSelect={onSelect}
        onThink={() => undefined}
        onClose={() => undefined}
      />
    </I18nProvider>,
  );
  return onSelect;
}

describe('ModelSheet with cloud models', () => {
  it('groups models on this Mac and in the cloud, with the provider on each cloud model', () => {
    sheet('Gemma', false);
    expect(screen.getByText('On this Mac')).toBeDefined();
    expect(screen.getByText(/Cloud \(your own key\)/)).toBeDefined();
    expect(screen.getByRole('radio', { name: /Claude/ }).textContent).toContain('Anthropic');
    expect(screen.getByRole('radio', { name: /GPT/ }).textContent).toContain('OpenAI');
    expect(screen.getByRole('radio', { name: /Gemma/ }).textContent).not.toContain('☁');
  });

  it('asks before sending a chat with history to the cloud', () => {
    const onSelect = sheet('Gemma', true);
    fireEvent.click(screen.getByRole('radio', { name: /Claude/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Send this chat to Anthropic?' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Stay on this Mac' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /Claude/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Claude' }));
    expect(onSelect).toHaveBeenCalledWith('Claude');
  });

  it("doesn't ask in a chat without messages", () => {
    const fresh = sheet('Gemma', false);
    fireEvent.click(screen.getByRole('radio', { name: /Claude/ }));
    expect(fresh).toHaveBeenCalledWith('Claude');
  });

  it('switches between cloud models and back to the Mac without asking', () => {
    const onSelect = sheet('Claude', true);
    fireEvent.click(screen.getByRole('radio', { name: /GPT/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Gemma/ }));
    expect(onSelect.mock.calls).toEqual([['GPT'], ['Gemma']]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows no group headings without cloud models', () => {
    render(
      <I18nProvider language="en">
        <ModelSheet
          models={[model('Gemma')]}
          value="Gemma"
          think={false}
          onSelect={() => undefined}
          onThink={() => undefined}
          onClose={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText('On this Mac')).toBeNull();
  });
});

describe('ModelSheet link to adding a key', () => {
  const show = (models: ChatModelInfo[], cloudAllowed: boolean) =>
    render(
      <MemoryRouter>
        <I18nProvider language="en">
          <ModelSheet
            models={models}
            value="Gemma"
            think={false}
            cloudAllowed={cloudAllowed}
            onSelect={() => undefined}
            onThink={() => undefined}
            onClose={() => undefined}
          />
        </I18nProvider>
      </MemoryRouter>,
    );

  it('points to Settings → Models when cloud is allowed but no key is added yet', () => {
    show([model('Gemma')], true);
    const link = screen.getByRole('link', { name: /Add Claude or GPT/ });
    expect(link.getAttribute('href')).toBe('/settings?tab=models');
  });

  it('shows no link when cloud is off for the account', () => {
    show([model('Gemma')], false);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows no link once cloud models are there', () => {
    show(MODELS, true);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ModelChip', () => {
  it('marks a cloud model with its provider', () => {
    render(
      <I18nProvider language="de">
        <ModelChip model={MODELS[1]} think={false} onClick={() => undefined} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole('img', { name: 'Cloud-Modell: dieser Chat geht an Anthropic' }),
    ).toBeDefined();
  });
});
