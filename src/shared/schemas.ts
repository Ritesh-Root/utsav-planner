import { z } from 'zod';

import {
  BUDGET_KEYS,
  COST_TIERS,
  DIETARY,
  EVENT_TYPES,
  IDEA_CATEGORIES,
  PLAN_VERSION,
  PRIORITIES,
  REFINE_SCOPES,
  TASK_PRIORITIES,
  VENDOR_STATUSES,
  VENUE_PREFERENCES,
} from './constants.js';
import { isISODate } from './dates.js';
import { BASIS_POINTS, LIMITS } from './limits.js';
import { CURRENCIES } from './money.js';

export * from './constants.js';

// zod normally probes for `new Function` support, which the strict CSP blocks in
// the browser; jitless mode skips that probe there and keeps the JIT on Node.
z.config({ jitless: 'document' in globalThis });

export const IsoDateSchema = z
  .string()
  .refine(isISODate, { message: 'Use a real date in YYYY-MM-DD format' });

const uniqueList = <T extends string>(values: readonly [T, ...T[]], max: number) =>
  z
    .array(z.enum(values))
    .max(max)
    .refine((list) => new Set(list).size === list.length, { message: 'Remove duplicates' });

/** The fields of a brief, before cross-field rules. */
const BriefShape = z.strictObject({
  type: z.enum(EVENT_TYPES),
  title: z.string().trim().min(1, 'Give the event a name').max(LIMITS.titleMax),
  date: IsoDateSchema,
  location: z.string().trim().min(1, 'Add a city or area').max(LIMITS.locationMax),
  guests: z.number().int().min(LIMITS.guestsMin).max(LIMITS.guestsMax),
  budget: z.number().int().min(1, 'Enter a budget above zero').max(LIMITS.budgetMax),
  currency: z.enum(CURRENCIES),
  venue: z.enum(VENUE_PREFERENCES),
  style: z.string().trim().max(LIMITS.styleMax),
  priorities: uniqueList(PRIORITIES, LIMITS.prioritiesMax),
  dietary: uniqueList(DIETARY, LIMITS.dietaryMax),
  days: z.number().int().min(1).max(LIMITS.weddingDaysMax),
  honoreeAge: z.number().int().min(0).max(LIMITS.honoreeAgeMax).nullable(),
  notes: z.string().trim().max(LIMITS.notesMax),
});

/** What the user tells us about their event. */
export const BriefSchema = BriefShape.refine(
  (brief) => brief.type === 'birthday' || brief.honoreeAge === null,
  { message: 'Age only applies to birthdays', path: ['honoreeAge'] },
);
export type Brief = z.infer<typeof BriefSchema>;

/** Fields a refinement may change in the brief, with the same rules as the brief. */
export const BriefPatchSchema = BriefShape.pick({
  guests: true,
  budget: true,
  date: true,
  location: true,
  style: true,
  days: true,
}).partial();
export type BriefPatch = z.infer<typeof BriefPatchSchema>;

// ---------------------------------------------------------------------------
// What Gemini returns. Only types, enums and minimum list sizes are enforced
// here; lengths and ranges are guidance (`meta`) that the normaliser clamps.
// ---------------------------------------------------------------------------

const text = (description: string) => z.string().min(1).meta({ description });
/**
 * `min` is enforced on the response; `target` is the `minItems` sent to Gemini,
 * whose constrained decoding then produces a fuller list than the bare minimum.
 */
const list = <T extends z.ZodType>(
  item: T,
  min: number,
  target: number,
  max: number,
  description: string,
) => z.array(item).min(min).meta({ minItems: target, maxItems: max, description });

export const AiBudgetLineSchema = z.object({
  key: z.enum(BUDGET_KEYS),
  category: text('Short label shown to the user, e.g. "Catering & food"'),
  sharePct: z.number().meta({ minimum: 0, maximum: 100, description: 'Share of total budget' }),
  perGuest: z.boolean().meta({ description: 'True if this cost grows with guest count' }),
  rationale: text('One sentence on why this share fits the brief'),
  estLow: z.number().meta({ minimum: 0, description: 'Rough local cost estimate, low end' }),
  estHigh: z.number().meta({ minimum: 0, description: 'Rough local cost estimate, high end' }),
});

export const AiTaskSchema = z.object({
  title: text('Action, starting with a verb'),
  details: text('One practical sentence'),
  daysBefore: z.number().int().meta({
    minimum: LIMITS.daysBeforeMin,
    maximum: LIMITS.daysBeforeMax,
    description: 'Ideal days before the event; negative means after it',
  }),
  priority: z.enum(TASK_PRIORITIES),
});

export const AiVendorSchema = z.object({
  category: text('Vendor type, never a business name'),
  budgetKey: z.enum(BUDGET_KEYS),
  why: text('Why this event needs it'),
  bookDaysBefore: z.number().int().meta({
    minimum: 0,
    maximum: LIMITS.daysBeforeMax,
    description: 'Book at least this many days before the event',
  }),
  questions: z
    .array(text('Question to ask the vendor'))
    .min(1)
    .meta({ maxItems: LIMITS.questionsMax, description: 'Three questions to ask' }),
});

