import { useEditorStore } from '../state/editor-store';
import { serializeWsprite } from '../formats/wsprite/wsprite-write';
import { deserializeWsprite } from '../formats/wsprite/wsprite-read';
import { createLayer } from '../layers/Layer';
import type { DocumentState } from '../state/editor-store';

const STORAGE_KEY = 'web-sprite-autosave-v2';
const SAVE_INTERVAL = 10_000;

interface SavedDoc {
  fileName: string;
  width: number;
  height: number;
  data: string; // base64-encoded .wsprite
}

interface SavedState {
  activeIndex: number;
  docs: SavedDoc[];
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Save ALL documents to localStorage. */
function saveToLocal(): boolean {
  try {
    const state = useEditorStore.getState();
    const saved: SavedState = {
      activeIndex: state.documents.findIndex(d => d.id === state.activeDocId),
      docs: [],
    };

    // We need to serialize each document individually.
    // serializeWsprite() reads from the store's convenience fields (active doc).
    // So we temporarily switch to each doc, serialize, then switch back.
    const originalDocId = state.activeDocId;

    for (const doc of state.documents) {
      // Temporarily sync convenience fields to this doc
      useEditorStore.setState({
        ...syncFieldsFromDoc(doc),
        activeDocId: doc.id,
      });
      const buffer = serializeWsprite();
      saved.docs.push({
        fileName: doc.fileName,
        width: doc.canvasWidth,
        height: doc.canvasHeight,
        data: toBase64(buffer),
      });
    }

    // Restore original active doc
    const origDoc = state.documents.find(d => d.id === originalDocId);
    if (origDoc) {
      useEditorStore.setState({
        ...syncFieldsFromDoc(origDoc),
        activeDocId: originalDocId,
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch (err) {
    console.warn('Auto-save failed:', err);
    return false;
  }
}

function syncFieldsFromDoc(doc: DocumentState) {
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

/** Load all auto-saved documents. Returns true if loaded. */
export function loadAutoSave(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Try legacy single-doc format
      return loadLegacy();
    }

    const saved: SavedState = JSON.parse(raw);
    if (!saved.docs || saved.docs.length === 0) return false;

    const store = useEditorStore.getState();
    const documents: DocumentState[] = [];

    for (const savedDoc of saved.docs) {
      try {
        const buffer = fromBase64(savedDoc.data);
        const { layers, width, height, frameCount, fps } = deserializeWsprite(buffer);
        const doc: DocumentState = {
          id: `doc-restored-${documents.length}`,
          fileName: savedDoc.fileName,
          canvasWidth: width,
          canvasHeight: height,
          layers,
          activeLayerId: layers[0]?.id ?? '',
          viewport: { offsetX: 0, offsetY: 0, zoom: Math.min(Math.floor(512 / Math.max(width, height)), 20) },
          symmetry: { xEnabled: false, yEnabled: false, xAxis: width / 2, yAxis: height / 2 },
          selection: null,
          floating: null,
          undoStack: [],
          redoStack: [],
          renderVersion: 0,
          dirty: false,
          currentFrame: 0,
          frameCount,
          fps,
          playing: false,
          onionSkin: { enabled: false, opacity: 80 },
        };
        documents.push(doc);
      } catch {
        // Skip corrupted docs
      }
    }

    if (documents.length === 0) return false;

    const activeIdx = Math.max(0, Math.min(saved.activeIndex, documents.length - 1));
    const activeDoc = documents[activeIdx];

    useEditorStore.setState({
      documents,
      activeDocId: activeDoc.id,
      ...syncFieldsFromDoc(activeDoc),
    });

    return true;
  } catch (err) {
    console.warn('Failed to load auto-save:', err);
    return false;
  }
}

/** Load legacy single-doc auto-save format. */
function loadLegacy(): boolean {
  try {
    const base64 = localStorage.getItem('web-sprite-autosave');
    if (!base64) return false;
    const buffer = fromBase64(base64);
    const { layers, width, height, frameCount, fps } = deserializeWsprite(buffer);
    const store = useEditorStore.getState();
    store.loadLayers(layers, width, height, frameCount);
    store.setFps(fps);
    const filename = localStorage.getItem('web-sprite-filename');
    if (filename) store.setFileName(filename);
    store.setDirty(false);
    // Clean up legacy keys
    localStorage.removeItem('web-sprite-autosave');
    localStorage.removeItem('web-sprite-filename');
    return true;
  } catch {
    return false;
  }
}

/** Start periodic auto-save. Returns cleanup function. */
export function startAutoSave(): () => void {
  let lastVersionSum = -1;

  const interval = setInterval(() => {
    const state = useEditorStore.getState();
    // Check if any document changed
    const versionSum = state.documents.reduce((sum, d) => sum + d.renderVersion, 0);
    if (versionSum !== lastVersionSum) {
      lastVersionSum = versionSum;
      saveToLocal();
    }
  }, SAVE_INTERVAL);

  const onUnload = () => saveToLocal();
  window.addEventListener('beforeunload', onUnload);

  return () => {
    clearInterval(interval);
    window.removeEventListener('beforeunload', onUnload);
  };
}

/** Clear auto-save data. */
export function clearAutoSave() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('web-sprite-autosave');
  localStorage.removeItem('web-sprite-filename');
}
