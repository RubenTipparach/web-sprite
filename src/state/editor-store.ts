import { create } from 'zustand';
import { type Layer, createLayer, cloneLayer, getFrameData } from '../layers/Layer';
import { type RGBA, BLACK, WHITE, hexToRgba, rgbaToHex } from '../utils/color';
import type { BlendMode } from '../layers/blend-modes';

export type ToolType = 'pen' | 'line' | 'rect' | 'circle' | 'ellipse' | 'fill' | 'colorReplace' | 'eraser' | 'selection' | 'lasso' | 'selectionBrush';

export type BrushShape = 'circle' | 'square';

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

/** Full snapshot of every frame of every layer, used for canvas-wide ops
 * (rotation with dimension swap, future resize, …) that can't be expressed
 * as a single-layer pixel diff. */
export interface CanvasSnapshot {
  width: number;
  height: number;
  /** Keyed by layer id → frames (one ImageData per frame). */
  frames: Record<string, ImageData[]>;
  symXAxis: number;
  symYAxis: number;
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
  // Optional floating-selection state captured alongside the pixel change.
  // When present, undo/redo also restores the floating selection so that
  // selection ops (lift, move, drop, paste, delete) reverse correctly.
  beforeFloating?: FloatingSelection | null;
  afterFloating?: FloatingSelection | null;
  beforeSelection?: SelectionRect | null;
  afterSelection?: SelectionRect | null;
  // Optional canvas-wide snapshot (rotation with dimension swap, etc.).
  // When present, undo/redo restore the full layer/dimension state and
  // ignore the single-layer pixel diff above.
  canvasBefore?: CanvasSnapshot;
  canvasAfter?: CanvasSnapshot;
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
  /** Optional per-pixel selection mask (canvasWidth*canvasHeight bytes). When
   * present, it refines `selection` — pixels where the mask is 0 are not part
   * of the selection. Used by lasso / selection-brush for non-rectangular shapes. */
  selectionMask: Uint8Array | null;
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
    selectionMask: null,
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
  brushShape: BrushShape;
  pixelPerfect: boolean;
  foregroundColor: RGBA;
  backgroundColor: RGBA;
  clipboard: ImageData | null;
  /** Size of the selection brush in canvas pixels. */
  selectionBrushSize: number;
  /** When false, the pixel grid overlay is hidden even at high zoom. */
  showGrid: boolean;

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
  selectionMask: Uint8Array | null;
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
  /** Set zoom and recenter the sprite in the given viewport rectangle
   * (canvas-pixel dimensions). Used for pinch/wheel zoom so the sprite
   * doesn't drift off-center. */
  zoomCentered: (zoom: number, viewportW: number, viewportH: number) => void;

  // Actions: Tools
  setTool: (tool: ToolType) => void;
  setBrushSize: (size: number) => void;
  setBrushShape: (shape: BrushShape) => void;
  setPixelPerfect: (on: boolean) => void;
  setSelectionBrushSize: (size: number) => void;
  setShowGrid: (on: boolean) => void;
  setSymmetryX: (enabled: boolean) => void;
  setSymmetryY: (enabled: boolean) => void;
  setSymmetryXAxis: (pos: number) => void;
  setSymmetryYAxis: (pos: number) => void;

  // Actions: Selection
  setSelection: (sel: SelectionRect | null) => void;
  setSelectionMask: (mask: Uint8Array | null, rect: SelectionRect | null) => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  liftSelection: () => void;
  dropFloating: () => void;
  moveFloating: (dx: number, dy: number) => void;
  /** Commit a completed floating-selection move as a single undo entry.
   * Pass the floating/selection state at drag start. */
  commitFloatingMove: (startFloating: FloatingSelection, startSelection: SelectionRect | null) => void;
  deleteSelection: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  clearActiveLayer: () => void;