export const AiIdeaSchema = z.object({
  category: z.enum(IDEA_CATEGORIES),
  title: text('Short idea name'),
  description: text('One or two sentences, personalised to the brief'),
  costTier: z.enum(COST_TIERS),
});

export const AiDayOfSchema = z.object({
  day: z.number().int().meta({ minimum: 1, maximum: LIMITS.weddingDaysMax }),
  startMinute: z
    .number()
    .int()
    .meta({ minimum: 0, maximum: LIMITS.dayMinutesMax, description: 'Minutes after midnight' }),
  title: text('What happens'),
});

export const AiPlanSchema = z.object({
  title: text('Plan title'),
  summary: text('Two or three sentences summarising the approach'),
  assumptions: z
    .array(text('An assumption made'))
    .meta({ maxItems: LIMITS.assumptionsMax, description: 'Assumptions the user should check' }),
  // Larger `minItems` targets made Vertex reject the schema as too complex
  // (HTTP 400, Oct 2026); the prompt asks for fuller lists instead.
  budget: list(AiBudgetLineSchema, LIMITS.budgetLinesMin, 5, LIMITS.budgetLinesMax, 'Budget lines'),
  timeline: list(AiTaskSchema, LIMITS.tasksMin, 8, LIMITS.tasksMax, 'Preparation tasks'),
  vendors: list(AiVendorSchema, LIMITS.vendorsMin, 5, LIMITS.vendorsMax, 'Vendor checklist'),
  ideas: list(AiIdeaSchema, LIMITS.ideasMin, 5, LIMITS.ideasMax, 'Personalised ideas'),
  dayOf: list(AiDayOfSchema, 1, 1, LIMITS.dayOfMax, 'Run sheet for the event day(s)'),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;
export type AiBudgetLine = z.infer<typeof AiBudgetLineSchema>;
export type AiTask = z.infer<typeof AiTaskSchema>;
export type AiVendor = z.infer<typeof AiVendorSchema>;
export type AiIdea = z.infer<typeof AiIdeaSchema>;
export type AiDayOf = z.infer<typeof AiDayOfSchema>;

const optionalId = {
  id: z.string().optional().meta({ description: 'Existing id when updating an item' }),
};

export const AiRefineSectionsSchema = z.object({
  budget: z.array(AiBudgetLineSchema.extend(optionalId)).optional(),
  timeline: z.array(AiTaskSchema.extend(optionalId)).optional(),
  vendors: z.array(AiVendorSchema.extend(optionalId)).optional(),
  ideas: z.array(AiIdeaSchema.extend(optionalId)).optional(),
  dayOf: z.array(AiDayOfSchema.extend(optionalId)).optional(),
});

export const AiRefineSchema = AiRefineSectionsSchema.extend({
  message: text('One or two sentences telling the user what changed'),
  briefPatch: z
    .object({
      guests: z.number().int().optional(),
      budget: z.number().int().optional(),
      date: z.string().optional(),
      location: z.string().optional(),
      style: z.string().optional(),
      days: z.number().int().optional(),
    })
    .optional()
    .meta({ description: 'Only fields the user explicitly asked to change' }),
});

// ---------------------------------------------------------------------------
// The stored plan. Validated on load and on import, so a corrupted or edited
// file can never crash the app.
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(LIMITS.idMax);
const amount = z
  .number()
  .int()
  .min(0)
  .max(LIMITS.budgetMax * 10);
const storedText = (max: number) => z.string().max(max);

export const BudgetLineSchema = z.strictObject({
  id,
  key: z.enum(BUDGET_KEYS),
  category: storedText(LIMITS.shortText),
  shareBp: z.number().int().min(0).max(BASIS_POINTS),
  perGuest: z.boolean(),
  rationale: storedText(LIMITS.mediumText),
  estLow: amount,
  estHigh: amount,
  amount,
  locked: z.boolean(),
  actual: amount,
});

export const TaskSchema = z.strictObject({
  id,
  title: storedText(LIMITS.shortText),
  details: storedText(LIMITS.mediumText),
  daysBefore: z.number().int().min(LIMITS.daysBeforeMin).max(LIMITS.daysBeforeMax),
  priority: z.enum(TASK_PRIORITIES),
  due: IsoDateSchema,
  doNow: z.boolean(),
  done: z.boolean(),
  custom: z.boolean(),
});

export const VendorSchema = z.strictObject({
  id,
  category: storedText(LIMITS.shortText),
  budgetKey: z.enum(BUDGET_KEYS),
  why: storedText(LIMITS.mediumText),
  questions: z.array(storedText(LIMITS.mediumText)).max(LIMITS.questionsMax),
  bookDaysBefore: z.number().int().min(0).max(LIMITS.daysBeforeMax),
  bookBy: IsoDateSchema,
  status: z.enum(VENDOR_STATUSES),
  contactName: storedText(LIMITS.vendorFieldMax),
  contact: storedText(LIMITS.vendorFieldMax),
  quote: amount,
  notes: storedText(LIMITS.vendorNotesMax),
});

export const IdeaSchema = z.strictObject({
  id,
  category: z.enum(IDEA_CATEGORIES),
  title: storedText(LIMITS.shortText),
  description: storedText(LIMITS.longText),
  costTier: z.enum(COST_TIERS),
  saved: z.boolean(),
});

export const DayOfItemSchema = z.strictObject({
  id,
  day: z.number().int().min(1).max(LIMITS.weddingDaysMax),
  startMinute: z.number().int().min(0).max(LIMITS.dayMinutesMax),
  title: storedText(LIMITS.shortText),
});

export const PlanSchema = z.strictObject({
  version: z.literal(PLAN_VERSION),
  id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdOn: IsoDateSchema,
  brief: BriefSchema,
  source: z.enum(['ai', 'template']),
  fallbackReason: storedText(LIMITS.mediumText).nullable(),
  model: storedText(LIMITS.idMax).nullable(),
  title: storedText(LIMITS.shortText),
  summary: storedText(LIMITS.longText),
  assumptions: z.array(storedText(LIMITS.mediumText)).max(LIMITS.assumptionsMax),
  budget: z.array(BudgetLineSchema).max(LIMITS.budgetLinesMax + 4),
  tasks: z.array(TaskSchema).max(LIMITS.tasksMax * 3),
  vendors: z.array(VendorSchema).max(LIMITS.vendorsMax * 2),
  ideas: z.array(IdeaSchema).max(LIMITS.ideasMax * 4),
  dayOf: z.array(DayOfItemSchema).max(LIMITS.dayOfMax * 2),
});
export type Plan = z.infer<typeof PlanSchema>;
export type BudgetLine = z.infer<typeof BudgetLineSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
export type DayOfItem = z.infer<typeof DayOfItemSchema>;

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export const PlanRequestSchema = z.strictObject({
  brief: BriefSchema,
  today: IsoDateSchema,
});

const contextText = z.string().max(LIMITS.shortText);

/** The minimum the model needs to refine a plan. Private fields never leave the browser. */
export const RefineContextSchema = z.strictObject({
  title: contextText,
  budget: z
    .array(
      z.strictObject({
        id,
        key: z.enum(BUDGET_KEYS),
        category: contextText,
        sharePct: z.number().min(0).max(100),
        amount,
        locked: z.boolean(),
      }),
    )
    .max(LIMITS.budgetLinesMax + 4),
  timeline: z
    .array(
      z.strictObject({
        id,
        title: contextText,
        daysBefore: z.number().int(),
        priority: z.enum(TASK_PRIORITIES),
        done: z.boolean(),
      }),
    )
    .max(LIMITS.tasksMax * 3),
  vendors: z
    .array(
      z.strictObject({
        id,
        category: contextText,
        budgetKey: z.enum(BUDGET_KEYS),
        bookDaysBefore: z.number().int(),
        status: z.enum(VENDOR_STATUSES),
      }),
    )
    .max(LIMITS.vendorsMax * 2),
  ideas: z
    .array(
      z.strictObject({
        id,
        category: z.enum(IDEA_CATEGORIES),
        title: contextText,
        saved: z.boolean(),
      }),
    )
    .max(LIMITS.ideasMax * 4),
  dayOf: z
    .array(
      z.strictObject({
        id,
        day: z.number().int(),
        startMinute: z.number().int(),
        title: contextText,
      }),
    )
    .max(LIMITS.dayOfMax * 2),
});
export type RefineContext = z.infer<typeof RefineContextSchema>;

export const RefineRequestSchema = z.strictObject({
  brief: BriefSchema,
  today: IsoDateSchema,
  context: RefineContextSchema,
  instruction: z.string().trim().min(LIMITS.instructionMin).max(LIMITS.instructionMax),
  scope: z.enum(REFINE_SCOPES),
  previous: z.array(z.string().max(LIMITS.instructionMax)).max(LIMITS.previousInstructionsMax),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

/** A validated refinement, ready to merge into a plan. */
export interface RefineResult {
  message: string;
  briefPatch: BriefPatch | null;
  sections: {
    budget?: (AiBudgetLine & { id?: string })[];
    timeline?: (AiTask & { id?: string })[];
    vendors?: (AiVendor & { id?: string })[];
    ideas?: (AiIdea & { id?: string })[];
    dayOf?: (AiDayOf & { id?: string })[];
  };
}

export type PlanSource = 'ai' | 'template';

export interface ResponseMeta {
  source: PlanSource;
  fallbackReason: string | null;
  cached: boolean;
  latencyMs: number;
  model: string | null;
}

export const ResponseMetaSchema = z.object({
  source: z.enum(['ai', 'template']),
  fallbackReason: z.string().nullable(),
  cached: z.boolean(),
  latencyMs: z.number(),
  model: z.string().nullable(),
});

/** What `/api/plan` returns; the browser checks it before trusting it. */
export const PlanResponseSchema = z.object({ plan: PlanSchema, meta: ResponseMetaSchema });

/** What `/api/refine` returns. */
export const RefineResponseSchema = z.object({
  result: z.object({
    message: z.string(),
    briefPatch: BriefPatchSchema.nullable(),
    sections: AiRefineSectionsSchema,
  }),
  meta: ResponseMetaSchema,
});
