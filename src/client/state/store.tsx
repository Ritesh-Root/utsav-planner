import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import { LIMITS } from '../../shared/limits.js';
import type { Plan } from '../../shared/schemas.js';
import { PLANS_KEY, readPlans, writePlans } from '../storage';

export interface StoreState {
  plans: Plan[];
  /** Earlier versions of each plan, newest last, for Undo. Kept in memory only. */
  history: Record<string, Plan[]>;
}

export type StoreAction =
  | { type: 'save'; plan: Plan; undoable: boolean }
  | { type: 'remove'; id: string }
  | { type: 'undo'; id: string }
  | { type: 'replace-all'; plans: Plan[] };

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'save': {
      const previous = state.plans.find((p) => p.id === action.plan.id);
      const plans = [action.plan, ...state.plans.filter((p) => p.id !== action.plan.id)];
      if (!action.undoable || !previous) return { ...state, plans };
      const past = [...(state.history[action.plan.id] ?? []), previous].slice(-LIMITS.undoDepth);
      return { plans, history: { ...state.history, [action.plan.id]: past } };
    }
    case 'remove': {
      const { [action.id]: _removed, ...history } = state.history;
      return { plans: state.plans.filter((p) => p.id !== action.id), history };
    }
    case 'undo': {
      const past = state.history[action.id] ?? [];
      const restored = past.at(-1);
      if (!restored) return state;
      return {
        plans: state.plans.map((p) => (p.id === action.id ? restored : p)),
        history: { ...state.history, [action.id]: past.slice(0, -1) },
      };
    }
    case 'replace-all':
      return { plans: action.plans, history: {} };
  }
}

interface PlanStore {
  plans: Plan[];
  getPlan: (id: string) => Plan | undefined;
  savePlan: (plan: Plan, options?: { undoable?: boolean }) => void;
  removePlan: (id: string) => void;
  undo: (id: string) => void;
  canUndo: (id: string) => boolean;
  replaceAll: (plans: Plan[]) => void;
}

const StoreContext = createContext<PlanStore | null>(null);

/** How long to wait after the last edit before writing to localStorage. */
const SAVE_DELAY_MS = 300;

export function PlanStoreProvider({
  children,
  initialPlans,
}: {
  children: ReactNode;
  initialPlans?: Plan[];
}) {
  const [state, dispatch] = useReducer(storeReducer, undefined, (): StoreState => ({
    plans: initialPlans ?? readPlans(),
    history: {},
  }));

  // Write only after a change: writing the initial list back could overwrite newer
  // plans saved by another tab in the meantime.
  const loaded = useRef(state.plans);
  useEffect(() => {
    if (state.plans === loaded.current) return undefined;
    const timer = window.setTimeout(() => writePlans(state.plans), SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state.plans]);

  // Keep several open tabs in step: another tab's save replaces this tab's list.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PLANS_KEY) return;
      const plans = readPlans();
      loaded.current = plans;
      dispatch({ type: 'replace-all', plans });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const savePlan = useCallback((plan: Plan, options: { undoable?: boolean } = {}) => {
    dispatch({ type: 'save', plan, undoable: options.undoable ?? false });
  }, []);
  const removePlan = useCallback((id: string) => {
    dispatch({ type: 'remove', id });
  }, []);
  const undo = useCallback((id: string) => {
    dispatch({ type: 'undo', id });
  }, []);
  const replaceAll = useCallback((plans: Plan[]) => {
    dispatch({ type: 'replace-all', plans });
  }, []);

  const value = useMemo<PlanStore>(
    () => ({
      plans: state.plans,
      getPlan: (id) => state.plans.find((p) => p.id === id),
      savePlan,
      removePlan,
      undo,
      canUndo: (id) => (state.history[id]?.length ?? 0) > 0,
      replaceAll,
    }),
    [state, savePlan, removePlan, undo, replaceAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function usePlanStore(): PlanStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('usePlanStore must be used inside PlanStoreProvider');
  return store;
}
