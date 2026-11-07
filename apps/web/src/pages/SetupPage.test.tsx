import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, renderRoute, stubFetch } from '../test-utils.tsx';

const CODE = 'ABCDEFGHJKMNPQRSTVWX';
const STATE = {
  needsSetup: true,
  machine: { platform: 'darwin', memoryGiB: 32, diskFreeGiB: 200 },
  familyName: null,
};
const ME = {
  id: 'u1',
  username: 'boss',
  role: 'admin',
  restricted: false,
  language: 'en',
  defaultModelId: null,
};

function open(withCode = true) {
  window.history.replaceState(null, '', withCode ? `/setup#${CODE}` : '/setup');
  return renderRoute(withCode ? `/setup#${CODE}` : '/setup');
}

async function fillAccount() {
  fireEvent.change(await screen.findByLabelText('Family name'), { target: { value: ' Miller ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'boss' } });
  const [pass, repeat] = screen.getAllByLabelText(/passphrase/i);
  if (!pass || !repeat) throw new Error('fields');
  fireEvent.change(pass, { target: { value: 'blue tractor sings loudly' } });
  fireEvent.change(repeat, { target: { value: 'blue tractor sings loudly' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SetupPage', () => {
  it('asks for the installer link without a code', async () => {
    stubFetch(() => undefined);
    open(false);
    expect(await screen.findByText('Open the setup link from the installer.')).toBeDefined();
  });

  it('goes to the login page when setup is done', async () => {
    stubFetch((url) =>
      url === '/api/setup/state' ? json({ error: { code: 'not_found' } }, 404) : undefined,
    );
    const { router } = open();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it('creates the admin and shows the recovery code; the code leaves the address bar', async () => {
    const calls = stubFetch((url) => {
      if (url === '/api/setup/state') return json(STATE);
      if (url === '/api/setup/account') {
        return json({ me: ME, recoveryCode: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' });
      }
      return undefined;
    });
    open();
    expect(await screen.findByText('32 GB memory')).toBeDefined();
    expect(screen.getByText('Hemmia', { exact: true })).toBeDefined();
    expect(window.location.hash).toBe('');
    await fillAccount();
    expect(
      await screen.findByText('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', { exact: false }),
    ).toBeDefined();
    const post = calls.find((c) => c.url === '/api/setup/account');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      setupCode: CODE,
      username: 'boss',
      password: 'blue tractor sings loudly',
      familyName: 'Miller',
      lang: 'en',
    });
  });

  it('goes on from the recovery code to choosing the AI', async () => {
    stubFetch((url) => {
      if (url === '/api/setup/state') return json(STATE);
      if (url === '/api/setup/account') {
        return json({ me: ME, recoveryCode: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' });
      }
      if (url === '/api/admin/catalog') return json({ memoryGiB: 32, entries: [] });
      return undefined;
    });
    open();
    await screen.findByText('32 GB memory');
    await fillAccount();
    await screen.findByText('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', { exact: false });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Choose your AI' })).toBeDefined();
  });

  it('explains an expired setup link', async () => {
    stubFetch((url) => {
      if (url === '/api/setup/state') return json(STATE);
      if (url === '/api/setup/account') return json({ error: { code: 'forbidden' } }, 403);
      return undefined;
    });
    open();
    await fillAccount();
    expect(
      await screen.findByText(
        'This setup link has expired. Run the installer again or restart Hemmia for a new one.',
      ),
    ).toBeDefined();
  });
});
