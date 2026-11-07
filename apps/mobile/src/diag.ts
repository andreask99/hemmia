/**
 * P5.1 spike checks (docs/public/PLAN.md), run only in a diagnostics build
 * (HEMMIA_MOBILE_DIAG=<dev hub URL>). Results go to the console, which Capacitor forwards to
 * the system log ("HEMMIA_DIAG …"), then the web view navigates to the hub's check page.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { secureStore } from './native/secureStore.ts';
import { capacitorFiles } from './phone/files.ts';
import { createKeys, maskKey } from './phone/keys.ts';
import { createPhoneStore } from './phone/store.ts';
import { Preferences } from '@capacitor/preferences';

const report = (name: string, ok: boolean, detail = '') => {
  // eslint-disable-next-line no-console
  console.log(`HEMMIA_DIAG ${JSON.stringify({ where: 'shell', name, ok, detail })}`);
};

export async function runDiagnostics(hubUrl: string): Promise<void> {
  report('native', Capacitor.isNativePlatform(), Capacitor.getPlatform());
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('aad') },
      key,
      new TextEncoder().encode('hello'),
    );
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('aad') },
      key,
      ct,
    );
    report('crypto.subtle', new TextDecoder().decode(pt) === 'hello');
  } catch (e) {
    report('crypto.subtle', false, String(e));
  }
  try {
    await Filesystem.writeFile({
      path: 'diag/test.txt',
      data: 'kchat',
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const r = await Filesystem.readFile({
      path: 'diag/test.txt',
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    report('filesystem', r.data === 'kchat');
  } catch (e) {
    report('filesystem', false, String(e));
  }
  try {
    await Preferences.set({ key: 'diag', value: 'x' });
    report('preferences', (await Preferences.get({ key: 'diag' })).value === 'x');
  } catch (e) {
    report('preferences', false, String(e));
  }
  // Streaming fetch: chunks must arrive as they are sent (the dev server sends 3, 400 ms apart).
  try {
    const started = Date.now();
    // A public https stream that isn't a navigation host (like the providers): 4 bytes over 2 s.
    const res = await fetch('https://httpbin.org/drip?duration=2&numbytes=4&code=200&delay=0');
    const reader = res.body?.getReader();
    const times: number[] = [];
    for (;;) {
      if (!reader) break;
      const { done } = await reader.read();
      if (done) break;
      times.push(Date.now() - started);
    }
    report(
      'streaming fetch',
      times.length >= 3 && (times[2] ?? 0) - (times[0] ?? 0) > 600,
      JSON.stringify(times),
    );
  } catch (e) {
    report('streaming fetch', false, String(e));
  }
  // P9.3: a key and a chat written on the first run are read back after a restart.
  try {
    const keys = createKeys(secureStore);
    const store = createPhoneStore(capacitorFiles, () => keys.dataKey(), { language: 'en' });
    const before = await keys.apiKey('anthropic');
    const chat = await store.getChat('diagchat');
    if (before === null || chat === null) {
      await keys.setApiKey('anthropic', 'sk-diag-test-0000-1234');
      await store.saveChat({
        id: 'diagchat',
        title: 'Diag',
        createdAt: Date.now(),
        model: 'diag',
        messages: [{ id: 'diagmsg1', role: 'user', content: 'persisted', createdAt: Date.now() }],
      });
      report('secure persist', true, 'written; restart the app to check');
    } else {
      report(
        'secure persist',
        chat.messages[0]?.content === 'persisted',
        `restored ${maskKey(before)}`,
      );
    }
  } catch (e) {
    report('secure persist', false, String(e));
  }
  // Last: navigating away ends this script.
  window.location.href = `${hubUrl}/diag.html`;
}
