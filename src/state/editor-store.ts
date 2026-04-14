import { create } from 'zustand';
import { type Layer, createLayer, cloneLayer, getFrameData } from '../layers/Layer';
import { type RGBA, BLACK, WHITE, hexToRgba, rgbaToHex } from '../utils/color';
import type { BlendMode } from '../layers/blend-modes';

export type ToolType = 'pen' | 'line' | 'rect' | 'circle' | 'ellipse' | 'fill' | 'colorReplace' | 'eraser' | 'selection';

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface UndoSnapshot {
  layerId: string;
  frameIndex: number;
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

export interface OnionSkinState {
  enabled: boolean;
  opacity: number; // 0–255
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

  // Animation
  currentFrame: number;
  frameCount: number;
  fps: number;
  playing: boolean;
  onionSkin: OnionSkinState;
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

    currentFrame: 0,
    frameCount: 1,
    fps: 8,
    playing: false,
    onionSkin: { enabled: false, opacity: 80 },
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

  // Tiling preview
  tileX: boolean;
  tileY: boolean;
  tileSolid: boolean;

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
  currentFrame: number;
  frameCount: number;
  fps: number;
  playing: boolean;
  onionSkin: OnionSkinState;

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

  setTileX: (on: boolean) => void;
  setTileY: (on: boolean) => void;
  setTileSolid: (on: boolean) => void;

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
  loadLayers: (layers: Layer[], width: number, height: number, frameCount?: number) => void;

  // Actions: Animation
  goToFrame: (frame: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  addFrame: () => void;
  deleteFrame: () => void;
  duplicateFrame: () => void;
  setFps: (fps: number) => void;
  togglePlayback: () => void;
  setPlaying: (playing: boolean) => void;
  toggleOnionSkin: () => void;
  setOnionSkinOpacity: (opacity: number) => void;

  // Helpers
  getActiveLayer: () => Layer | undefined;
  /** Get the ImageData for the active layer at the current frame. */
  getActiveFrameData: () => ImageData | undefined;
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
    currentFrame: active.currentFrame,
    frameCount: active.frameCount,
    fps: active.fps,
    playing: active.playing,
    onionSkin: active.onionSkin,
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
    currentFrame: doc.currentFrame,
    frameCount: doc.frameCount,
    fps: doc.fps,
    playing: doc.playing,
    onionSkin: doc.onionSkin,
  };
}

const PREFS_KEY = 'web-sprite-prefs';

interface SavedPrefs {
  brushSize?: number;
  pixelPerfect?: boolean;
  fgColor?: string;
  bgColor?: string;
  activeTool?: string;
}

function loadPrefs(): SavedPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePrefs(prefs: Partial<SavedPrefs>) {
  try {
    const current = loadPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch { /* ignore */ }
}

const DEFAULT_WIDTH = 32;
const DEFAULT_HEIGHT = 32;

export const useEditorStore = create<EditorState>((set, get) => {
  const initialDoc = createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT);

  return {
    documents: [initialDoc],
    activeDocId: initialDoc.id,

    activeTool: ((): ToolType => {
      const p = loadPrefs();
      const valid: ToolType[] = ['pen','line','rect','circle','ellipse','fill','colorReplace','eraser','selection'];
      return valid.includes(p.activeTool as ToolType) ? p.activeTool as ToolType : 'pen';
    })(),
    brushSize: loadPrefs().brushSize ?? 1,
    pixelPerfect: loadPrefs().pixelPerfect ?? true,
    foregroundColor: (() => { const p = loadPrefs(); return p.fgColor ? hexToRgba(p.fgColor) : { ...BLACK }; })(),
    backgroundColor: (() => { const p = loadPrefs(); return p.bgColor ? hexToRgba(p.bgColor) : { ...WHITE }; })(),
    clipboard: null,
    tileX: false,
    tileY: false,
    tileSolid: false,

    // Sync'd from active doc
    ...syncFromDoc(initialDoc),

    // Tab actions
    newCanvas: (width, height) => {
      // If the current doc is untouched (not dirty, default name), replace it.
      // Otherwise create a new tab.
      const s = get();
      const currentDoc = s.documents.find(d => d.id === s.activeDocId);
      if (currentDoc && !currentDoc.dirty && currentDoc.fileName === 'untitled.wsprite') {
        const doc = createDocument(width, height);
        set({
          documents: s.documents.map(d => d.id === s.activeDocId ? doc : d),
          activeDocId: doc.id,
          ...syncFromDoc(doc),
        });
      } else {
        const doc = createDocument(width, height);
        set({
          documents: [...s.documents, doc],
          activeDocId: doc.id,
          ...syncFromDoc(doc),
        });
      }
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
      const layer = createLayer(s.canvasWidth, s.canvasHeight, undefined, s.frameCount);
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
      const w = s.canvasWidth;
      const h = s.canvasHeight;
      // Merge all frames
      const mergedFrames: ImageData[] = [];
      for (let f = 0; f < s.frameCount; f++) {
        const topData = getFrameData(top, f);
        const bottomData = getFrameData(bottom, f);
        const merged = new ImageData(w, h);
        merged.data.set(bottomData.data);
        const src = topData.data;
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
        mergedFrames.push(merged);
      }
      const newBottom = { ...bottom, frames: mergedFrames };
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
    setTool: (tool) => { set({ activeTool: tool }); savePrefs({ activeTool: tool }); },
    setBrushSize: (size) => { const s = Math.max(1, size); set({ brushSize: s }); savePrefs({ brushSize: s }); },
    setPixelPerfect: (on) => { set({ pixelPerfect: on }); savePrefs({ pixelPerfect: on }); },

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
      const data = getFrameData(layer, s.currentFrame);
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      const clip = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const srcOff = (sy * s.canvasWidth + sx) * 4;
          const dstOff = (dy * sel.w + dx) * 4;
          clip.data[dstOff] = data.data[srcOff];
          clip.data[dstOff + 1] = data.data[srcOff + 1];
          clip.data[dstOff + 2] = data.data[srcOff + 2];
          clip.data[dstOff + 3] = data.data[srcOff + 3];
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
      const data = getFrameData(layer, s.currentFrame);
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const off = (sy * s.canvasWidth + sx) * 4;
          data.data[off] = 0; data.data[off+1] = 0;
          data.data[off+2] = 0; data.data[off+3] = 0;
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
      const frameData = getFrameData(layer, s.currentFrame);
      const sel = s.selection;
      const data = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          const srcOff = (sy * s.canvasWidth + sx) * 4;
          const dstOff = (dy * sel.w + dx) * 4;
          data.data[dstOff] = frameData.data[srcOff];
          data.data[dstOff+1] = frameData.data[srcOff+1];
          data.data[dstOff+2] = frameData.data[srcOff+2];
          data.data[dstOff+3] = frameData.data[srcOff+3];
          frameData.data[srcOff] = 0; frameData.data[srcOff+1] = 0;
          frameData.data[srcOff+2] = 0; frameData.data[srcOff+3] = 0;
        }
      }
      set(updateDoc(s, { floating: { data, x: sel.x, y: sel.y }, renderVersion: s.renderVersion + 1, dirty: true }));
    },

    dropFloating: () => {
      const s = get();
      if (!s.floating) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
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
            frameData.data[dstOff] = fd.data[srcOff];
            frameData.data[dstOff+1] = fd.data[srcOff+1];
            frameData.data[dstOff+2] = fd.data[srcOff+2];
            frameData.data[dstOff+3] = 255;
          } else {
            const alpha = sa / 255, inv = 1 - alpha;
            frameData.data[dstOff] = Math.round(fd.data[srcOff]*alpha + frameData.data[dstOff]*inv);
            frameData.data[dstOff+1] = Math.round(fd.data[srcOff+1]*alpha + frameData.data[dstOff+1]*inv);
            frameData.data[dstOff+2] = Math.round(fd.data[srcOff+2]*alpha + frameData.data[dstOff+2]*inv);
            frameData.data[dstOff+3] = Math.min(255, Math.round(sa + frameData.data[dstOff+3]*inv));
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
      const frameData = getFrameData(layer, s.currentFrame);
      for (let dy = 0; dy < s.selection.h; dy++) {
        for (let dx = 0; dx < s.selection.w; dx++) {
          const sx2: number = s.selection.x + dx;
          const sy2: number = s.selection.y + dy;
          if (sx2 < 0 || sx2 >= s.canvasWidth || sy2 < 0 || sy2 >= s.canvasHeight) continue;
          const off = (sy2 * s.canvasWidth + sx2) * 4;
          frameData.data[off] = 0; frameData.data[off+1] = 0;
          frameData.data[off+2] = 0; frameData.data[off+3] = 0;
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
      const frameData = getFrameData(layer, s.currentFrame);
      frameData.data.fill(0);
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    setTileX: (on) => set({ tileX: on }),
    setTileY: (on) => set({ tileY: on }),
    setTileSolid: (on) => set({ tileSolid: on }),

    setForegroundColor: (c) => { set({ foregroundColor: c }); savePrefs({ fgColor: rgbaToHex(c) }); },
    setBackgroundColor: (c) => { set({ backgroundColor: c }); savePrefs({ bgColor: rgbaToHex(c) }); },
    swapColors: () => {
      const { foregroundColor, backgroundColor } = get();
      set({ foregroundColor: backgroundColor, backgroundColor: foregroundColor });
      savePrefs({ fgColor: rgbaToHex(backgroundColor), bgColor: rgbaToHex(foregroundColor) });
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
      const frameData = getFrameData(layer, snapshot.frameIndex);
      const w = frameData.width;
      const redoData = new Uint8ClampedArray(snapshot.before.length);
      for (let dy = 0; dy < snapshot.h; dy++) {
        const srcOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const dstOff = dy * snapshot.w * 4;
        redoData.set(frameData.data.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        frameData.data.set(snapshot.before.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(updateDoc(s, {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { ...snapshot, after: redoData }],
        layers: [...s.layers],
        currentFrame: snapshot.frameIndex,
        renderVersion: s.renderVersion + 1,
      }));
    },

    redo: () => {
      const s = get();
      if (s.redoStack.length === 0) return;
      const snapshot = s.redoStack[s.redoStack.length - 1];
      const layer = s.layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      const frameData = getFrameData(layer, snapshot.frameIndex);
      const w = frameData.width;
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        frameData.data.set(snapshot.after.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      set(updateDoc(s, {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot],
        layers: [...s.layers],
        currentFrame: snapshot.frameIndex,
        renderVersion: s.renderVersion + 1,
      }));
    },

    markDirty: () => {
      const s = get();
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    setDirty: (dirty) => set(s => updateDoc(s, { dirty })),
    setFileName: (name) => set(s => updateDoc(s, { fileName: name })),

    loadLayers: (layers, width, height, frameCount) => {
      const s = get();
      const fc = frameCount ?? (layers[0]?.frames.length ?? 1);
      set(updateDoc(s, {
        layers,
        canvasWidth: width,
        canvasHeight: height,
        activeLayerId: layers[0]?.id ?? '',
        undoStack: [],
        redoStack: [],
        dirty: false,
        currentFrame: 0,
        frameCount: fc,
        playing: false,
        viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
      }));
    },

    // Animation actions
    goToFrame: (frame) => {
      const s = get();
      const clamped = Math.max(0, Math.min(frame, s.frameCount - 1));
      if (clamped === s.currentFrame) return;
      // Drop floating selection when changing frames
      if (s.floating) get().dropFloating();
      set(updateDoc(get(), { currentFrame: clamped, renderVersion: get().renderVersion + 1 }));
    },

    nextFrame: () => {
      const s = get();
      // Wrap from last to first
      const next = (s.currentFrame + 1) % s.frameCount;
      if (s.floating) get().dropFloating();
      set(updateDoc(get(), { currentFrame: next, renderVersion: get().renderVersion + 1 }));
    },

    prevFrame: () => {
      const s = get();
      // Wrap from first to last
      const prev = (s.currentFrame - 1 + s.frameCount) % s.frameCount;
      if (s.floating) get().dropFloating();
      set(updateDoc(get(), { currentFrame: prev, renderVersion: get().renderVersion + 1 }));
    },

    addFrame: () => {
      const s = get();
      const insertIdx = s.currentFrame + 1;
      const newLayers = s.layers.map(layer => {
        const newFrames = [...layer.frames];
        // Insert a blank frame after current
        newFrames.splice(insertIdx, 0, new ImageData(s.canvasWidth, s.canvasHeight));
        return { ...layer, frames: newFrames };
      });
      set(updateDoc(s, {
        layers: newLayers,
        frameCount: s.frameCount + 1,
        currentFrame: insertIdx,
        renderVersion: s.renderVersion + 1,
        dirty: true,
      }));
    },

    deleteFrame: () => {
      const s = get();
      if (s.frameCount <= 1) return;
      const deleteIdx = s.currentFrame;
      const newLayers = s.layers.map(layer => {
        const newFrames = [...layer.frames];
        newFrames.splice(deleteIdx, 1);
        return { ...layer, frames: newFrames };
      });
      const newCurrent = Math.min(deleteIdx, s.frameCount - 2);
      set(updateDoc(s, {
        layers: newLayers,
        frameCount: s.frameCount - 1,
        currentFrame: newCurrent,
        renderVersion: s.renderVersion + 1,
        dirty: true,
      }));
    },

    duplicateFrame: () => {
      const s = get();
      const srcIdx = s.currentFrame;
      const insertIdx = srcIdx + 1;
      const newLayers = s.layers.map(layer => {
        const srcFrame = getFrameData(layer, srcIdx);
        const copy = new ImageData(s.canvasWidth, s.canvasHeight);
        copy.data.set(srcFrame.data);
        const newFrames = [...layer.frames];
        newFrames.splice(insertIdx, 0, copy);
        return { ...layer, frames: newFrames };
      });
      set(updateDoc(s, {
        layers: newLayers,
        frameCount: s.frameCount + 1,
        currentFrame: insertIdx,
        renderVersion: s.renderVersion + 1,
        dirty: true,
      }));
    },

    setFps: (fps) => {
      const s = get();
      set(updateDoc(s, { fps: Math.max(1, Math.min(60, fps)) }));
    },

    togglePlayback: () => {
      const s = get();
      set(updateDoc(s, { playing: !s.playing }));
    },

    setPlaying: (playing) => {
      const s = get();
      set(updateDoc(s, { playing }));
    },

    toggleOnionSkin: () => {
      const s = get();
      set(updateDoc(s, { onionSkin: { ...s.onionSkin, enabled: !s.onionSkin.enabled } }));
    },

    setOnionSkinOpacity: (opacity) => {
      const s = get();
      set(updateDoc(s, { onionSkin: { ...s.onionSkin, opacity: Math.max(0, Math.min(255, opacity)) } }));
    },

    getActiveLayer: () => {
      const { layers, activeLayerId } = get();
      return layers.find(l => l.id === activeLayerId);
    },

    getActiveFrameData: () => {
      const { layers, activeLayerId, currentFrame } = get();
      const layer = layers.find(l => l.id === activeLayerId);
      if (!layer) return undefined;
      return getFrameData(layer, currentFrame);
    },
  };
});
