import { create } from 'zustand';
import { type Layer, createLayer, cloneLayer } from '../layers/Layer';
import { type RGBA, BLACK, WHITE } from '../utils/color';
import type { BlendMode } from '../layers/blend-modes';

export type ToolType = 'pen' | 'line' | 'rect' | 'circle' | 'fill' | 'colorReplace' | 'eraser' | 'selection';

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

export interface SymmetryState {
  xEnabled: boolean;
  yEnabled: boolean;
  xAxis: number;
  yAxis: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloatingSelection {
  data: ImageData;
  x: number;
  y: number;
}

/** Per-document state — one per tab. */
export interface DocumentState {
  id: string;
  fileName: string;
  canvasWidth: number;
  canvasHeight: number;
  layers: Layer[];
  activeLayerId: string;
  viewport: ViewportState;
  symmetry: SymmetryState;
  selection: SelectionRect | null;
  floating: FloatingSelection | null;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  renderVersion: number;
  dirty: boolean;
}

let docIdCounter = 1;

function createDocument(width: number, height: number, name?: string): DocumentState {
  const layer = createLayer(width, height, 'Background');
  return {
    id: `doc-${docIdCounter++}`,
    fileName: name ?? 'untitled.wsprite',
    canvasWidth: width,
    canvasHeight: height,
    layers: [layer],
    activeLayerId: layer.id,
    viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
    symmetry: { xEnabled: false, yEnabled: false, xAxis: width / 2, yAxis: height / 2 },
    selection: null,
    floating: null,
    undoStack: [],
    redoStack: [],
    renderVersion: 0,
    dirty: false,
  };
}

export interface EditorState {
  // Multi-document tabs
  documents: DocumentState[];
  activeDocId: string;

  // Tool settings (shared across documents)
  activeTool: ToolType;
  brushSize: number;
  pixelPerfect: boolean;
  foregroundColor: RGBA;
  backgroundColor: RGBA;
  clipboard: ImageData | null;

  // Convenience getters (derived from active doc)
  canvasWidth: number;
  canvasHeight: number;
  layers: Layer[];
  activeLayerId: string;
  viewport: ViewportState;
  symmetry: SymmetryState;
  selection: SelectionRect | null;
  floating: FloatingSelection | null;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  renderVersion: number;
  dirty: boolean;
  fileName: string;

  // Actions: Tabs
  newCanvas: (width: number, height: number) => void;
  addTab: (width: number, height: number, name?: string) => void;
  closeTab: (docId: string) => void;
  switchTab: (docId: string) => void;

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
  setSymmetryX: (enabled: boolean) => void;
  setSymmetryY: (enabled: boolean) => void;
  setSymmetryXAxis: (pos: number) => void;
  setSymmetryYAxis: (pos: number) => void;

