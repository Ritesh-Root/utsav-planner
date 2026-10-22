/**
 * Plans: building one from a draft (build), changes people make (edits), merging an
 * AI refinement (refine) and describing what changed (diff).
 */
export type { IdFactory } from './plan/build.js';
export { randomId, finalizePlan } from './plan/build.js';
export type { VendorChanges } from './plan/edits.js';
export {
  applyBriefChange,
  setLineAmount,
  unlockLine,
  setLineActual,
  applyGuestChange,
  addCustomTask,
  toggleTaskDone,
  removeTask,
  updateVendor,
  addCustomVendor,
  removeVendor,
  toggleIdeaSaved,
  addCustomIdea,
  addBudgetLine,
  removeBudgetLine,
  addDayOfItem,
  removeDayOfItem,
  planIsFull,
} from './plan/edits.js';
export { toRefineContext, mergeRefinement } from './plan/refine.js';
export { diffPlans, describeDiff } from './plan/diff.js';
