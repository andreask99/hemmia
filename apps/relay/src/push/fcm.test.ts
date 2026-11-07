import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createFcmSender } from './fcm.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ACCOUNT = {
  client_email: 'relay@hemmia-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const MESSAGE = {
  kind: 'daily' as const,
  ref: 'r1',
  hubHost: 'zt0jr4qknd6e.h.relay.test',
  hubId: 'zt0jr4qknd6e',
};

function fake(send: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === 'https://oauth2.googleapis.com/token') {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'ya29.test-token', expires_in: 3600 })),
        );
      }
      return Promise.resolve(send());
    },
  };
}

describe('FCM sender', () => {
  it('gets an access token with a signed assertion and sends a content-free message', async () => {
    const f = fake(() => new Response('{}'));
    let clock = 1_800_000_000_000;
    const s = createFcmSender({
      serviceAccount: ACCOUNT,
      projectId: 'hemmia-test',
      fetch: f.fetch,
      now: () => clock,
    });
    expect(await s.send('android', 'production', 'tok:en', MESSAGE)).toBe('ok');
    const form = new URLSearchParams(f.calls[0]?.init.body as string);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [head, claims, sig] = (form.get('assertion') ?? '').split('.');
    expect(
      verify(
        'sha256',
        Buffer.from(`${head ?? ''}.${claims ?? ''}`),
        publicKey,
        Buffer.from(sig ?? '', 'base64url'),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims ?? '', 'base64url').toString())).toEqual({
      iss: ACCOUNT.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(f.calls[1]?.url).toBe(
      'https://fcm.googleapis.com/v1/projects/hemmia-test/messages:send',
    );
    expect((f.calls[1]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer ya29.test-token',
    );
    expect(JSON.parse(f.calls[1]?.init.body as string)).toEqual({
      message: {
        token: 'tok:en',
        data: { k: 'daily', r: 'r1', h: 'zt0jr4qknd6e.h.relay.test' },
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          collapse_key: 'daily',
          notification: {
            title_loc_key: 'push_daily_title',
            body_loc_key: 'push_daily_body',
            channel_id: 'replies',
            tag: 'daily',
          },
        },
      },
    });
    // The access token is reused until 5 minutes before it expires.
    await s.send('android', 'production', 'tok:en', MESSAGE);
    expect(f.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    clock += 56 * 60_000;
    await s.send('android', 'production', 'tok:en', MESSAGE);
    expect(f.calls.filter((c) => c.url.includes('oauth2')).length).toBe(2);
  });

  it('maps dead tokens to gone and other failures to error', async () => {
    const unregistered = fake(
      () =>
        new Response(
          JSON.stringify({
            error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] },
          }),
          {
            status: 404,
          },
        ),
    );
    expect(
      await createFcmSender({
        serviceAccount: ACCOUNT,
        projectId: 'p-1234',
        fetch: unregistered.fetch,
      }).send('android', 'production', 't', MESSAGE),
    ).toBe('gone');
    const invalid = fake(
      () =>
        new Response(
          JSON.stringify({
            error: {
              status: 'INVALID_ARGUMENT',
              message: 'The registration token is not a valid FCM registration token',
            },
          }),
          { status: 400 },
        ),
    );
    expect(
      await createFcmSender({
        serviceAccount: ACCOUNT,
        projectId: 'p-1234',
        fetch: invalid.fetch,
      }).send('android', 'production', 't', MESSAGE),
    ).toBe('gone');
    const down = fake(() => new Response('{}', { status: 503 }));
    expect(
      await createFcmSender({
        serviceAccount: ACCOUNT,
        projectId: 'p-1234',
        fetch: down.fetch,
      }).send('android', 'production', 't', MESSAGE),
    ).toBe('error');
    expect(
      await createFcmSender({
        serviceAccount: ACCOUNT,
        projectId: 'p-1234',
        fetch: down.fetch,
      }).send('ios', 'production', 't', MESSAGE),
    ).toBe('error');
  });
});
