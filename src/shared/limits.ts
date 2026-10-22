/**
 * Every bound in the app lives here, so validation, prompts and form `maxLength`
 * attributes can never disagree.
 */
export const LIMITS = {
  titleMax: 80,
  locationMax: 80,
  styleMax: 80,
  notesMax: 1000,
  guestsMin: 1,
  guestsMax: 5000,
  budgetMax: 1_000_000_000,
  horizonDays: 3 * 365,
  weddingDaysMax: 7,
  honoreeAgeMax: 120,
  prioritiesMax: 3,
  dietaryMax: 6,

  instructionMin: 3,
  instructionMax: 500,
  previousInstructionsMax: 3,

  budgetLinesMin: 5,
  budgetLinesMax: 12,
  tasksMin: 8,
  tasksMax: 24,
  vendorsMin: 3,
  vendorsMax: 12,
  questionsMin: 2,
  questionsMax: 4,
  ideasMin: 5,
  ideasMax: 10,
  dayOfMax: 14,
  assumptionsMax: 5,

  /** Lead times the AI may use, in days before the event (negative = after it). */
  daysBeforeMin: -30,
  daysBeforeMax: 3 * 365,

  contingencyMinPct: 5,
  contingencyMaxPct: 15,

  shortText: 80,
  mediumText: 200,
  longText: 400,

  /** Private user-entered vendor fields, kept in the browser only. */
  vendorFieldMax: 120,
  vendorNotesMax: 500,

  importBytesMax: 256 * 1024,
  requestBytesMax: 32 * 1024,
  undoDepth: 20,
} as const;

export const BASIS_POINTS = 10_000;
