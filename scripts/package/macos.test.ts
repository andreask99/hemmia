import { describe, expect, it } from 'vitest';
import { fillTemplate, isShipped, NODE_SHA256, NODE_VERSION, rootVersion } from './macos.ts';

describe('macOS package', () => {
  it('pins a Node 22 with a SHA-256', () => {
    expect(NODE_VERSION.startsWith('22.')).toBe(true);
    expect(NODE_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves tests and caches out of the package', () => {
    expect(isShipped('apps/server/src/main.ts')).toBe(true);
    expect(isShipped('apps/server/src/app.test.ts')).toBe(false);
    expect(isShipped('services/imagegen/tests/test_worker.py')).toBe(false);
    expect(isShipped('services/imagegen/src/__pycache__/x.pyc')).toBe(false);
  });

  it('fills only known placeholders', () => {
    expect(
      fillTemplate('v=__VERSION__ r=__RELAY_DOMAIN__ x=__OTHER__', {
        VERSION: '0.1.0',
        RELAY_DOMAIN: '',
      }),
    ).toBe('v=0.1.0 r= x=__OTHER__');
  });
  it('needs a semver version in package.json', () => {
    expect(rootVersion()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rootVersion('{"version":"0.1.0"}')).toBe('0.1.0');
    expect(() => rootVersion('{}')).toThrow('needs a version');
    expect(() => rootVersion('{"version":"../x"}')).toThrow('needs a version');
  });
});
