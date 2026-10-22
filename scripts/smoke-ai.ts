/**
 * Live check against Gemini on Vertex AI: one plan per preset, plus one refine.
 * Needs Application Default Credentials. Not part of `npm test`.
 *
 *   GOOGLE_CLOUD_PROJECT=my-project GEMINI_MODEL=gemini-3.5-flash-lite npm run smoke:ai
 */
import { createGeminiClient } from '../src/server/ai/gemini.js';
import { createPlanner } from '../src/server/ai/planner.js';
import { createLogger } from '../src/server/logger.js';
import { utcToday } from '../src/shared/dates.js';
import { toRefineContext } from '../src/shared/plan.js';
import { presets } from '../src/shared/presets.js';

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) {
  console.error('Set GOOGLE_CLOUD_PROJECT to run the live AI smoke test.');
  process.exit(1);
}
const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
const ai = createGeminiClient({
  project,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? 'global',
  model,
});
const planner = createPlanner({ ai, logger: createLogger(() => undefined), dailyCap: 50 });
const today = utcToday();
let failures = 0;

for (const preset of presets(today)) {
  const { plan, meta } = await planner.plan(preset.brief, today);
  const ok = meta.source === 'ai';
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} plan ${preset.id}: source=${meta.source} ${meta.latencyMs} ms ` +
      `budget=${plan.budget.length} tasks=${plan.tasks.length} vendors=${plan.vendors.length} ` +
      `ideas=${plan.ideas.length} dayOf=${plan.dayOf.length}${meta.fallbackReason ? ` (${meta.fallbackReason})` : ''}`,
  );
  if (preset.id === 'birthday' && ok) {
    try {
      const { result, meta: refineMeta } = await planner.refine({
        brief: preset.brief,
        today,
        context: toRefineContext(plan),
        instruction: 'We now expect 45 guests. Keep it eco-friendly and add a space-themed game.',
        scope: 'all',
        previous: [],
      });
      console.log(
        `PASS refine: ${refineMeta.latencyMs} ms sections=${Object.keys(result.sections).join(',') || 'none'} ` +
          `briefPatch=${JSON.stringify(result.briefPatch)} message="${result.message}"`,
      );
    } catch (error) {
      failures += 1;
      console.log(`FAIL refine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
process.exit(failures > 0 ? 1 : 0);
