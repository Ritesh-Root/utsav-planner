import type { Plan, RefineScope } from '../../shared/schemas.js';
import type { PlanTab } from '../router';

export interface UpdateOptions {
  /** Offer Undo for this change. */
  undoable?: boolean;
  /** Read out to screen readers after the change. */
  announcement?: string;
}

export interface PanelProps {
  plan: Plan;
  today: string;
  update: (next: Plan, options?: UpdateOptions) => void;
  refine: (scope: RefineScope, instruction?: string) => void;
  goTo: (tab: PlanTab) => void;
}
