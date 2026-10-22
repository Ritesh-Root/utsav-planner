import type { Logger } from '../../src/server/logger.js';

/** A logger that discards everything, for tests. */
export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
