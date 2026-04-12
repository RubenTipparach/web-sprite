import { useEditorStore } from '../state/editor-store';
import { serializeWsprite } from '../formats/wsprite/wsprite-write';
import { deserializeWsprite } from '../formats/wsprite/wsprite-read';

const STORAGE_KEY = 'web-sprite-autosave';
const FILENAME_KEY = 'web-sprite-filename';
const SAVE_INTERVAL = 10_000; // 10 seconds

/** Save current state to IndexedDB via localStorage fallback. */
function saveToLocal(): boolean {
  try {
    const state = useEditorStore.getState();
    const buffer = serializeWsprite();
    // Convert to base64 for localStorage
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    localStorage.setItem(STORAGE_KEY, base64);
    localStorage.setItem(FILENAME_KEY, state.fileName);
    return true;
  } catch (err) {
    console.warn('Auto-save failed:', err);
    return false;
  }
}

/** Load auto-saved state from localStorage. Returns true if loaded. */
export function loadAutoSave(): boolean {
  try {
    const base64 = localStorage.getItem(STORAGE_KEY);
    if (!base64) return false;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const { layers, width, height } = deserializeWsprite(bytes.buffer);
    const store = useEditorStore.getState();
    store.loadLayers(layers, width, height);

    const filename = localStorage.getItem(FILENAME_KEY);
    if (filename) store.setFileName(filename);

    store.setDirty(false);
    return true;
  } catch (err) {
    console.warn('Failed to load auto-save:', err);
    return false;
  }
}

/** Start periodic auto-save. Returns cleanup function. */
export function startAutoSave(): () => void {
  let lastRenderVersion = -1;

  const interval = setInterval(() => {
    const state = useEditorStore.getState();
    if (state.renderVersion !== lastRenderVersion) {
      lastRenderVersion = state.renderVersion;
      saveToLocal();
    }
  }, SAVE_INTERVAL);

  // Also save on beforeunload
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
  localStorage.removeItem(FILENAME_KEY);
}
