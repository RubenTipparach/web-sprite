import { create } from 'zustand';
import { type Layer, createLayer, cloneLayer } from '../layers/Layer';
import { type RGBA, BLACK, WHITE } from '../utils/color';
import type { BlendMode } from '../layers/blend-modes';

export type ToolType = 'pen' | 'eraser' | 'selection';

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface UndoSnapshot {
  layerId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export interface EditorState {
  // Canvas
  canvasWidth: number;
  canvasHeight: number;

  // Layers
  layers: Layer[];
  activeLayerId: string;

  // Viewport
  viewport: ViewportState;

  // Tool
  activeTool: ToolType;
  brushSize: number;
  pixelPerfect: boolean;
  foregroundColor: RGBA;
  backgroundColor: RGBA;

  // History
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];

  // Render version: incremented when pixel data changes (ImageData is mutable, Zustand won't detect)
  renderVersion: number;

  // Dirty flag
  dirty: boolean;
  fileName: string;

  // Actions: Canvas
  newCanvas: (width: number, height: number) => void;

  // Actions: Layers
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: BlendMode) => void;
  mergeDown: (id: string) => void;

  // Actions: Viewport
  setViewport: (v: Partial<ViewportState>) => void;
  zoomTo: (zoom: number, centerX: number, centerY: number) => void;

  // Actions: Tools
  setTool: (tool: ToolType) => void;
  setBrushSize: (size: number) => void;
  setPixelPerfect: (on: boolean) => void;
  setForegroundColor: (c: RGBA) => void;
  setBackgroundColor: (c: RGBA) => void;
  swapColors: () => void;

  // Actions: History
  pushUndo: (snapshot: UndoSnapshot) => void;
  undo: () => void;
  redo: () => void;

  // Actions: Render
  markDirty: () => void;

  // Actions: File
  setDirty: (dirty: boolean) => void;
  setFileName: (name: string) => void;
  loadLayers: (layers: Layer[], width: number, height: number) => void;

  // Helpers
  getActiveLayer: () => Layer | undefined;
}

const DEFAULT_WIDTH = 32;
const DEFAULT_HEIGHT = 32;

function makeInitialLayer(w: number, h: number): Layer {
  return createLayer(w, h, 'Background');
}

