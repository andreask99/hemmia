import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LoadingBar } from './LoadingBar.tsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('LoadingBar', () => {
  it('fills over the expected time and waits at 95%', () => {
    vi.useFakeTimers();
    const start = Date.now();
    render(<LoadingBar since={start} expectedMs={10_000} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('about 10 s left')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('about 5 s left')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(bar.getAttribute('aria-valuenow')).toBe('95');
    expect(screen.getByText('almost ready')).toBeDefined();
  });
});
