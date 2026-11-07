import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneSettings, type PhoneSettingsProps } from './PhoneSettings.tsx';

afterEach(cleanup);

function setup(over: Partial<PhoneSettingsProps> = {}) {
  const props: PhoneSettingsProps = {
    keys: { anthropic: 'sk-…Q7fA', openai: null },
    onSetKey: vi.fn(),
    onRemoveKey: vi.fn(),
    aboutMe: 'I live in Hamburg.',
    onSaveAboutMe: vi.fn(),
    phoneLanguage: 'en',
    onLanguage: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onMoveToHub: vi.fn(),
    onPrivacy: vi.fn(),
    onDeleteEverything: vi.fn(),
    onBack: vi.fn(),
    language: 'en',
    ...over,
  };
  render(<PhoneSettings {...props} />);
  return props;
}

describe('PhoneSettings', () => {
  it('shows keys masked with the right actions', () => {
    const p = setup();
    expect(screen.getByText('sk-…Q7fA')).toBeDefined();
    expect(screen.getByText('No key yet')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Anthropic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Anthropic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add key OpenAI' }));
    expect(p.onSetKey).toHaveBeenNthCalledWith(1, 'anthropic');
    expect(p.onRemoveKey).toHaveBeenCalledWith('anthropic');
    expect(p.onSetKey).toHaveBeenNthCalledWith(2, 'openai');
  });

  it('saves About me only when changed, trimmed', () => {
    const p = setup();
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('About me'), { target: { value: ' I live in Lund. ' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(p.onSaveAboutMe).toHaveBeenCalledWith('I live in Lund.');
  });

  it('changes the language, exports, imports a file, moves and opens privacy', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'de' } });
    expect(p.onLanguage).toHaveBeenCalledWith('de');
    fireEvent.click(screen.getByRole('button', { name: /Export chats/ }));
    const file = new File(['{}'], 'Hemmia-chats.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import chats'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Hemmia at home' }));
    fireEvent.click(screen.getByRole('button', { name: 'How your data is handled' }));
    expect(p.onExport).toHaveBeenCalledTimes(1);
    expect(p.onImport).toHaveBeenCalledWith(file);
    expect(p.onMoveToHub).toHaveBeenCalledTimes(1);
    expect(p.onPrivacy).toHaveBeenCalledTimes(1);
  });

  it('deletes everything only after a second, explicit tap', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything on this phone' }));
    expect(p.onDeleteEverything).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'This deletes your chats, photos and keys',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything on this phone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(p.onDeleteEverything).toHaveBeenCalledTimes(1);
  });
});
