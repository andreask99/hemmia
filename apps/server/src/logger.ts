import type { LoggerOptions } from 'pino';
import { type Config, LOG_REDACT_PATHS } from './config/schema.ts';

/**
 * Pino options for Fastify. Requests are logged as method + path only (no query string,
 * headers, addresses or bodies); responses as status code only.
 */
export function createLoggerOptions(config: Pick<Config, 'logLevel'>): LoggerOptions {
  return {
    level: config.logLevel,
    redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' },
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        url: req.url?.split('?', 1)[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  };
}
