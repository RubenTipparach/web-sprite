import { flattenForExport } from '../layers/LayerCompositor';
import { useEditorStore } from '../state/editor-store';

export function exportAsPng(): Promise<Blob> {
  const state = useEditorStore.getState();
  const composite = flattenForExport(state.layers, state.canvasWidth, state.canvasHeight);

  const canvas = document.createElement('canvas');
  canvas.width = state.canvasWidth;
  canvas.height = state.canvasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(composite, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to export PNG')),
      'image/png',
    );
  });
}
