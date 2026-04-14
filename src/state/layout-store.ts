import { create } from 'zustand';

const MOBILE_BREAKPOINT = 768;
const MIN_LEFT = 200;
const MIN_RIGHT = 160;
const MAX_PANEL = 500;
const DEFAULT_LEFT = 200;
const DEFAULT_RIGHT = 220;
const STORAGE_KEY = 'web-sprite-layout';

function loadSavedLayout(): { left: number; right: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        left: Math.max(MIN_LEFT, Math.min(MAX_PANEL, parsed.left ?? DEFAULT_LEFT)),
        right: Math.max(MIN_RIGHT, Math.min(MAX_PANEL, parsed.right ?? DEFAULT_RIGHT)),
      };
    }
  } catch { /* ignore */ }
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
}

function saveLayout(left: number, right: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, right }));
  } catch { /* ignore */ }
}

export interface LayoutState {
  isMobile: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  mobileActivePanel: string | null;

  updateMobile: () => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setMobileActivePanel: (panel: string | null) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => {
  const saved = loadSavedLayout();

  return {
    isMobile: typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
    leftPanelWidth: saved.left,
    rightPanelWidth: saved.right,
    mobileActivePanel: null,

    updateMobile: () => {
      set({ isMobile: window.innerWidth < MOBILE_BREAKPOINT });
    },

    setLeftPanelWidth: (w) => {
      const clamped = Math.max(MIN_LEFT, Math.min(MAX_PANEL, w));
      set({ leftPanelWidth: clamped });
      saveLayout(clamped, get().rightPanelWidth);
    },

    setRightPanelWidth: (w) => {
      const clamped = Math.max(MIN_RIGHT, Math.min(MAX_PANEL, w));
      set({ rightPanelWidth: clamped });
      saveLayout(get().leftPanelWidth, clamped);
    },

    setMobileActivePanel: (panel) => set({ mobileActivePanel: panel }),
  };
});
