import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** `vertex` calls Gemini through Vertex AI with the service identity; `off` uses templates only. */
  AI_MODE: z.enum(['vertex', 'off']).default('vertex'),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  GOOGLE_CLOUD_LOCATION: z.string().min(1).default('global'),
  /** Upper bound on Gemini calls per instance per UTC day. */
  DAILY_AI_CAP: z.coerce.number().int().min(0).default(500),
  APP_VERSION: z.string().default('1.0.0'),
  STATIC_DIR: z.string().optional(),
});

export interface Config {
  port: number;
  env: 'development' | 'production' | 'test';
  ai: { mode: 'vertex'; project: string; location: string; model: string } | { mode: 'off' };
  dailyAiCap: number;
  version: string;
  staticDir: string | undefined;
}

/** Read and validate the environment once at start-up; bad settings fail fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const project = parsed.GOOGLE_CLOUD_PROJECT;
  return {
    port: parsed.PORT,
    env: parsed.NODE_ENV,
    ai:
      parsed.AI_MODE === 'vertex' && project
        ? {
            mode: 'vertex',
            project,
            location: parsed.GOOGLE_CLOUD_LOCATION,
            model: parsed.GEMINI_MODEL,
          }
        : { mode: 'off' },
    dailyAiCap: parsed.DAILY_AI_CAP,
    version: parsed.APP_VERSION,
    staticDir: parsed.STATIC_DIR,
  };
}
