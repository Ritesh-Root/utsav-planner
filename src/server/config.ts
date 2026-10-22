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
  /**
   * Proxies in front of the app whose X-Forwarded-For is trusted. Cloud Run has
   * exactly one (Google's front end); set 0 when the container is exposed directly,
   * or clients could spoof their address past the rate limits.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  STATIC_DIR: z.string().optional(),
});

export interface Config {
  port: number;
  env: 'development' | 'production' | 'test';
  ai: { mode: 'vertex'; project: string; location: string; model: string } | { mode: 'off' };
  dailyAiCap: number;
  version: string;
  trustProxy: number;
  /** Why AI is off, when it is; for the start-up log. */
  aiOffReason: string | null;
  staticDir: string | undefined;
}

/**
 * Read and validate the environment once at start-up. Malformed values throw;
 * a missing Google Cloud project turns AI off (templates only) and says why.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const project = parsed.GOOGLE_CLOUD_PROJECT;
  let aiOffReason: string | null = null;
  if (parsed.AI_MODE === 'off') aiOffReason = 'AI_MODE is off';
  else if (!project) aiOffReason = 'GOOGLE_CLOUD_PROJECT is not set';
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
    trustProxy: parsed.TRUST_PROXY,
    aiOffReason,
    staticDir: parsed.STATIC_DIR,
  };
}
