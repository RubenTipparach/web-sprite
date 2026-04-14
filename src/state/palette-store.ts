import { create } from 'zustand';
import { type PaletteInfo, loadBuiltinPalettes } from '../palette/PaletteLoader';
import { type RGBA, hexToRgba } from '../utils/color';

const PALETTE_STORAGE_KEY = 'web-sprite-palette';
const DEFAULT_PALETTE = 'endesga-32';

function getSavedPalette(): string {
  try {
    return localStorage.getItem(PALETTE_STORAGE_KEY) || DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

function savePaletteChoice(slug: string) {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, slug);
  } catch {
    // ignore
  }
}

export interface PaletteState {
  palettes: PaletteInfo[];
  activePaletteSlug: string;
  loaded: boolean;

  loadPalettes: () => Promise<void>;
  setActivePalette: (slug: string) => void;
  addCustomPalette: (palette: PaletteInfo) => void;
  getActiveColors: () => RGBA[];
}

export const usePaletteStore = create<PaletteState>((set, get) => ({
  palettes: [],
  activePaletteSlug: getSavedPalette(),
  loaded: false,

  loadPalettes: async () => {
    const palettes = await loadBuiltinPalettes();
    const { activePaletteSlug } = get();
    // If saved palette doesn't exist in the list, fall back to default
    const exists = palettes.some(p => p.slug === activePaletteSlug);
    set({
      palettes,
      loaded: true,
      activePaletteSlug: exists ? activePaletteSlug : DEFAULT_PALETTE,
    });
  },

  setActivePalette: (slug) => {
    savePaletteChoice(slug);
    set({ activePaletteSlug: slug });
  },

  addCustomPalette: (palette) => {
    set(s => ({ palettes: [...s.palettes, palette] }));
  },

  getActiveColors: () => {
    const { palettes, activePaletteSlug } = get();
    const pal = palettes.find(p => p.slug === activePaletteSlug);
    if (!pal) return [];
    return pal.colors.map(hex => hexToRgba(hex));
  },
}));