  /** Flip the active selection (or the entire canvas if no selection) on
   * the active layer/frame. Pushes an undo entry. */
  flipHorizontal: () => void;
  flipVertical: () => void;
  /** Rotate 90° clockwise or counter-clockwise. If a selection exists, only
   * the selection is rotated; otherwise the entire current frame rotates.
   * A full-canvas rotation of a non-square sprite also swaps canvasWidth
   * and canvasHeight across all layers/frames. */
  rotate90: (direction: 'cw' | 'ccw') => void;

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
    selectionMask: active.selectionMask,
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
    selectionMask: doc.selectionMask,
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
  brushShape?: BrushShape;
  pixelPerfect?: boolean;
  fgColor?: string;
  bgColor?: string;
  activeTool?: string;
  selectionBrushSize?: number;
  showGrid?: boolean;
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

type Dir = 'h' | 'v';

/** Flip a single frame in place. If `rect`/`mask` are provided, only that
 * region is flipped (the mask chooses which pixels participate; the flip is
 * applied within the rect's bounding box). Non-masked pixels are untouched. */
function flipFrameInPlace(
  frame: ImageData,
  rect: { x: number; y: number; w: number; h: number } | null,
  mask: Uint8Array | null,
  dir: Dir,
) {
  const w = frame.width;
  const h = frame.height;
  const rx = rect ? rect.x : 0;
  const ry = rect ? rect.y : 0;
  const rw = rect ? rect.w : w;
  const rh = rect ? rect.h : h;

  // Snapshot only the rect so we can read old pixels after writing new ones.
  const src = new Uint8ClampedArray(rw * rh * 4);
  for (let dy = 0; dy < rh; dy++) {
    const srcRow = ((ry + dy) * w + rx) * 4;
    src.set(frame.data.subarray(srcRow, srcRow + rw * 4), dy * rw * 4);
  }

  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      const sx = rx + dx, sy = ry + dy;
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      if (mask && !mask[sy * w + sx]) continue;
      const srcDx = dir === 'h' ? rw - 1 - dx : dx;
      const srcDy = dir === 'v' ? rh - 1 - dy : dy;
      const srcOff = (srcDy * rw + srcDx) * 4;
      // Respect the mask at the source location too: if the mask hole is
      // mid-flip, skip so we don't blit into a hole.
      if (mask) {
        const srcCanvasX = rx + srcDx;
        const srcCanvasY = ry + srcDy;
        if (!mask[srcCanvasY * w + srcCanvasX]) continue;
      }
      const dstOff = (sy * w + sx) * 4;
      frame.data[dstOff]     = src[srcOff];
      frame.data[dstOff + 1] = src[srcOff + 1];
      frame.data[dstOff + 2] = src[srcOff + 2];
      frame.data[dstOff + 3] = src[srcOff + 3];
    }
  }
}

/** Rotate a region of a frame 90° into a fresh ImageData buffer. Used for
 * selection rotations where the bounding box stays the same size (square
 * region) or where we accept a swap of dimensions. */
function rotateRegion90(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  direction: 'cw' | 'ccw',
): { data: Uint8ClampedArray; w: number; h: number } {
  const out = new Uint8ClampedArray(w * h * 4);
  const ow = h, oh = w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcOff = (y * w + x) * 4;
      let ox: number, oy: number;
      if (direction === 'cw') {
        ox = h - 1 - y;
        oy = x;
      } else {
        ox = y;
        oy = w - 1 - x;
      }
      const dstOff = (oy * ow + ox) * 4;
      out[dstOff]     = src[srcOff];
      out[dstOff + 1] = src[srcOff + 1];
      out[dstOff + 2] = src[srcOff + 2];
      out[dstOff + 3] = src[srcOff + 3];
    }
  }
  return { data: out, w: ow, h: oh };
}

/** Flip the active selection or entire canvas on the active layer/frame.
 * Pushes a single undo snapshot that also restores any floating selection. */
