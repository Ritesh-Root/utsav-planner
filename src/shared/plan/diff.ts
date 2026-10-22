import type { Brief, Plan } from '../schemas.js';

// ---------------------------------------------------------------------------
// Describing changes
// ---------------------------------------------------------------------------

interface SectionDiff {
  added: number;
  removed: number;
  changed: number;
}

export interface PlanDiff {
  budget: SectionDiff;
  tasks: SectionDiff;
  vendors: SectionDiff;
  ideas: SectionDiff;
  dayOf: SectionDiff;
  brief: (keyof Brief)[];
}

function diffSection<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  fingerprint: (item: T) => string,
): SectionDiff {
  const old = new Map(before.map((item) => [item.id, fingerprint(item)]));
  const fresh = new Set(after.map((item) => item.id));
  let added = 0;
  let changed = 0;
  for (const item of after) {
    const previous = old.get(item.id);
    if (previous === undefined) added += 1;
    else if (previous !== fingerprint(item)) changed += 1;
  }
  const removed = before.filter((item) => !fresh.has(item.id)).length;
  return { added, removed, changed };
}

/** Counts of what was added, removed or changed in each section, and which brief fields changed. */
export function diffPlans(before: Plan, after: Plan): PlanDiff {
  const briefKeys = Object.keys(after.brief) as (keyof Brief)[];
  return {
    budget: diffSection(before.budget, after.budget, (l) =>
      [l.key, l.category, l.amount, l.perGuest].join('|'),
    ),
    tasks: diffSection(before.tasks, after.tasks, (t) =>
      [t.title, t.details, t.due, t.priority].join('|'),
    ),
    vendors: diffSection(before.vendors, after.vendors, (v) =>
      [v.category, v.why, v.bookBy, v.questions.join('/')].join('|'),
    ),
    ideas: diffSection(before.ideas, after.ideas, (i) =>
      [i.category, i.title, i.description, i.costTier].join('|'),
    ),
    dayOf: diffSection(before.dayOf, after.dayOf, (d) => [d.day, d.startMinute, d.title].join('|')),
    brief: briefKeys.filter(
      (key) => JSON.stringify(before.brief[key]) !== JSON.stringify(after.brief[key]),
    ),
  };
}

const SECTION_NAMES: Record<Exclude<keyof PlanDiff, 'brief'>, string> = {
  budget: 'Budget',
  tasks: 'Timeline',
  vendors: 'Vendors',
  ideas: 'Ideas',
  dayOf: 'Run sheet',
};

/** e.g. "Budget: 2 updated, 1 added. Ideas: 3 added." */
export function describeDiff(diff: PlanDiff): string {
  const parts: string[] = [];
  for (const [section, name] of Object.entries(SECTION_NAMES) as [
    keyof typeof SECTION_NAMES,
    string,
  ][]) {
    const { added, removed, changed } = diff[section];
    const bits = [
      changed > 0 ? `${changed} updated` : '',
      added > 0 ? `${added} added` : '',
      removed > 0 ? `${removed} removed` : '',
    ].filter(Boolean);
    if (bits.length > 0) parts.push(`${name}: ${bits.join(', ')}.`);
  }
  if (diff.brief.length > 0) parts.push(`Event details changed: ${diff.brief.join(', ')}.`);
  return parts.length > 0 ? parts.join(' ') : 'No changes.';
}