  // Actions: Selection
  setSelection: (sel: SelectionRect | null) => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  liftSelection: () => void;
  dropFloating: () => void;
  moveFloating: (dx: number, dy: number) => void;
  deleteSelection: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  clearActiveLayer: () => void;

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

/** Update the active document in the documents array. */
function updateDoc(state: EditorState, patch: Partial<DocumentState>): Partial<EditorState> {
  const docs = state.documents.map(d =>
    d.id === state.activeDocId ? { ...d, ...patch } : d
  );
  const active = docs.find(d => d.id === state.activeDocId)!;
  return {
    documents: docs,
    // Sync convenience fields
    canvasWidth: active.canvasWidth,
    canvasHeight: active.canvasHeight,
    layers: active.layers,
    activeLayerId: active.activeLayerId,
    viewport: active.viewport,
    symmetry: active.symmetry,
    selection: active.selection,
    floating: active.floating,
    undoStack: active.undoStack,
    redoStack: active.redoStack,
    renderVersion: active.renderVersion,
    dirty: active.dirty,
    fileName: active.fileName,
  };
}

function syncFromDoc(doc: DocumentState) {
  return {
    canvasWidth: doc.canvasWidth,
    canvasHeight: doc.canvasHeight,
    layers: doc.layers,
    activeLayerId: doc.activeLayerId,
    viewport: doc.viewport,
    symmetry: doc.symmetry,
    selection: doc.selection,
    floating: doc.floating,
    undoStack: doc.undoStack,
    redoStack: doc.redoStack,
    renderVersion: doc.renderVersion,
    dirty: doc.dirty,
    fileName: doc.fileName,
  };
}

const DEFAULT_WIDTH = 32;
const DEFAULT_HEIGHT = 32;

export const useEditorStore = create<EditorState>((set, get) => {
  const initialDoc = createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT);

  return {
    documents: [initialDoc],
    activeDocId: initialDoc.id,

    activeTool: 'pen',
    brushSize: 1,
    pixelPerfect: true,
    foregroundColor: { ...BLACK },
    backgroundColor: { ...WHITE },
    clipboard: null,

    // Sync'd from active doc
    ...syncFromDoc(initialDoc),

    // Tab actions
    newCanvas: (width, height) => {
      const doc = createDocument(width, height);
      set(s => ({
        documents: s.documents.map(d => d.id === s.activeDocId ? doc : d),
        activeDocId: doc.id,
        ...syncFromDoc(doc),
      }));
    },

    addTab: (width, height, name) => {
      const doc = createDocument(width, height, name);
      set(s => ({
        documents: [...s.documents, doc],
        activeDocId: doc.id,
        ...syncFromDoc(doc),
      }));
    },

    closeTab: (docId) => {
      const { documents, activeDocId } = get();
      if (documents.length <= 1) return; // can't close last tab
      const remaining = documents.filter(d => d.id !== docId);
      const newActive = docId === activeDocId
        ? remaining[Math.min(documents.findIndex(d => d.id === docId), remaining.length - 1)]
        : remaining.find(d => d.id === activeDocId)!;
      set({
        documents: remaining,
        activeDocId: newActive.id,
        ...syncFromDoc(newActive),
      });
    },

    switchTab: (docId) => {
      const { documents } = get();
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;
      set({ activeDocId: docId, ...syncFromDoc(doc) });
    },

    // Layer actions — all visual changes must bump renderVersion
    addLayer: () => {
      const s = get();
      const layer = createLayer(s.canvasWidth, s.canvasHeight);
      const idx = s.layers.findIndex(l => l.id === s.activeLayerId);
      const newLayers = [...s.layers];
      newLayers.splice(idx + 1, 0, layer);
      set(updateDoc(s, { layers: newLayers, activeLayerId: layer.id, dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    deleteLayer: (id) => {
      const s = get();
      if (s.layers.length <= 1) return;
      const idx = s.layers.findIndex(l => l.id === id);
      if (idx === -1) return;
      const newLayers = s.layers.filter(l => l.id !== id);
      const newActiveIdx = Math.min(idx, newLayers.length - 1);
      set(updateDoc(s, { layers: newLayers, activeLayerId: newLayers[newActiveIdx].id, dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    duplicateLayer: (id) => {
      const s = get();
      const idx = s.layers.findIndex(l => l.id === id);
      if (idx === -1) return;
      const dup = cloneLayer(s.layers[idx]);
      const newLayers = [...s.layers];
      newLayers.splice(idx + 1, 0, dup);
      set(updateDoc(s, { layers: newLayers, activeLayerId: dup.id, dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    setActiveLayer: (id) => set(s => updateDoc(s, { activeLayerId: id })),

    toggleLayerVisibility: (id) => {
      const s = get();
      set(updateDoc(s, {
        layers: s.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l),
        renderVersion: s.renderVersion + 1,
      }));
    },

    toggleLayerLock: (id) => {
      const s = get();
      set(updateDoc(s, { layers: s.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l) }));
    },

    renameLayer: (id, name) => {
      const s = get();
      set(updateDoc(s, { layers: s.layers.map(l => l.id === id ? { ...l, name } : l), dirty: true }));
    },

    reorderLayer: (fromIndex, toIndex) => {
      const s = get();
      if (fromIndex === toIndex) return;
      const newLayers = [...s.layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      set(updateDoc(s, { layers: newLayers, dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    setLayerOpacity: (id, opacity) => {
      const s = get();
      set(updateDoc(s, { layers: s.layers.map(l => l.id === id ? { ...l, opacity } : l), dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    setLayerBlendMode: (id, mode) => {
      const s = get();
      set(updateDoc(s, { layers: s.layers.map(l => l.id === id ? { ...l, blendMode: mode } : l), dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    mergeDown: (id) => {
      const s = get();
      const idx = s.layers.findIndex(l => l.id === id);
      if (idx <= 0) return;
      const top = s.layers[idx];
      const bottom = s.layers[idx - 1];
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
      const newLayers = s.layers.filter(l => l.id !== id);
      newLayers[idx - 1] = newBottom;
      set(updateDoc(s, { layers: newLayers, activeLayerId: newBottom.id, dirty: true, renderVersion: s.renderVersion + 1 }));
    },

    // Viewport
    setViewport: (v) => {
      const s = get();
      set(updateDoc(s, { viewport: { ...s.viewport, ...v } }));
    },

    zoomTo: (zoom, centerX, centerY) => {
      const s = get();
      const vp = s.viewport;
      const ratio = zoom / vp.zoom;
      set(updateDoc(s, {
        viewport: {
          zoom,
          offsetX: centerX - (centerX - vp.offsetX) * ratio,
          offsetY: centerY - (centerY - vp.offsetY) * ratio,
        },
      }));
    },

    // Tools (shared)
    setTool: (tool) => set({ activeTool: tool }),
    setBrushSize: (size) => set({ brushSize: Math.max(1, size) }),
    setPixelPerfect: (on) => set({ pixelPerfect: on }),

    setSymmetryX: (enabled) => {
      const s = get();
      set(updateDoc(s, { symmetry: { ...s.symmetry, xEnabled: enabled } }));
    },
    setSymmetryY: (enabled) => {
      const s = get();
      set(updateDoc(s, { symmetry: { ...s.symmetry, yEnabled: enabled } }));
    },
    setSymmetryXAxis: (pos) => {
      const s = get();
      set(updateDoc(s, { symmetry: { ...s.symmetry, xAxis: pos } }));
    },
    setSymmetryYAxis: (pos) => {
      const s = get();
      set(updateDoc(s, { symmetry: { ...s.symmetry, yAxis: pos } }));
    },

    // Selection
    setSelection: (sel) => set(s => updateDoc(s, { selection: sel })),

    copySelection: () => {
      const s = get();
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      const clip = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const srcOff = (sy * s.canvasWidth + sx) * 4;
          const dstOff = (dy * sel.w + dx) * 4;
          clip.data[dstOff] = layer.data.data[srcOff];
          clip.data[dstOff + 1] = layer.data.data[srcOff + 1];
          clip.data[dstOff + 2] = layer.data.data[srcOff + 2];
          clip.data[dstOff + 3] = layer.data.data[srcOff + 3];
        }
      }
      set({ clipboard: clip });
    },

    cutSelection: () => {
      const store = get();
      store.copySelection();
      const s = get();
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const off = (sy * s.canvasWidth + sx) * 4;
          layer.data.data[off] = 0; layer.data.data[off+1] = 0;
          layer.data.data[off+2] = 0; layer.data.data[off+3] = 0;
        }
      }
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    pasteClipboard: () => {
      const { clipboard } = get();
      if (!clipboard) return;
      const data = new ImageData(clipboard.width, clipboard.height);
      data.data.set(clipboard.data);
      const s = get();
      set(updateDoc(s, { floating: { data, x: 0, y: 0 }, selection: { x: 0, y: 0, w: clipboard.width, h: clipboard.height } }));
    },

    liftSelection: () => {
      const s = get();
      if (!s.selection) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const sel = s.selection;
      const data = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const srcOff = (sy * s.canvasWidth + sx) * 4;
          const dstOff = (dy * sel.w + dx) * 4;
          data.data[dstOff] = layer.data.data[srcOff];
          data.data[dstOff+1] = layer.data.data[srcOff+1];
          data.data[dstOff+2] = layer.data.data[srcOff+2];
          data.data[dstOff+3] = layer.data.data[srcOff+3];
          layer.data.data[srcOff] = 0; layer.data.data[srcOff+1] = 0;
          layer.data.data[srcOff+2] = 0; layer.data.data[srcOff+3] = 0;
        }
      }
      set(updateDoc(s, { floating: { data, x: sel.x, y: sel.y }, renderVersion: s.renderVersion + 1, dirty: true }));
    },

    dropFloating: () => {
      const s = get();
      if (!s.floating) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const fd = s.floating.data;
      for (let dy = 0; dy < fd.height; dy++) {
        for (let dx = 0; dx < fd.width; dx++) {
          const tx: number = s.floating.x + dx;
          const ty: number = s.floating.y + dy;
          if (tx < 0 || tx >= s.canvasWidth || ty < 0 || ty >= s.canvasHeight) continue;
          const srcOff = (dy * fd.width + dx) * 4;
          const sa = fd.data[srcOff + 3];
          if (sa === 0) continue;
          const dstOff = (ty * s.canvasWidth + tx) * 4;
          if (sa === 255) {
            layer.data.data[dstOff] = fd.data[srcOff];
            layer.data.data[dstOff+1] = fd.data[srcOff+1];
            layer.data.data[dstOff+2] = fd.data[srcOff+2];
            layer.data.data[dstOff+3] = 255;
          } else {
            const alpha = sa / 255, inv = 1 - alpha;
            layer.data.data[dstOff] = Math.round(fd.data[srcOff]*alpha + layer.data.data[dstOff]*inv);
            layer.data.data[dstOff+1] = Math.round(fd.data[srcOff+1]*alpha + layer.data.data[dstOff+1]*inv);
            layer.data.data[dstOff+2] = Math.round(fd.data[srcOff+2]*alpha + layer.data.data[dstOff+2]*inv);
            layer.data.data[dstOff+3] = Math.min(255, Math.round(sa + layer.data.data[dstOff+3]*inv));
          }
        }
      }
      set(updateDoc(s, { floating: null, selection: null, renderVersion: s.renderVersion + 1, dirty: true }));
    },

    moveFloating: (dx, dy) => {
      const s = get();
      if (!s.floating) return;
      set(updateDoc(s, {
        floating: { ...s.floating, x: s.floating.x + dx, y: s.floating.y + dy },
        selection: s.selection ? { ...s.selection, x: s.selection.x + dx, y: s.selection.y + dy } : null,
        renderVersion: s.renderVersion + 1,
      }));
    },

    deleteSelection: () => {
      const s = get();
      if (s.floating) {
        set(updateDoc(s, { floating: null, selection: null, renderVersion: s.renderVersion + 1 }));
        return;
      }
      if (!s.selection) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      for (let dy = 0; dy < s.selection.h; dy++) {
        for (let dx = 0; dx < s.selection.w; dx++) {
          const sx2: number = s.selection.x + dx;
          const sy2: number = s.selection.y + dy;
          if (sx2 < 0 || sx2 >= s.canvasWidth || sy2 < 0 || sy2 >= s.canvasHeight) continue;
          const off = (sy2 * s.canvasWidth + sx2) * 4;
          layer.data.data[off] = 0; layer.data.data[off+1] = 0;
          layer.data.data[off+2] = 0; layer.data.data[off+3] = 0;
        }
      }
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    selectAll: () => {
      const s = get();
      set({ ...updateDoc(s, { selection: { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight } }), activeTool: 'selection' });
    },

    deselectAll: () => {
      const store = get();
      if (store.floating) store.dropFloating();
      const s = get();
      set(updateDoc(s, { selection: null }));
    },

    clearActiveLayer: () => {
      const s = get();
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      layer.data.data.fill(0);
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    setForegroundColor: (c) => set({ foregroundColor: c }),
    setBackgroundColor: (c) => set({ backgroundColor: c }),
    swapColors: () => {
      const { foregroundColor, backgroundColor } = get();
      set({ foregroundColor: backgroundColor, backgroundColor: foregroundColor });
    },

    pushUndo: (snapshot) => {
      const s = get();
      set(updateDoc(s, {
        undoStack: [...s.undoStack.slice(-49), snapshot],
        redoStack: [],
        dirty: true,
      }));
    },

    undo: () => {
      const s = get();
      if (s.undoStack.length === 0) return;
      const snapshot = s.undoStack[s.undoStack.length - 1];
      const layer = s.layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      const w = layer.data.width;
      const redoData = new Uint8ClampedArray(snapshot.before.length);
      for (let dy = 0; dy < snapshot.h; dy++) {
        const srcOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const dstOff = dy * snapshot.w * 4;
        redoData.set(layer.data.data.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        layer.data.data.set(snapshot.before.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(updateDoc(s, {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { ...snapshot, after: redoData }],
        layers: [...s.layers],
        renderVersion: s.renderVersion + 1,
      }));
    },

    redo: () => {
      const s = get();
      if (s.redoStack.length === 0) return;
      const snapshot = s.redoStack[s.redoStack.length - 1];
      const layer = s.layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      const w = layer.data.width;
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        layer.data.data.set(snapshot.after.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(updateDoc(s, {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot],
        layers: [...s.layers],
        renderVersion: s.renderVersion + 1,
      }));
    },

    markDirty: () => {
      const s = get();
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    setDirty: (dirty) => set(s => updateDoc(s, { dirty })),
    setFileName: (name) => set(s => updateDoc(s, { fileName: name })),

    loadLayers: (layers, width, height) => {
      const s = get();
      set(updateDoc(s, {
        layers,
        canvasWidth: width,
        canvasHeight: height,
        activeLayerId: layers[0]?.id ?? '',
        undoStack: [],
        redoStack: [],
        dirty: false,
        viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
      }));
    },

    getActiveLayer: () => {
      const { layers, activeLayerId } = get();
      return layers.find(l => l.id === activeLayerId);
    },
  };
});