function flipActive(
  set: (patch: Partial<EditorState>) => void,
  get: () => EditorState,
  dir: Dir,
) {
  const s = get();
  const layer = s.layers.find(l => l.id === s.activeLayerId);
  if (!layer) return;
  const frameData = getFrameData(layer, s.currentFrame);

  if (s.floating) {
    // Flip the floating ImageData in place, no layer pixels change.
    const fd = s.floating.data;
    const copy = new ImageData(fd.width, fd.height);
    copy.data.set(fd.data);
    flipFrameInPlace(copy, null, null, dir);
    const snap = new Uint8ClampedArray(frameData.data);
    set(updateDoc(s, {
      floating: { ...s.floating, data: copy },
      renderVersion: s.renderVersion + 1,
      dirty: true,
      undoStack: [...s.undoStack.slice(-49), {
        layerId: layer.id,
        frameIndex: s.currentFrame,
        x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
        before: snap,
        after: snap,
        beforeFloating: s.floating,
        afterFloating: { ...s.floating, data: copy },
        beforeSelection: s.selection,
        afterSelection: s.selection,
      }],
      redoStack: [],
    }));
    return;
  }

  const before = new Uint8ClampedArray(frameData.data);
  flipFrameInPlace(frameData, s.selection, s.selectionMask, dir);
  set(updateDoc(s, {
    layers: [...s.layers],
    renderVersion: s.renderVersion + 1,
    dirty: true,
    undoStack: [...s.undoStack.slice(-49), {
      layerId: layer.id,
      frameIndex: s.currentFrame,
      x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
      before,
      after: new Uint8ClampedArray(frameData.data),
    }],
    redoStack: [],
  }));
}

/** Rotate the active selection or entire canvas 90°.
 * - Floating selection: rotates its buffer; bbox dims swap.
 * - Static selection: rotates pixels within the selection rectangle. The
 *   rect must be square to fit back; otherwise we rotate the whole canvas.
 * - No selection: rotates every frame of every layer and swaps canvas
 *   dimensions if non-square. */
