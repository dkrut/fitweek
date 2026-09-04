import type { Theme } from '@shared/index';

const STORAGE_KEY = 'fitweek-theme';

/**
 * data-theme is always set on <html>, even for the system mode, so the CSS
 * dark: variant works without a duplicate media query.
 */
export function applyTheme(theme: Theme): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  document.documentElement.dataset['theme'] = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0d0f14' : '#f6f7f9');

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode, not critical */
  }
}

export function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* ignored */
  }
  return 'system';
}

/** Applied before the first render so the light theme never flashes. */
export function initTheme(): Theme {
  const theme = readStoredTheme();
  applyTheme(theme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readStoredTheme() === 'system') applyTheme('system');
  });

  return theme;
}