export const useEditorStore = create<EditorState>((set, get) => {
  const initialLayer = makeInitialLayer(DEFAULT_WIDTH, DEFAULT_HEIGHT);

  return {
    canvasWidth: DEFAULT_WIDTH,
    canvasHeight: DEFAULT_HEIGHT,
    layers: [initialLayer],
    activeLayerId: initialLayer.id,
    viewport: { offsetX: 0, offsetY: 0, zoom: 10 },
    activeTool: 'pen',
    brushSize: 1,
    pixelPerfect: true,
    foregroundColor: { ...BLACK },
    backgroundColor: { ...WHITE },
    renderVersion: 0,
    undoStack: [],
    redoStack: [],
    dirty: false,
    fileName: 'untitled.wsprite',

    newCanvas: (width, height) => {
      const layer = createLayer(width, height, 'Background');
      set({
        canvasWidth: width,
        canvasHeight: height,
        layers: [layer],
        activeLayerId: layer.id,
        undoStack: [],
        redoStack: [],
        dirty: false,
        viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
      });
    },

    addLayer: () => {
      const { canvasWidth, canvasHeight, layers, activeLayerId } = get();
      const newLayer = createLayer(canvasWidth, canvasHeight);
      const idx = layers.findIndex(l => l.id === activeLayerId);
      const newLayers = [...layers];
      newLayers.splice(idx + 1, 0, newLayer);
      set({ layers: newLayers, activeLayerId: newLayer.id, dirty: true });
    },

    deleteLayer: (id) => {
      const { layers } = get();
      if (layers.length <= 1) return;
      const idx = layers.findIndex(l => l.id === id);
      if (idx === -1) return;
      const newLayers = layers.filter(l => l.id !== id);
      const newActiveIdx = Math.min(idx, newLayers.length - 1);
      set({ layers: newLayers, activeLayerId: newLayers[newActiveIdx].id, dirty: true });
    },

    duplicateLayer: (id) => {
      const { layers } = get();
      const idx = layers.findIndex(l => l.id === id);
      if (idx === -1) return;
      const dup = cloneLayer(layers[idx]);
      const newLayers = [...layers];
      newLayers.splice(idx + 1, 0, dup);
      set({ layers: newLayers, activeLayerId: dup.id, dirty: true });
    },

    setActiveLayer: (id) => set({ activeLayerId: id }),

    toggleLayerVisibility: (id) => {
      set(s => ({
        layers: s.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l),
      }));
    },

    toggleLayerLock: (id) => {
      set(s => ({
        layers: s.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l),
      }));
    },

    renameLayer: (id, name) => {
      set(s => ({
        layers: s.layers.map(l => l.id === id ? { ...l, name } : l),
        dirty: true,
      }));
    },

    reorderLayer: (fromIndex, toIndex) => {
      const { layers } = get();
      if (fromIndex === toIndex) return;
      const newLayers = [...layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      set({ layers: newLayers, dirty: true });
    },

    setLayerOpacity: (id, opacity) => {
      set(s => ({
        layers: s.layers.map(l => l.id === id ? { ...l, opacity } : l),
        dirty: true,
      }));
    },

    setLayerBlendMode: (id, mode) => {
      set(s => ({
        layers: s.layers.map(l => l.id === id ? { ...l, blendMode: mode } : l),
        dirty: true,
      }));
    },

    mergeDown: (id) => {
      const { layers } = get();
      const idx = layers.findIndex(l => l.id === id);
      if (idx <= 0) return; // can't merge bottom layer
      const top = layers[idx];
      const bottom = layers[idx - 1];
      // Composite top onto bottom
      const w = top.data.width;
      const h = top.data.height;
      const merged = new ImageData(w, h);
      merged.data.set(bottom.data.data);
      const src = top.data.data;
      const dst = merged.data;
      for (let i = 0; i < w * h * 4; i += 4) {
        const sa = src[i + 3];
        if (sa === 0) continue;
        const alpha = sa / 255;
        const invAlpha = 1 - alpha;
        dst[i]     = Math.round(src[i] * alpha + dst[i] * invAlpha);
        dst[i + 1] = Math.round(src[i + 1] * alpha + dst[i + 1] * invAlpha);
        dst[i + 2] = Math.round(src[i + 2] * alpha + dst[i + 2] * invAlpha);
        dst[i + 3] = Math.min(255, Math.round(sa + dst[i + 3] * invAlpha));
      }
      const newBottom = { ...bottom, data: merged };
      const newLayers = layers.filter(l => l.id !== id);
      newLayers[idx - 1] = newBottom;
      set({ layers: newLayers, activeLayerId: newBottom.id, dirty: true });
    },

    setViewport: (v) => set(s => ({ viewport: { ...s.viewport, ...v } })),

    zoomTo: (zoom, centerX, centerY) => {
      const { viewport } = get();
      const ratio = zoom / viewport.zoom;
      set({
        viewport: {
          zoom,
          offsetX: centerX - (centerX - viewport.offsetX) * ratio,
          offsetY: centerY - (centerY - viewport.offsetY) * ratio,
        },
      });
    },

    setTool: (tool) => set({ activeTool: tool }),
    setBrushSize: (size) => set({ brushSize: Math.max(1, size) }),
    setPixelPerfect: (on) => set({ pixelPerfect: on }),
    setForegroundColor: (c) => set({ foregroundColor: c }),
    setBackgroundColor: (c) => set({ backgroundColor: c }),
    swapColors: () => {
      const { foregroundColor, backgroundColor } = get();
      set({ foregroundColor: backgroundColor, backgroundColor: foregroundColor });
    },

    pushUndo: (snapshot) => {
      set(s => ({
        undoStack: [...s.undoStack.slice(-49), snapshot],
        redoStack: [],
        dirty: true,
      }));
    },

    undo: () => {
      const { undoStack, layers } = get();
      if (undoStack.length === 0) return;
      const snapshot = undoStack[undoStack.length - 1];
      const layer = layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      // Save current state as redo
      const redoData = new Uint8ClampedArray(snapshot.before.length);
      const w = layer.data.width;
      for (let dy = 0; dy < snapshot.h; dy++) {
        const srcOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const dstOff = dy * snapshot.w * 4;
        redoData.set(layer.data.data.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      // Restore before
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        layer.data.data.set(snapshot.before.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(s => ({
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { ...snapshot, after: redoData }],
        layers: [...s.layers], // trigger re-render
      }));
    },

    redo: () => {
      const { redoStack, layers } = get();
      if (redoStack.length === 0) return;
      const snapshot = redoStack[redoStack.length - 1];
      const layer = layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      // Restore after
      const w = layer.data.width;
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        layer.data.data.set(snapshot.after.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(s => ({
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot],
        layers: [...s.layers],
      }));
    },

    markDirty: () => set(s => ({ renderVersion: s.renderVersion + 1, dirty: true })),

    setDirty: (dirty) => set({ dirty }),
    setFileName: (name) => set({ fileName: name }),

    loadLayers: (layers, width, height) => {
      set({
        layers,
        canvasWidth: width,
        canvasHeight: height,
        activeLayerId: layers[0]?.id ?? '',
        undoStack: [],
        redoStack: [],
        dirty: false,
        viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
      });
    },

    getActiveLayer: () => {
      const { layers, activeLayerId } = get();
      return layers.find(l => l.id === activeLayerId);
    },
  };
});
