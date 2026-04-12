import { create } from 'zustand';
import { type PaletteInfo, loadBuiltinPalettes } from '../palette/PaletteLoader';
import { type RGBA, hexToRgba } from '../utils/color';

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
  activePaletteSlug: 'sweetie-16',
  loaded: false,

  loadPalettes: async () => {
    const palettes = await loadBuiltinPalettes();
    set({ palettes, loaded: true });
  },

  setActivePalette: (slug) => set({ activePaletteSlug: slug }),

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
