import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, loadConfig, withLegacyNames } from './load.ts';

function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('expected a throw');
}

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kchat-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load defaults with test environment and homeDir', () => {
    const config = loadConfig({ NODE_ENV: 'test' }, { homeDir: '/home/x', platform: 'darwin' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.dataDir).toBe('/home/x/Library/Application Support/Hemmia');
    expect(config.allowedHosts).toEqual(['localhost', '127.0.0.1', '[::1]']);
    expect(config.logLevel).toBe('silent');
    expect(config.ollamaUrl).toBe('http://127.0.0.1:11434');
    expect(config.models.defaultChatModel).toBe('gemma4-26b');
  });

  it('should parse HEMMIA_PORT correctly', () => {
    const config = loadConfig({ NODE_ENV: 'development', HEMMIA_PORT: '9000' });
    expect(config.port).toBe(9000);
  });

  it('should throw ConfigError for invalid HEMMIA_PORT', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', HEMMIA_PORT: 'notaport' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ NODE_ENV: 'development', HEMMIA_PORT: 'notaport' })).toThrow(
      'HEMMIA_PORT',
    );
    const message = errorMessage(() =>
      loadConfig({ NODE_ENV: 'development', HEMMIA_PORT: 'notaport' }),
    );
    expect(message).not.toContain('notaport');
  });

  it('should throw ConfigError for invalid HEMMIA_HOST', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', HEMMIA_HOST: '0.0.0.0' })).toThrow(
      ConfigError,
    );
  });

  it('should parse HEMMIA_PUBLIC_HOSTNAMES correctly', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      HEMMIA_PUBLIC_HOSTNAMES: ' Kchat.Example.ts.net, ,kchat.example.ts.net,other.ts.net',
    });
    expect(config.allowedHosts).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'kchat.example.ts.net',
      'other.ts.net',
    ]);
  });

  it('adds valid hostnames from public-hostnames.txt in the data dir', () => {
    fs.writeFileSync(
      path.join(tempDir, 'public-hostnames.txt'),
      '# from tailscale.sh\nMini.Tail1234.ts.net.\nbad host!\n\nother.ts.net\n',
    );
    const config = loadConfig({
      NODE_ENV: 'development',
      HEMMIA_DATA_DIR: tempDir,
      HEMMIA_PUBLIC_HOSTNAMES: 'other.ts.net',
    });
    expect(config.allowedHosts).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'other.ts.net',
      'mini.tail1234.ts.net',
    ]);
  });

  it('works without public-hostnames.txt', () => {
    const config = loadConfig({ NODE_ENV: 'development', HEMMIA_DATA_DIR: tempDir });
    expect(config.allowedHosts).toEqual(['localhost', '127.0.0.1', '[::1]']);
  });

  it('accepts the old KCHAT_* names, the new name winning', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      KCHAT_PORT: '9001',
      KCHAT_DATA_DIR: tempDir,
      KCHAT_HOST: '::1',
      HEMMIA_HOST: '127.0.0.1',
    });
    expect(config.port).toBe(9001);
    expect(config.dataDir).toBe(tempDir);
    expect(config.host).toBe('127.0.0.1');
    expect(withLegacyNames({ KCHAT_X: 'a', OTHER: 'b' })).toEqual({
      KCHAT_X: 'a',
      OTHER: 'b',
      HEMMIA_X: 'a',
    });
  });

  it('should throw ConfigError for invalid HEMMIA_PUBLIC_HOSTNAMES', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'development', HEMMIA_PUBLIC_HOSTNAMES: 'bad host!' }),
    ).toThrow(ConfigError);
    const message = errorMessage(() =>
      loadConfig({ NODE_ENV: 'development', HEMMIA_PUBLIC_HOSTNAMES: 'bad host!' }),
    );
    expect(message).not.toContain('bad host!');
  });

  it('should handle missing models file correctly', () => {
    const modelsPath = path.join(tempDir, 'missing.json');
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow('Cannot read models file');
  });

  it('should handle invalid JSON in models file', () => {
    const modelsPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(modelsPath, '{ invalid json }');
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow('Cannot read models file');
  });

  it('should handle invalid models file structure', () => {
    const modelsPath = path.join(tempDir, 'invalid-structure.json');
    fs.writeFileSync(
      modelsPath,
      JSON.stringify({
        chatModels: [],
        defaultChatModel: 'nonexistent',
      }),
    );
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        HEMMIA_MODELS_FILE: modelsPath,
      }),
    ).toThrow('Invalid models file');
  });
  it('allows 0.0.0.0 only in a container', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', HEMMIA_HOST: '0.0.0.0' })).toThrow(ConfigError);
    const config = loadConfig({ NODE_ENV: 'test', HEMMIA_HOST: '0.0.0.0', HEMMIA_CONTAINER: '1' });
    expect(config.host).toBe('0.0.0.0');
    expect(config.container).toBe(true);
  });

  it('keeps a data dir from before the rename when there is no new one', () => {
    const support = path.join(tempDir, 'Library', 'Application Support');
    fs.mkdirSync(path.join(support, 'kchat'), { recursive: true });
    const old = loadConfig({ NODE_ENV: 'test' }, { homeDir: tempDir, platform: 'darwin' });
    expect(old.dataDir).toBe(path.join(support, 'kchat'));
    fs.mkdirSync(path.join(support, 'Hemmia'));
    const both = loadConfig({ NODE_ENV: 'test' }, { homeDir: tempDir, platform: 'darwin' });
    expect(both.dataDir).toBe(path.join(support, 'Hemmia'));
  });

  it('picks the default data dir per platform', () => {
    const home = { homeDir: '/home/x' };
    expect(loadConfig({ NODE_ENV: 'test' }, { ...home, platform: 'darwin' }).dataDir).toBe(
      '/home/x/Library/Application Support/Hemmia',
    );
    expect(loadConfig({ NODE_ENV: 'test' }, { ...home, platform: 'linux' }).dataDir).toBe(
      '/home/x/.local/share/hemmia',
    );
    expect(
      loadConfig({ NODE_ENV: 'test', XDG_DATA_HOME: '/xdg' }, { ...home, platform: 'linux' })
        .dataDir,
    ).toBe('/xdg/hemmia');
    expect(
      loadConfig({ NODE_ENV: 'test', XDG_DATA_HOME: 'relative' }, { ...home, platform: 'linux' })
        .dataDir,
    ).toBe('/home/x/.local/share/hemmia');
    expect(
      loadConfig({ NODE_ENV: 'test', HEMMIA_CONTAINER: '1' }, { ...home, platform: 'linux' })
        .dataDir,
    ).toBe('/data');
    expect(() => loadConfig({ NODE_ENV: 'test' }, { ...home, platform: 'win32' })).toThrow(
      'HEMMIA_DATA_DIR',
    );
    expect(
      loadConfig({ NODE_ENV: 'test', HEMMIA_DATA_DIR: '/d' }, { ...home, platform: 'win32' })
        .dataDir,
    ).toBe('/d');
  });

  it('parses the new switches with safe defaults', () => {
    const off = loadConfig({ NODE_ENV: 'test' }, { homeDir: '/home/x', platform: 'darwin' });
    expect(off).toMatchObject({
      container: false,
      updateCheck: false,
      connectOnStart: false,
      relayDomain: null,
    });
    const on = loadConfig(
      {
        NODE_ENV: 'test',
        HEMMIA_UPDATE_CHECK: '1',
        HEMMIA_CONNECT: '1',
        HEMMIA_RELAY_DOMAIN: 'relay.example',
      },
      { homeDir: '/home/x', platform: 'darwin' },
    );
    expect(on).toMatchObject({
      updateCheck: true,
      connectOnStart: true,
      relayDomain: 'relay.example',
    });
    expect(() => loadConfig({ NODE_ENV: 'test', HEMMIA_RELAY_DOMAIN: 'Not A Domain' })).toThrow(
      'HEMMIA_RELAY_DOMAIN',
    );
    expect(() => loadConfig({ NODE_ENV: 'test', HEMMIA_CONNECT: 'yes' })).toThrow('HEMMIA_CONNECT');
  });
  it('loads the public models file (no chat models, no default)', () => {
    const file = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../../config/models.public.json',
    );
    const config = loadConfig({ NODE_ENV: 'test', HEMMIA_MODELS_FILE: file });
    expect(config.models.chatModels).toEqual([]);
    expect(config.models.defaultChatModel).toBeNull();
    expect(config.models.cloudModels.length).toBeGreaterThan(0);
  });
});
