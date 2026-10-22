import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Settings } from '../settings';
import { applySettings, loadSettings, saveSettings } from '../settings';

interface SettingsContextValue {
  settings: Settings;
  update: (changes: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
    if (settings.theme !== 'system') return undefined;
    // Follow the device when it switches between light, dark and high contrast.
    const queries = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'].map((q) =>
      window.matchMedia(q),
    );
    const onChange = () => {
      applySettings(settings);
    };
    queries.forEach((q) => {
      q.addEventListener('change', onChange);
    });
    return () => {
      queries.forEach((q) => {
        q.removeEventListener('change', onChange);
      });
    };
  }, [settings]);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }));
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
