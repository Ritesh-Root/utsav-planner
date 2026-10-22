import type { Dispatch, ReactNode, RefObject } from 'react';
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
import { PLANS_KEY, writePlans } from '../browserStorage';
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

/** Same plans in the same order (the objects themselves, not copies). */
function sameList(a: readonly Plan[], b: readonly Plan[]): boolean {
  return a.length === b.length && a.every((plan, i) => plan === b[i]);
}

/** Reading saved plans needs zod; load it after the first screen has painted. */
const loadSavedPlans = () => import('../storage').then((storage) => storage.readPlans());

interface SaveQueue {
  /** The list this tab last wrote, or last read from another tab's save. */
  lastWrittenRef: RefObject<Plan[] | null>;
  /** A list waiting to be written. */
  pendingRef: RefObject<Plan[] | null>;
  /** Write the pending list now. */
  flush: () => void;
}

/** Writes to localStorage, at once when the page is hidden or closed so no edit is lost. */
function useSaveQueue(): SaveQueue {
  const announce = useAnnounce();
  const lastWrittenRef = useRef<Plan[] | null>(null);
  const pendingRef = useRef<Plan[] | null>(null);
  const flush = useCallback(() => {
    const plans = pendingRef.current;
    if (!plans) return;
    pendingRef.current = null;
    lastWrittenRef.current = plans;
    if (!writePlans(plans)) {
      announce(
        'Utsav couldn’t save in this browser. Download your plans from Settings to keep a copy.',
        'assertive',
      );
    }
  }, [announce]);

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

  return useMemo(() => ({ lastWrittenRef, pendingRef, flush }), [flush]);
}

/**
 * Queue a write shortly after each change. Never write the list just loaded: that
 * could overwrite newer plans saved by another tab in the meantime.
 */
function useSaveOnChange(
  state: StoreState,
  baselineRef: RefObject<Plan[] | null>,
  { lastWrittenRef, pendingRef, flush }: SaveQueue,
) {
  const startedRef = useRef(false);
  useEffect(() => {
    if (!state.ready) return undefined;
    if (!startedRef.current) {
      startedRef.current = true;
      // Skip the write only when nothing was made or imported while saved plans loaded.
      const saved = baselineRef.current;
      if (saved && sameList(state.plans, saved)) return undefined;
    }
    if (state.plans === lastWrittenRef.current) {
      pendingRef.current = null;
      return undefined;
    }
    pendingRef.current = state.plans;
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state.plans, state.ready, baselineRef, lastWrittenRef, pendingRef, flush]);
}

/** Keep several open tabs in step: another tab's save replaces this tab's list. */
function useOtherTabs(dispatch: Dispatch<StoreAction>, { lastWrittenRef, pendingRef }: SaveQueue) {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PLANS_KEY) return;
      void loadSavedPlans().then((plans) => {
        // The other tab's list is now the newest: drop any write this tab still had queued.
        pendingRef.current = null;
        lastWrittenRef.current = plans;
        dispatch({ type: 'replace-all', plans });
      });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [dispatch, lastWrittenRef, pendingRef]);
}

/** The store's actions; each is stable, so components using them don't re-render needlessly. */
function useStoreActions(dispatch: Dispatch<StoreAction>) {
  return useMemo(
    () => ({
      savePlan: (plan: Plan, options: { undoable?: boolean } = {}) => {
        dispatch({ type: 'save', plan, undoable: options.undoable ?? false });
      },
      removePlan: (id: string) => {
        dispatch({ type: 'remove', id });
      },
      undo: (id: string) => {
        dispatch({ type: 'undo', id });
      },
      replaceAll: (plans: Plan[]) => {
        dispatch({ type: 'replace-all', plans });
      },
    }),
    [dispatch],
  );
}

export function PlanStoreProvider({
  children,
  initialPlans,
}: {
  children: ReactNode;
  /** Plans to start with (tests); when omitted, saved plans load in the background. */
  initialPlans?: Plan[];
}) {
  const [state, dispatch] = useReducer(storeReducer, undefined, (): StoreState => ({
    plans: initialPlans ?? [],
    history: {},
    ready: initialPlans !== undefined,
  }));

  // What storage held when this tab started: the list that needs no writing back.
  const baselineRef = useRef<Plan[] | null>(initialPlans ?? null);
  useEffect(() => {
    if (initialPlans !== undefined) return;
    void loadSavedPlans().then((plans) => {
      baselineRef.current = plans;
      dispatch({ type: 'loaded', plans });
    });
  }, [initialPlans]);

  const queue = useSaveQueue();
  useSaveOnChange(state, baselineRef, queue);
  useOtherTabs(dispatch, queue);
  const actions = useStoreActions(dispatch);

  const value = useMemo<PlanStore>(
    () => ({
      ...actions,
      plans: state.plans,
      ready: state.ready,
      getPlan: (id) => state.plans.find((p) => p.id === id),
      canUndo: (id) => (state.history[id]?.length ?? 0) > 0,
    }),
    [state, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The saved plans and the actions that change them. */
export function usePlanStore(): PlanStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('usePlanStore must be used inside PlanStoreProvider');
  return store;
}