function rotateActive(
  set: (patch: Partial<EditorState>) => void,
  get: () => EditorState,
  direction: 'cw' | 'ccw',
) {
  const s = get();
  const layer = s.layers.find(l => l.id === s.activeLayerId);
  if (!layer) return;
  const frameData = getFrameData(layer, s.currentFrame);

  if (s.floating) {
    const fd = s.floating.data;
    const rotated = rotateRegion90(fd.data, fd.width, fd.height, direction);
    const newImg = new ImageData(rotated.w, rotated.h);
    newImg.data.set(rotated.data);
    // Keep the rotation centered on the floating bbox's center
    const cx = s.floating.x + fd.width / 2;
    const cy = s.floating.y + fd.height / 2;
    const nx = Math.round(cx - rotated.w / 2);
    const ny = Math.round(cy - rotated.h / 2);
    const newFloating = { data: newImg, x: nx, y: ny };
    const newSel = { x: nx, y: ny, w: rotated.w, h: rotated.h };
    const snap = new Uint8ClampedArray(frameData.data);
    set(updateDoc(s, {
      floating: newFloating,
      selection: newSel,
      renderVersion: s.renderVersion + 1,
      dirty: true,
      undoStack: [...s.undoStack.slice(-49), {
        layerId: layer.id,
        frameIndex: s.currentFrame,
        x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
        before: snap,
        after: snap,
        beforeFloating: s.floating,
        afterFloating: newFloating,
        beforeSelection: s.selection,
        afterSelection: newSel,
      }],
      redoStack: [],
    }));
    return;
  }

  if (s.selection && s.selection.w === s.selection.h) {
    // In-place square rotation
    const sel = s.selection;
    const before = new Uint8ClampedArray(frameData.data);
    const region = new Uint8ClampedArray(sel.w * sel.h * 4);
    for (let dy = 0; dy < sel.h; dy++) {
      for (let dx = 0; dx < sel.w; dx++) {
        const sx = sel.x + dx, sy = sel.y + dy;
        if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
        const srcOff = (sy * s.canvasWidth + sx) * 4;
        const dstOff = (dy * sel.w + dx) * 4;
        region[dstOff]     = frameData.data[srcOff];
        region[dstOff + 1] = frameData.data[srcOff + 1];
        region[dstOff + 2] = frameData.data[srcOff + 2];
        region[dstOff + 3] = frameData.data[srcOff + 3];
      }
    }
    const rotated = rotateRegion90(region, sel.w, sel.h, direction);
    for (let dy = 0; dy < sel.h; dy++) {
      for (let dx = 0; dx < sel.w; dx++) {
        const sx = sel.x + dx, sy = sel.y + dy;
        if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
        if (s.selectionMask && !s.selectionMask[sy * s.canvasWidth + sx]) continue;
        const srcOff = (dy * sel.w + dx) * 4;
        const dstOff = (sy * s.canvasWidth + sx) * 4;
        frameData.data[dstOff]     = rotated.data[srcOff];
        frameData.data[dstOff + 1] = rotated.data[srcOff + 1];
        frameData.data[dstOff + 2] = rotated.data[srcOff + 2];
        frameData.data[dstOff + 3] = rotated.data[srcOff + 3];
      }
    }
    set(updateDoc(s, {
      layers: [...s.layers],
      renderVersion: s.renderVersion + 1,
      dirty: true,
      undoStack: [...s.undoStack.slice(-49), {
        layerId: layer.id,
        frameIndex: s.currentFrame,
        x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
        before,
        after: new Uint8ClampedArray(frameData.data),
      }],
      redoStack: [],
    }));
    return;
  }

  // Non-square selection or no selection: rotate the full canvas (all
  // frames of all layers) and swap canvas dimensions. Undo works via a
  // canvas-wide snapshot that captures the full pre/post state.
  const oldW = s.canvasWidth;
  const oldH = s.canvasHeight;
  const newW = oldH;
  const newH = oldW;

  const canvasBefore: CanvasSnapshot = {
    width: oldW,
    height: oldH,
    frames: {},
    symXAxis: s.symmetry.xAxis,
    symYAxis: s.symmetry.yAxis,
  };
  for (const l of s.layers) {
    canvasBefore.frames[l.id] = l.frames.map(f => {
      const copy = new ImageData(f.width, f.height);
      copy.data.set(f.data);
      return copy;
    });
  }

  const newLayers = s.layers.map(l => {
    const newFrames = l.frames.map(f => {
      const rotated = rotateRegion90(f.data, f.width, f.height, direction);
      const img = new ImageData(rotated.w, rotated.h);
      img.data.set(rotated.data);
      return img;
    });
    return { ...l, frames: newFrames };
  });

  const canvasAfter: CanvasSnapshot = {
    width: newW,
    height: newH,
    frames: {},
    symXAxis: newW / 2,
    symYAxis: newH / 2,
  };
  for (const l of newLayers) {
    canvasAfter.frames[l.id] = l.frames.map(f => {
      const copy = new ImageData(f.width, f.height);
      copy.data.set(f.data);
      return copy;
    });
  }

  const empty = new Uint8ClampedArray(0);
  set(updateDoc(s, {
    layers: newLayers,
    canvasWidth: newW,
    canvasHeight: newH,
    selection: null,
    selectionMask: null,
    floating: null,
    symmetry: { ...s.symmetry, xAxis: canvasAfter.symXAxis, yAxis: canvasAfter.symYAxis },
    viewport: {
      ...s.viewport,
      zoom: Math.min(Math.floor(512 / Math.max(newW, newH)), s.viewport.zoom) || 1,
      offsetX: 0,
      offsetY: 0,
    },
    renderVersion: s.renderVersion + 1,
    dirty: true,
    undoStack: [...s.undoStack.slice(-49), {
      layerId: s.activeLayerId,
      frameIndex: s.currentFrame,
      x: 0, y: 0, w: 0, h: 0,
      before: empty,
      after: empty,
      canvasBefore,
      canvasAfter,
      beforeSelection: s.selection,
      afterSelection: null,
      beforeFloating: s.floating,
      afterFloating: null,
    }],
    redoStack: [],
  }));
}

