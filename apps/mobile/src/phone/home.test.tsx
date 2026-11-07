import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneHome } from './PhoneHome.tsx';
import type { ChatEntry } from './store.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chats: ChatEntry[] = [
  {
    id: 'chat1',
    title: 'Trip to Sweden',
    model: 'claude-sonnet',
    updatedAt: Date.UTC(2026, 9, 20),
  },
  { id: 'chat2', title: 'Recipes', model: 'gpt-sol', updatedAt: Date.UTC(2026, 9, 18) },
  { id: 'chat3', title: '', model: 'gpt-sol', updatedAt: Date.UTC(2026, 9, 10) },
];

function setup(list: ChatEntry[] = chats) {
  const props = {
    chats: list,
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSettings: vi.fn(),
    onSetUpHome: vi.fn(),
  };
  const r = render(<PhoneHome {...props} language="en" />);
  return { ...props, container: r.container };
}

const titles = () =>
  screen.queryAllByRole('listitem').map((li) => li.querySelector('span')?.textContent);

describe('PhoneHome', () => {
  it('lists chats in the given order, untitled ones as "Untitled chat"', () => {
    setup();
    expect(titles()).toEqual(['Trip to Sweden', 'Recipes', 'Untitled chat']);
  });

  it('filters by title and says when nothing matches', () => {
    setup();
    const search = screen.getByRole('searchbox', { name: 'Search chats' });
    fireEvent.change(search, { target: { value: 'TRIP' } });
    expect(titles()).toEqual(['Trip to Sweden']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No chats match.')).toBeDefined();
  });

  it('shows the empty text without chats', () => {
    const { container } = setup([]);
    expect(screen.getByText('No chats yet.')).toBeDefined();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('opens, starts, goes to settings and to the at-home setup', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Recipes/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ New chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Set up Hemmia at home/ }));
    expect(p.onOpen).toHaveBeenCalledWith('chat2');
    expect([
      p.onNew.mock.calls.length,
      p.onSettings.mock.calls.length,
      p.onSetUpHome.mock.calls.length,
    ]).toEqual([1, 1, 1]);
  });

  it('renames with the trimmed title and ignores an empty one', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'More for Recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText<HTMLInputElement>('New title');
    expect(input.value).toBe('Recipes');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onRename).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'More for Recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('New title'), {
      target: { value: '  Family recipes ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onRename).toHaveBeenCalledWith('chat2', 'Family recipes');
  });

  it('deletes only after confirming', () => {
    const p = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'More for Trip to Sweden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).toHaveBeenCalledWith('chat1');
  });
});
