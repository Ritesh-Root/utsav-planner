import { z } from 'zod';

import type { RefineScope } from '../../shared/schemas.js';
import {
  AiBudgetLineSchema,
  AiDayOfSchema,
  AiIdeaSchema,
  AiPlanSchema,
  AiRefineSchema,
  AiTaskSchema,
  AiVendorSchema,
} from '../../shared/schemas.js';

/**
 * JSON Schema keywords we send in Gemini's `responseJsonSchema`. Anything else
 * (such as `maxLength`, `pattern` or `$schema`) is dropped; zod and the
 * normaliser enforce those after the response arrives. `maxItems` is left out
 * too: Vertex rejected plan schemas containing it (HTTP 400, Oct 2026), so list
 * sizes are stated in the prompt and capped by the normaliser instead.
 */
export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'title',
  'minItems',
  'minimum',
  'maximum',
  'anyOf',
]);

/** Bounds this large are zod's integer defaults and only add noise to the schema. */
const MEANINGLESS_BOUND = 1e12;

/** Strip a JSON Schema down to the keywords listed above, recursively. */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, schema]) => [
          name,
          toGeminiSchema(schema),
        ]),
      );
    } else if (SUPPORTED_KEYWORDS.has(key)) {
      if (
        (key === 'minimum' || key === 'maximum') &&
        Math.abs(Number(value)) >= MEANINGLESS_BOUND
      ) {
        continue;
      }
      out[key] = toGeminiSchema(value);
    }
  }
  return out;
}

function jsonSchemaOf(schema: z.ZodType): unknown {
  return toGeminiSchema(z.toJSONSchema(schema, { io: 'output', reused: 'inline' }));
}

/** Built once at start-up. */
export const PLAN_RESPONSE_SCHEMA = jsonSchemaOf(AiPlanSchema);

const SECTION_ITEMS = {
  budget: AiBudgetLineSchema,
  timeline: AiTaskSchema,
  vendors: AiVendorSchema,
  ideas: AiIdeaSchema,
  dayOf: AiDayOfSchema,
} as const;

const refineSchemas = new Map<RefineScope, unknown>();

/** A refine schema per scope: a scoped request must return that section. */
export function refineResponseSchema(scope: RefineScope): unknown {
  const cached = refineSchemas.get(scope);
  if (cached) return cached;
  let schema: z.ZodType = AiRefineSchema;
  if (scope !== 'all') {
    const id = z.string().optional().meta({ description: 'Existing id when updating an item' });
    schema = AiRefineSchema.pick({ message: true, briefPatch: true }).extend({
      [scope]: z.array(SECTION_ITEMS[scope].extend({ id })).min(1),
    });
  }
  const built = jsonSchemaOf(schema);
  refineSchemas.set(scope, built);
  return built;
}
