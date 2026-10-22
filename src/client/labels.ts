import type {
  CostTier,
  Dietary,
  EventType,
  IdeaCategory,
  Priority,
  RefineScope,
  TaskPriority,
  VendorStatus,
  VenuePreference,
} from '../shared/schemas.js';
import type { TaskStatus } from '../shared/timeline.js';

/** Words people see for each value the data uses. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  community: 'Community event',
};

export const VENUE_LABELS: Record<VenuePreference, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  either: 'No preference',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  food: 'Food',
  decor: 'Decor',
  photography: 'Photos',
  entertainment: 'Entertainment',
  'guest-comfort': 'Guest comfort',
  'saving-money': 'Saving money',
  sustainability: 'Low waste',
  traditions: 'Traditions',
};

export const DIETARY_LABELS: Record<Dietary, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
  halal: 'Halal',
  'gluten-free': 'Gluten-free',
  'nut-free': 'Nut-free',
};

export const IDEA_CATEGORY_LABELS: Record<IdeaCategory, string> = {
  theme: 'Theme',
  decor: 'Decor',
  food: 'Food',
  activity: 'Activity',
  culture: 'Culture',
  accessibility: 'Accessibility',
  sustainability: 'Low waste',
  keepsake: 'Keepsake',
};

export const COST_TIER_LABELS: Record<CostTier, string> = {
  low: 'Low cost',
  medium: 'Medium cost',
  high: 'High cost',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export const SCOPE_LABELS: Record<RefineScope, string> = {
  all: 'The whole plan',
  budget: 'Budget',
  timeline: 'Timeline',
  vendors: 'Vendors',
  ideas: 'Ideas',
  dayOf: 'Run sheet',
};

/** Ready-made follow-ups for the refine dialog, per scope. */
export const SUGGESTIONS: Record<RefineScope, string[]> = {
  all: [
    'Make the whole plan more eco-friendly',
    'We now expect 20% more guests',
    'Help us cut costs by 15%',
  ],
  budget: [
    'Spend more on food and less on decor',
    'Cut the budget by 10% without losing the essentials',
  ],
  timeline: [
    'We only have weekends free for tasks',
    'Add tasks for guests travelling from out of town',
  ],
  vendors: ['Add a vendor for live music', 'We will handle decor ourselves'],
  ideas: ['More ideas like the ones I saved', 'Ideas that suit elderly guests'],
  dayOf: ['Start the event an hour later', 'Add a 30-minute break for speeches'],
};

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  done: 'Done',
  overdue: 'Overdue',
  'do-now': 'Do now',
  'due-soon': 'Due this week',
  upcoming: 'Upcoming',
};

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  'not-started': 'Not started',
  researching: 'Researching',
  contacted: 'Contacted',
  quoted: 'Quote received',
  booked: 'Booked',
  'not-needed': 'Not needed',
};
