import { Router } from 'express';
import type { RequestHandler } from 'express';

import { diffDays, utcToday } from '../shared/dates.js';
import { PlanRequestSchema, RefineRequestSchema } from '../shared/schemas.js';
import { eventDateIssue } from '../shared/timeline.js';
import type { Planner } from './ai/planner.js';
import { HttpError, validationError } from './errors.js';

/**
 * `today` comes from the user's own calendar (India is ahead of UTC late in the
 * evening), so it may differ from the server's UTC date by one day at most.
 */
function checkDates(eventDate: string, today: string, serverNow: Date): void {
  if (Math.abs(diffDays(utcToday(serverNow), today)) > 1) {
    throw new HttpError(400, 'INVALID_TODAY', 'Your device date looks wrong. Please check it.', {
      fields: [{ path: 'today', message: 'Must be within a day of the current date' }],
    });
  }
  const issue = eventDateIssue(eventDate, today);
  if (issue) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Some details need fixing.', {
      fields: [
        {
          path: 'brief.date',
          message:
            issue === 'past' ? 'Pick a date that has not passed' : 'Pick a date within three years',
        },
      ],
    });
  }
}

export interface RouteDeps {
  planner: Planner;
  version: string;
  aiLimiter: RequestHandler;
  now: () => Date;
}

/** The JSON API: health, plan and refine. Validation errors become 400s with field paths. */
export function createApiRouter({ planner, version, aiLimiter, now }: RouteDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version, ai: planner.mode, model: planner.model });
  });

  router.post('/plan', aiLimiter, async (req, res) => {
    const parsed = PlanRequestSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    const { brief, today } = parsed.data;
    checkDates(brief.date, today, now());
    res.json(await planner.plan(brief, today));
  });

  router.post('/refine', aiLimiter, async (req, res) => {
    const parsed = RefineRequestSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    checkDates(parsed.data.brief.date, parsed.data.today, now());
    res.json(await planner.refine(parsed.data));
  });

  return router;
}
