import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { stubFetch } from '../test-utils.tsx';
import { FeedbackBox } from './FeedbackBox.tsx';

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider language="en">{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedbackBox', () => {
  it('sends a question with an optional email to the hub', async () => {
    const calls = stubFetch((url) =>
      url === '/api/feedback' ? new Response(null, { status: 204 }) : undefined,
    );
    renderWithProviders(<FeedbackBox page="setup/4" />);
    fireEvent.click(screen.getByRole('button', { name: 'Questions or feedback?' }));
    fireEvent.change(screen.getByLabelText('Your question or feedback'), {
      target: { value: 'Which model for 16 GB?' },
    });
    fireEvent.change(screen.getByLabelText(/Your email/), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('status')).textContent).toContain('answer by email');
    const post = calls.find((c) => c.url === '/api/feedback');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      message: 'Which model for 16 GB?',
      email: 'a@example.com',
      page: 'setup/4',
    });
  });

  it('points to the website before there is an account', () => {
    stubFetch(() => undefined);
    renderWithProviders(<FeedbackBox page="setup/1" signedIn={false} />);
    expect(
      screen.getByRole('link', { name: 'Ask the Hemmia team on hemmia.app' }).getAttribute('href'),
    ).toBe('https://hemmia.app/help/#feedback');
  });
});
