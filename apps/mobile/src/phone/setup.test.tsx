import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupKey } from './SetupKey.tsx';
import { SetupProvider } from './SetupProvider.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('SetupProvider', () => {
  it('chooses a provider, goes back and opens the key guide', () => {
    const onChoose = vi.fn();
    const onBack = vi.fn();
    const onOpenUrl = vi.fn();
    render(
      <SetupProvider onChoose={onChoose} onBack={onBack} onOpenUrl={onOpenUrl} language="en" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Claude models/ }));
    fireEvent.click(screen.getByRole('button', { name: /GPT models/ }));
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    fireEvent.click(screen.getByRole('button', { name: 'What is an API key?' }));
    expect(onChoose.mock.calls).toEqual([['anthropic'], ['openai']]);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onOpenUrl).toHaveBeenCalledWith('https://hemmia.app/guides/api-keys/');
  });
});

function renderKey(
  checkKey: (key: string) => Promise<'ok' | 'refused' | 'offline' | 'busy'>,
  provider: 'anthropic' | 'openai' = 'anthropic',
  agree = true,
) {
  const onSaved = vi.fn();
  const onOpenUrl = vi.fn();
  render(
    <SetupKey
      provider={provider}
      checkKey={checkKey}
      onSaved={onSaved}
      onOpenUrl={onOpenUrl}
      onBack={() => undefined}
      language="en"
    />,
  );
  const input = screen.getByLabelText<HTMLInputElement>('API key');
  const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Check and save' });
  const consent = screen.getByRole<HTMLInputElement>('checkbox', {
    name: /sent to (Anthropic|OpenAI)/,
  });
  if (agree) fireEvent.click(consent);
  return { onSaved, onOpenUrl, input, save, consent };
}

describe('SetupKey', () => {
  it('enables saving only with a key and explicit permission, and masks the key until Show', () => {
    const { input, save, consent } = renderKey(() => Promise.resolve('ok'), 'anthropic', false);
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'sk-x' } });
    expect(save.disabled).toBe(true);
    expect(consent.checked).toBe(false);
    fireEvent.click(consent);
    expect(save.disabled).toBe(false);
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.type).toBe('text');
  });

  it('checks the trimmed key and saves on ok', async () => {
    const check = vi.fn(() => Promise.resolve('ok' as const));
    const { input, save, onSaved } = renderKey(check);
    fireEvent.change(input, { target: { value: '  sk-ant-123 ' } });
    fireEvent.click(save);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(check).toHaveBeenCalledWith('sk-ant-123');
  });

  it.each([
    ['refused', 'This key was refused. Check that you copied all of it.'],
    ['offline', 'No internet. Check your connection and try again.'],
    ['busy', 'The provider is busy, try again.'],
  ] as const)('explains %s', async (result, text) => {
    const { input, save, onSaved } = renderKey(() => Promise.resolve(result));
    fireEvent.change(input, { target: { value: 'sk-x' } });
    fireEvent.click(save);
    expect((await screen.findByRole('alert')).textContent).toBe(text);
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'sk-y' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats a failed check as offline', async () => {
    const { input, save } = renderKey(() => Promise.reject(new Error('x')));
    fireEvent.change(input, { target: { value: 'sk-x' } });
    fireEvent.click(save);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No internet. Check your connection and try again.',
    );
  });

  it.each([
    ['anthropic', /Get a key from Anthropic/, 'https://platform.claude.com/settings/keys'],
    ['openai', /Get a key from OpenAI/, 'https://platform.openai.com/api-keys'],
  ] as const)('opens the %s key page', (provider, name, url) => {
    const { onOpenUrl } = renderKey(() => Promise.resolve('ok'), provider);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onOpenUrl).toHaveBeenCalledWith(url);
  });

  it('pastes from the clipboard when it can', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: () => Promise.resolve(' sk-pasted ') },
      configurable: true,
    });
    const { input } = renderKey(() => Promise.resolve('ok'));
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    await waitFor(() => {
      expect(input.value).toBe('sk-pasted');
    });
  });

  it('hides Paste without clipboard access', () => {
    renderKey(() => Promise.resolve('ok'));
    expect(screen.queryByRole('button', { name: 'Paste' })).toBeNull();
  });
});
