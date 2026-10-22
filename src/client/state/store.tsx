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
import { PLANS_KEY, writeJson } from '../browserStorage';
import { useAnnounce } from './announcer';

export interface StoreState {
  plans: Plan[];
  /** Earlier versions of each plan, newest last, for Undo. Kept in memory only. */
  history: Record<string, Plan[]>;
  /** False until saved plans have been read and checked. */
  ready: boolean;
}

export type StoreAction =
  | { type: 'loaded'; plans: Plan[] }
  | { type: 'save'; plan: Plan; undoable: boolean }
  | { type: 'remove'; id: string }
  | { type: 'undo'; id: string }
  | { type: 'replace-all'; plans: Plan[] };

/** Every change to the saved plans, as a pure function for easy testing. */
export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'loaded': {
      // Keep anything made in this session before the saved plans arrived.
      const known = new Set(state.plans.map((p) => p.id));
      return {
        ...state,
        ready: true,
        plans: [...state.plans, ...action.plans.filter((p) => !known.has(p.id))],
      };
    }
    case 'save': {
      const previous = state.plans.find((p) => p.id === action.plan.id);
      const plans = [action.plan, ...state.plans.filter((p) => p.id !== action.plan.id)];
      if (!action.undoable || !previous) return { ...state, plans };
      const past = [...(state.history[action.plan.id] ?? []), previous].slice(-LIMITS.undoDepth);
      return { ...state, plans, history: { ...state.history, [action.plan.id]: past } };
    }
    case 'remove': {
      const { [action.id]: _removed, ...history } = state.history;
      return { ...state, plans: state.plans.filter((p) => p.id !== action.id), history };
    }
    case 'undo': {
      const past = state.history[action.id] ?? [];
      const restored = past.at(-1);
      if (!restored) return state;
      return {
        ...state,
        plans: state.plans.map((p) => (p.id === action.id ? restored : p)),
        history: { ...state.history, [action.id]: past.slice(0, -1) },
      };
    }
    case 'replace-all':
      return { ...state, plans: action.plans, history: {}, ready: true };
  }
}

interface PlanStore {
  plans: Plan[];
  ready: boolean;
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

/** Reading saved plans needs zod; load it after the first screen has painted. */
const loadSavedPlans = () => import('../storage').then((storage) => storage.readPlans());

export function PlanStoreProvider({
  children,
  initialPlans,
}: {
  children: ReactNode;
  /** Plans to start with (tests); when omitted, saved plans load in the background. */
  initialPlans?: Plan[];
}) {
  const announce = useAnnounce();
  const [state, dispatch] = useReducer(storeReducer, undefined, (): StoreState => ({
    plans: initialPlans ?? [],
    history: {},
    ready: initialPlans !== undefined,
  }));

  useEffect(() => {
    if (initialPlans !== undefined) return;
    void loadSavedPlans().then((plans) => {
      dispatch({ type: 'loaded', plans });
    });
  }, [initialPlans]);

  // Write only after a change: writing the list we just loaded could overwrite
  // newer plans saved by another tab in the meantime.
  const lastWritten = useRef<Plan[] | null>(null);
  const pending = useRef<Plan[] | null>(null);
  const flush = useCallback(() => {
    const plans = pending.current;
    if (!plans) return;
    pending.current = null;
    lastWritten.current = plans;
    if (!writeJson(PLANS_KEY, plans)) {
      announce(
        'Utsav couldn’t save in this browser. Download your plans from Settings to keep a copy.',
        'assertive',
      );
    }
  }, [announce]);

  const loadedPlans = useRef<Plan[] | null>(null);
  useEffect(() => {
    if (!state.ready) return undefined;
    if (loadedPlans.current === null) {
      loadedPlans.current = state.plans;
      return undefined;
    }
    if (state.plans === lastWritten.current) return undefined;
    pending.current = state.plans;
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state.plans, state.ready, flush]);

  // Never lose the last edit: write at once when the page is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  // Keep several open tabs in step: another tab's save replaces this tab's list.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PLANS_KEY) return;
      void loadSavedPlans().then((plans) => {
        lastWritten.current = plans;
        dispatch({ type: 'replace-all', plans });
      });
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
      ready: state.ready,
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

/** The saved plans and the actions that change them. */
export function usePlanStore(): PlanStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('usePlanStore must be used inside PlanStoreProvider');
  return store;
}
