'use client';

export type ThemePreset = 'default' | 'tangerine' | 'soft-pop' | 'brutalist';
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_PRESETS: { value: ThemePreset; label: string; color: string }[] = [
  { value: 'default', label: 'Neutral (Default)', color: '#09090b' },
  { value: 'tangerine', label: 'Tangerine', color: '#f97316' },
  { value: 'soft-pop', label: 'Soft Pop', color: '#a855f7' },
  { value: 'brutalist', label: 'Neo Brutalism', color: '#e11d48' },
];

export function applyThemePreset(preset: ThemePreset): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme-preset', preset);
  try {
    localStorage.setItem('invictus.theme_preset', preset);
  } catch {}
}

export function getSavedThemePreset(): ThemePreset {
  if (typeof window === 'undefined') return 'default';
  try {
    const p = localStorage.getItem('invictus.theme_preset') as ThemePreset;
    if (['default', 'tangerine', 'soft-pop', 'brutalist'].includes(p)) return p;
  } catch {}
  return 'default';
}