export const useEditorStore = create<EditorState>((set, get) => {
  const initialDoc = createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT);

  return {
    documents: [initialDoc],
    activeDocId: initialDoc.id,

    activeTool: ((): ToolType => {
      const p = loadPrefs();
      const valid: ToolType[] = ['pen','line','rect','circle','ellipse','fill','colorReplace','eraser','selection','lasso','selectionBrush'];
      return valid.includes(p.activeTool as ToolType) ? p.activeTool as ToolType : 'pen';
    })(),
    brushSize: loadPrefs().brushSize ?? 1,
    brushShape: loadPrefs().brushShape ?? 'circle',
    pixelPerfect: loadPrefs().pixelPerfect ?? true,
    foregroundColor: (() => { const p = loadPrefs(); return p.fgColor ? hexToRgba(p.fgColor) : { ...BLACK }; })(),
    backgroundColor: (() => { const p = loadPrefs(); return p.bgColor ? hexToRgba(p.bgColor) : { ...WHITE }; })(),
    clipboard: null,
    selectionBrushSize: loadPrefs().selectionBrushSize ?? 4,
    showGrid: loadPrefs().showGrid ?? true,
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

    zoomCentered: (zoom, viewportW, viewportH) => {
      const s = get();
      set(updateDoc(s, {
        viewport: {
          zoom,
          offsetX: Math.round((viewportW - s.canvasWidth * zoom) / 2),
          offsetY: Math.round((viewportH - s.canvasHeight * zoom) / 2),
        },
      }));
    },

    // Tools (shared)
    setTool: (tool) => { set({ activeTool: tool }); savePrefs({ activeTool: tool }); },
    setBrushSize: (size) => { const s = Math.max(1, size); set({ brushSize: s }); savePrefs({ brushSize: s }); },
    setBrushShape: (shape) => { set({ brushShape: shape }); savePrefs({ brushShape: shape }); },
    setPixelPerfect: (on) => { set({ pixelPerfect: on }); savePrefs({ pixelPerfect: on }); },
    setSelectionBrushSize: (size) => {
      const s = Math.max(1, size);
      set({ selectionBrushSize: s });
      savePrefs({ selectionBrushSize: s });
    },
    setShowGrid: (on) => {
      set({ showGrid: on });
      savePrefs({ showGrid: on });
      const s = get();
      set(updateDoc(s, { renderVersion: s.renderVersion + 1 }));
    },

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
    setSelection: (sel) => set(s => updateDoc(s, { selection: sel, selectionMask: null })),
    setSelectionMask: (mask, rect) => set(s => updateDoc(s, { selectionMask: mask, selection: rect })),

    copySelection: () => {
      const s = get();
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const data = getFrameData(layer, s.currentFrame);
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      const mask = s.selectionMask;
      const clip = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          if (mask && !mask[sy * s.canvasWidth + sx]) continue;
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
      const before = new Uint8ClampedArray(data.data);
      const sel = s.selection ?? { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight };
      const mask = s.selectionMask;
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          if (mask && !mask[sy * s.canvasWidth + sx]) continue;
          const off = (sy * s.canvasWidth + sx) * 4;
          data.data[off] = 0; data.data[off+1] = 0;
          data.data[off+2] = 0; data.data[off+3] = 0;
        }
      }
      const s2 = get();
      set(updateDoc(s2, {
        renderVersion: s2.renderVersion + 1,
        dirty: true,
        undoStack: [...s2.undoStack.slice(-49), {
          layerId: layer.id,
          frameIndex: s2.currentFrame,
          x: 0, y: 0, w: s2.canvasWidth, h: s2.canvasHeight,
          before,
          after: new Uint8ClampedArray(data.data),
        }],
        redoStack: [],
      }));
    },

    pasteClipboard: () => {
      const { clipboard } = get();
      if (!clipboard) return;
      const data = new ImageData(clipboard.width, clipboard.height);
      data.data.set(clipboard.data);
      const s = get();
      // Drop any current floating first so it doesn't vanish without undo
      if (s.floating) get().dropFloating();
      const s2 = get();
      set(updateDoc(s2, {
        floating: { data, x: 0, y: 0 },
        selection: { x: 0, y: 0, w: clipboard.width, h: clipboard.height },
        selectionMask: null,
        renderVersion: s2.renderVersion + 1,
      }));
    },

    liftSelection: () => {
      const s = get();
      if (!s.selection) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
      const before = new Uint8ClampedArray(frameData.data);
      const sel = s.selection;
      const mask = s.selectionMask;
      const data = new ImageData(sel.w, sel.h);
      for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
          const sx = sel.x + dx, sy = sel.y + dy;
          if (sx < 0 || sx >= s.canvasWidth || sy < 0 || sy >= s.canvasHeight) continue;
          if (mask && !mask[sy * s.canvasWidth + sx]) continue;
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
      const floating = { data, x: sel.x, y: sel.y };
      const s2 = get();
      set(updateDoc(s2, {
        floating,
        // The floating ImageData carries the per-pixel shape via alpha,
        // so the mask is no longer needed while the selection is floating.
        selectionMask: null,
        renderVersion: s2.renderVersion + 1,
        dirty: true,
        undoStack: [...s2.undoStack.slice(-49), {
          layerId: layer.id,
          frameIndex: s2.currentFrame,
          x: 0, y: 0, w: s2.canvasWidth, h: s2.canvasHeight,
          before,
          after: new Uint8ClampedArray(frameData.data),
          beforeFloating: null,
          afterFloating: floating,
          beforeSelection: s.selection,
          afterSelection: s.selection,
        }],
        redoStack: [],
      }));
    },

    dropFloating: () => {
      const s = get();
      if (!s.floating) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
      const before = new Uint8ClampedArray(frameData.data);
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
      const s2 = get();
      set(updateDoc(s2, {
        floating: null,
        selection: null,
        selectionMask: null,
        renderVersion: s2.renderVersion + 1,
        dirty: true,
        undoStack: [...s2.undoStack.slice(-49), {
          layerId: layer.id,
          frameIndex: s2.currentFrame,
          x: 0, y: 0, w: s2.canvasWidth, h: s2.canvasHeight,
          before,
          after: new Uint8ClampedArray(frameData.data),
          beforeFloating: s.floating,
          afterFloating: null,
          beforeSelection: s.selection,
          afterSelection: null,
        }],
        redoStack: [],
      }));
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

    commitFloatingMove: (startFloating, startSelection) => {
      const s = get();
      if (!s.floating) return;
      if (s.floating.x === startFloating.x && s.floating.y === startFloating.y) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
      // Layer pixels haven't changed — the move only affected the floating
      // overlay. Push a no-op pixel snapshot that carries the floating delta.
      const snap = new Uint8ClampedArray(frameData.data);
      set(updateDoc(s, {
        dirty: true,
        undoStack: [...s.undoStack.slice(-49), {
          layerId: layer.id,
          frameIndex: s.currentFrame,
          x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
          before: snap,
          after: snap,
          beforeFloating: startFloating,
          afterFloating: s.floating,
          beforeSelection: startSelection,
          afterSelection: s.selection,
        }],
        redoStack: [],
      }));
    },

    deleteSelection: () => {
      const s = get();
      if (s.floating) {
        const layer = s.layers.find(l => l.id === s.activeLayerId);
        if (!layer) return;
        const frameData = getFrameData(layer, s.currentFrame);
        const snap = new Uint8ClampedArray(frameData.data);
        set(updateDoc(s, {
          floating: null,
          selection: null,
          selectionMask: null,
          renderVersion: s.renderVersion + 1,
          dirty: true,
          undoStack: [...s.undoStack.slice(-49), {
            layerId: layer.id,
            frameIndex: s.currentFrame,
            x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight,
            before: snap,
            after: snap,
            beforeFloating: s.floating,
            afterFloating: null,
            beforeSelection: s.selection,
            afterSelection: null,
          }],
          redoStack: [],
        }));
        return;
      }
      if (!s.selection) return;
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
      const before = new Uint8ClampedArray(frameData.data);
      const mask = s.selectionMask;
      for (let dy = 0; dy < s.selection.h; dy++) {
        for (let dx = 0; dx < s.selection.w; dx++) {
          const sx2: number = s.selection.x + dx;
          const sy2: number = s.selection.y + dy;
          if (sx2 < 0 || sx2 >= s.canvasWidth || sy2 < 0 || sy2 >= s.canvasHeight) continue;
          if (mask && !mask[sy2 * s.canvasWidth + sx2]) continue;
          const off = (sy2 * s.canvasWidth + sx2) * 4;
          frameData.data[off] = 0; frameData.data[off+1] = 0;
          frameData.data[off+2] = 0; frameData.data[off+3] = 0;
        }
      }
      const s2 = get();
      set(updateDoc(s2, {
        renderVersion: s2.renderVersion + 1,
        dirty: true,
        undoStack: [...s2.undoStack.slice(-49), {
          layerId: layer.id,
          frameIndex: s2.currentFrame,
          x: 0, y: 0, w: s2.canvasWidth, h: s2.canvasHeight,
          before,
          after: new Uint8ClampedArray(frameData.data),
        }],
        redoStack: [],
      }));
    },

    selectAll: () => {
      const s = get();
      set({ ...updateDoc(s, { selection: { x: 0, y: 0, w: s.canvasWidth, h: s.canvasHeight }, selectionMask: null }), activeTool: 'selection' });
    },

    deselectAll: () => {
      const store = get();
      if (store.floating) store.dropFloating();
      const s = get();
      set(updateDoc(s, { selection: null, selectionMask: null }));
    },

    clearActiveLayer: () => {
      const s = get();
      const layer = s.layers.find(l => l.id === s.activeLayerId);
      if (!layer) return;
      const frameData = getFrameData(layer, s.currentFrame);
      frameData.data.fill(0);
      set(updateDoc(s, { renderVersion: s.renderVersion + 1, dirty: true }));
    },

    flipHorizontal: () => flipActive(set, get, 'h'),
    flipVertical: () => flipActive(set, get, 'v'),
    rotate90: (direction) => rotateActive(set, get, direction),

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

      if (snapshot.canvasBefore) {
        const cb = snapshot.canvasBefore;
        const newLayers = s.layers.map(l => ({
          ...l,
          frames: (cb.frames[l.id] ?? l.frames).map(f => {
            const copy = new ImageData(f.width, f.height);
            copy.data.set(f.data);
            return copy;
          }),
        }));
        set(updateDoc(s, {
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, snapshot],
          layers: newLayers,
          canvasWidth: cb.width,
          canvasHeight: cb.height,
          symmetry: { ...s.symmetry, xAxis: cb.symXAxis, yAxis: cb.symYAxis },
          floating: snapshot.beforeFloating ?? null,
          selection: snapshot.beforeSelection ?? null,
          selectionMask: null,
          renderVersion: s.renderVersion + 1,
        }));
        return;
      }

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
      const patch: Partial<DocumentState> = {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { ...snapshot, after: redoData }],
        layers: [...s.layers],
        currentFrame: snapshot.frameIndex,
        renderVersion: s.renderVersion + 1,
      };
      if ('beforeFloating' in snapshot) patch.floating = snapshot.beforeFloating ?? null;
      if ('beforeSelection' in snapshot) patch.selection = snapshot.beforeSelection ?? null;
      set(updateDoc(s, patch));
    },

    redo: () => {
      const s = get();
      if (s.redoStack.length === 0) return;
      const snapshot = s.redoStack[s.redoStack.length - 1];

      if (snapshot.canvasAfter) {
        const ca = snapshot.canvasAfter;
        const newLayers = s.layers.map(l => ({
          ...l,
          frames: (ca.frames[l.id] ?? l.frames).map(f => {
            const copy = new ImageData(f.width, f.height);
            copy.data.set(f.data);
            return copy;
          }),
        }));
        set(updateDoc(s, {
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, snapshot],
          layers: newLayers,
          canvasWidth: ca.width,
          canvasHeight: ca.height,
          symmetry: { ...s.symmetry, xAxis: ca.symXAxis, yAxis: ca.symYAxis },
          floating: snapshot.afterFloating ?? null,
          selection: snapshot.afterSelection ?? null,
          selectionMask: null,
          renderVersion: s.renderVersion + 1,
        }));
        return;
      }

      const layer = s.layers.find(l => l.id === snapshot.layerId);
      if (!layer) return;
      const frameData = getFrameData(layer, snapshot.frameIndex);
      const w = frameData.width;
      for (let dy = 0; dy < snapshot.h; dy++) {
        const dstOff = ((snapshot.y + dy) * w + snapshot.x) * 4;
        const srcOff = dy * snapshot.w * 4;
        frameData.data.set(snapshot.after.subarray(srcOff, srcOff + snapshot.w * 4), dstOff);
      }
      const patch: Partial<DocumentState> = {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot],
        layers: [...s.layers],
        currentFrame: snapshot.frameIndex,
        renderVersion: s.renderVersion + 1,
      };
      if ('afterFloating' in snapshot) patch.floating = snapshot.afterFloating ?? null;
      if ('afterSelection' in snapshot) patch.selection = snapshot.afterSelection ?? null;
      set(updateDoc(s, patch));
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
