import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createLoggerOptions } from './logger.ts';

function capture(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('createLoggerOptions', () => {
  it('redacts content fields, keeps ids', () => {
    const { stream, output } = capture();
    const logger = pino(createLoggerOptions({ logLevel: 'info' }), stream);
    logger.info({ password: 'hunter2', user: { content: 'secret text' }, chatId: 'c1' }, 'x');
    const out = output();
    expect(out).toContain('[redacted]');
    expect(out).toContain('c1');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('secret text');
  });

  it('logs requests as method and path only', () => {
    const { stream, output } = capture();
    const logger = pino(createLoggerOptions({ logLevel: 'info' }), stream);
    logger.info({
      req: { method: 'GET', url: '/api/chats?q=private', headers: { cookie: 'kchat=abc' } },
    });
    const out = output();
    expect(out).toContain('"url":"/api/chats"');
    expect(out).not.toContain('private');
    expect(out).not.toContain('kchat=abc');
  });
});
