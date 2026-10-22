import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Politeness = 'polite' | 'assertive';
type Announce = (message: string, politeness?: Politeness) => void;

const AnnouncerContext = createContext<Announce>(() => undefined);

/**
 * Two visually hidden live regions: polite for progress ("Plan ready"),
 * assertive for errors. Clearing first lets the same message be read twice.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Record<Politeness, string>>({
    polite: '',
    assertive: '',
  });
  const timer = useRef<number | undefined>(undefined);

  const announce = useCallback<Announce>((message, politeness = 'polite') => {
    setMessages((current) => ({ ...current, [politeness]: '' }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setMessages((current) => ({ ...current, [politeness]: message }));
    }, 50);
  }, []);

  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite">
        {messages.polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {messages.assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
