import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  name: 'persona',
  level: config.server.logLevel,
  ...(config.isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-shopify-session-token"]',
      'password',
      'accessToken',
      'credentials',
      'config.clientSecret',
    ],
    censor: '[REDACTED]',
  },
});

// Child logger factory for modules
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
