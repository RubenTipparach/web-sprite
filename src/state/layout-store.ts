import { create } from 'zustand';

const MOBILE_BREAKPOINT = 768;
const MIN_LEFT = 200;
const MIN_RIGHT = 160;
const MAX_PANEL = 500;
const DEFAULT_LEFT = 200;
const DEFAULT_RIGHT = 220;
const STORAGE_KEY = 'web-sprite-layout';

const UI_SCALE_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4];
const DEFAULT_UI_SCALE = 2;
const MIN_UI_SCALE = UI_SCALE_STEPS[0];
const MAX_UI_SCALE = UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1];

function loadSavedLayout(): { left: number; right: number; uiScale: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        left: Math.max(MIN_LEFT, Math.min(MAX_PANEL, parsed.left ?? DEFAULT_LEFT)),
        right: Math.max(MIN_RIGHT, Math.min(MAX_PANEL, parsed.right ?? DEFAULT_RIGHT)),
        uiScale: Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, parsed.uiScale ?? DEFAULT_UI_SCALE)),
      };
    }
  } catch { /* ignore */ }
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT, uiScale: DEFAULT_UI_SCALE };
}

function saveLayout(left: number, right: number, uiScale: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, right, uiScale }));
  } catch { /* ignore */ }
}

export interface LayoutState {
  isMobile: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  mobileActivePanel: string | null;
  uiScale: number;

  updateMobile: () => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setMobileActivePanel: (panel: string | null) => void;
  setUiScale: (scale: number) => void;
  stepUiScale: (direction: 1 | -1) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => {
  const saved = loadSavedLayout();

  return {
    isMobile: typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
    leftPanelWidth: saved.left,
    rightPanelWidth: saved.right,
    mobileActivePanel: null,
    uiScale: saved.uiScale,

    updateMobile: () => {
      set({ isMobile: window.innerWidth < MOBILE_BREAKPOINT });
    },

    setLeftPanelWidth: (w) => {
      const clamped = Math.max(MIN_LEFT, Math.min(MAX_PANEL, w));
      set({ leftPanelWidth: clamped });
      saveLayout(clamped, get().rightPanelWidth, get().uiScale);
    },

    setRightPanelWidth: (w) => {
      const clamped = Math.max(MIN_RIGHT, Math.min(MAX_PANEL, w));
      set({ rightPanelWidth: clamped });
      saveLayout(get().leftPanelWidth, clamped, get().uiScale);
    },

    setMobileActivePanel: (panel) => set({ mobileActivePanel: panel }),

    setUiScale: (scale) => {
      const clamped = Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, scale));
      set({ uiScale: clamped });
      saveLayout(get().leftPanelWidth, get().rightPanelWidth, clamped);
    },

    stepUiScale: (direction) => {
      const current = get().uiScale;
      const next = direction > 0
        ? (UI_SCALE_STEPS.find(s => s > current + 0.001) ?? MAX_UI_SCALE)
        : ([...UI_SCALE_STEPS].reverse().find(s => s < current - 0.001) ?? MIN_UI_SCALE);
      set({ uiScale: next });
      saveLayout(get().leftPanelWidth, get().rightPanelWidth, next);
    },
  };
});
