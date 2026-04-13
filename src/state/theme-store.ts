import { create } from 'zustand';

export type ThemeName = 'dark' | 'win95' | 'light';

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const STORAGE_KEY = 'web-sprite-theme';

function loadTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'win95' || saved === 'light') return saved;
  } catch { /* ignore */ }
  return 'dark';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: loadTheme(),
  setTheme: (t) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    set({ theme: t });
  },
}));

export const THEMES: Record<ThemeName, Record<string, string>> = {
  dark: {
    '--bg-app': '#1e1e1e',
    '--bg-panel': '#2b2b2b',
    '--bg-panel-alt': '#333',
    '--bg-input': '#3c3c3c',
    '--bg-hover': '#444',
    '--bg-active': '#505060',
    '--border': '#555',
    '--text': '#ddd',
    '--text-dim': '#999',
    '--accent': '#6c9bd2',
    '--accent-hover': '#7db0e0',
    '--danger': '#d44',
    '--radius': '3px',
    '--font-size': '12px',
  },
  win95: {
    '--bg-app': '#008080',
    '--bg-panel': '#c0c0c0',
    '--bg-panel-alt': '#c0c0c0',
    '--bg-input': '#fff',
    '--bg-hover': '#000080',
    '--bg-active': '#000080',
    '--border': '#808080',
    '--text': '#000',
    '--text-dim': '#444',
    '--accent': '#000080',
    '--accent-hover': '#0000aa',
    '--danger': '#c00',
    '--radius': '0px',
    '--font-size': '12px',
  },
  light: {
    '--bg-app': '#e8e8e8',
    '--bg-panel': '#f5f5f5',
    '--bg-panel-alt': '#eee',
    '--bg-input': '#fff',
    '--bg-hover': '#dde4ee',
    '--bg-active': '#c8d8f0',
    '--border': '#bbb',
    '--text': '#222',
    '--text-dim': '#777',
    '--accent': '#3b7dd8',
    '--accent-hover': '#4a90e2',
    '--danger': '#d44',
    '--radius': '3px',
    '--font-size': '12px',
  },
};
