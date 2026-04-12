import { useEditorStore } from '../state/editor-store';
import { serializeWsprite } from './wsprite/wsprite-write';
import { deserializeWsprite } from './wsprite/wsprite-read';
import { exportAsPng } from './png-export';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function saveWsprite() {
  const state = useEditorStore.getState();
  const buffer = serializeWsprite();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, state.fileName);
  state.setDirty(false);
}

export function openWsprite() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wsprite';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    try {
      const { layers, width, height } = deserializeWsprite(buffer);
      const store = useEditorStore.getState();
      store.loadLayers(layers, width, height);
      store.setFileName(file.name);
    } catch (err) {
      console.error('Failed to open .wsprite file:', err);
      alert(`Failed to open file: ${(err as Error).message}`);
    }
  };
  input.click();
}

export async function exportPng() {
  const state = useEditorStore.getState();
  try {
    const blob = await exportAsPng();
    const name = state.fileName.replace(/\.wsprite$/, '.png');
    downloadBlob(blob, name);
  } catch (err) {
    console.error('Failed to export PNG:', err);
    alert('Failed to export PNG');
  }
}
