import { create } from 'zustand';

const MOBILE_BREAKPOINT = 768;
const MIN_PANEL = 200;
const MAX_PANEL = 400;

export interface LayoutState {
  isMobile: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  mobileActivePanel: string | null; // 'layers' | 'palette' | 'tools' | null

  updateMobile: () => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setMobileActivePanel: (panel: string | null) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isMobile: typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  leftPanelWidth: 200,
  rightPanelWidth: 220,
  mobileActivePanel: null,

  updateMobile: () => {
    set({ isMobile: window.innerWidth < MOBILE_BREAKPOINT });
  },

  setLeftPanelWidth: (w) => {
    set({ leftPanelWidth: Math.max(MIN_PANEL, Math.min(MAX_PANEL, w)) });
  },

  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: Math.max(160, Math.min(MAX_PANEL, w)) });
  },

  setMobileActivePanel: (panel) => set({ mobileActivePanel: panel }),
}));
