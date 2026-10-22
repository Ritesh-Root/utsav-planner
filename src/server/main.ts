import { fileURLToPath } from 'node:url';

import { createGeminiClient } from './ai/gemini.js';
import { createPlanner } from './ai/planner.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger();

const ai =
  config.ai.mode === 'vertex'
    ? createGeminiClient({
        project: config.ai.project,
        location: config.ai.location,
        model: config.ai.model,
      })
    : null;
if (!ai) logger.warn('AI is off: plans will come from templates', { reason: config.aiOffReason });

const app = createApp({
  planner: createPlanner({ ai, logger, dailyCap: config.dailyAiCap }),
  logger,
  version: config.version,
  trustProxy: config.trustProxy,
  // dist/node/server/main.js → dist/client
  staticDir: config.staticDir ?? fileURLToPath(new URL('../../client', import.meta.url)),
});

const server = app.listen(config.port, () => {
  logger.info('listening', { port: config.port, ai: ai ? ai.model : 'off', env: config.env });
});

// In a container Node runs as PID 1 and would ignore SIGTERM without a handler.
function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 9000).unref();
}
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
