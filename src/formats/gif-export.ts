import { flattenForExport } from '../layers/LayerCompositor';
import { useEditorStore } from '../state/editor-store';
import { encodeGif, type GifFrame } from './gif-encoder';

export function exportAsGif(): Blob {
  const state = useEditorStore.getState();
  const w = state.canvasWidth;
  const h = state.canvasHeight;
  const delay = Math.round(100 / state.fps); // centiseconds per frame

  const frames: GifFrame[] = [];
  for (let f = 0; f < state.frameCount; f++) {
    const composite = flattenForExport(state.layers, w, h, f);
    frames.push({ rgba: composite.data, delay });
  }

  const gifData = encodeGif(w, h, frames);
  return new Blob([gifData], { type: 'image/gif' });
}
