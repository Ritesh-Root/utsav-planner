import { readJson, writeJson } from './browserStorage';

export const THEMES = ['system', 'light', 'dark', 'contrast'] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<Theme, 'system'>;

export interface Settings {
  theme: Theme;
  reading: 'standard' | 'simple';
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', reading: 'standard' };

/** Must match the key read by public/theme-init.js before first paint. */
const SETTINGS_KEY = 'utsav:v1:settings';

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** Saved settings, falling back to the defaults for anything missing or unknown. */
export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY);
  const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    theme: isTheme(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    reading: saved.reading === 'simple' ? 'simple' : 'standard',
  };
}

/** Remember the settings in this browser. */
export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

/** The concrete theme for a setting; "system" follows the device's preferences. */
export function resolveTheme(theme: Theme, matches: (query: string) => boolean): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (matches('(prefers-contrast: more)')) return 'contrast';
  return matches('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

/** Put the theme and reading mode on the root element, where the CSS reads them. */
export function applySettings(
  settings: Settings,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = resolveTheme(settings.theme, (query) => window.matchMedia(query).matches);
  root.dataset.reading = settings.reading;
}
