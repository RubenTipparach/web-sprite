import { BinaryWriter } from '../../utils/binary';
import { compress } from '../../utils/compression';
import { useEditorStore } from '../../state/editor-store';
import {
  MAGIC, VERSION, HEADER_SIZE, COLOR_DEPTH_RGBA,
  CHUNK_LAYER, CHUNK_PIXEL_DATA, CHUNK_ANIMATION,
  FLAG_VISIBLE, FLAG_LOCKED,
} from './wsprite-format';
import type { BlendMode } from '../../layers/blend-modes';

const BLEND_MODE_MAP: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
};

export function serializeWsprite(): ArrayBuffer {
  const state = useEditorStore.getState();
  const w = new BinaryWriter(1024 * 64);

  // Header (64 bytes)
  const fileSizeOffset = w.offset();
  w.u32(0);                         // file size placeholder
  w.u16(MAGIC);
  w.u16(VERSION);
  w.u16(state.canvasWidth);
  w.u16(state.canvasHeight);
  w.u16(state.layers.length);
  w.u16(COLOR_DEPTH_RGBA);
  const chunkCountOffset = w.offset();
  w.u32(0);                         // chunk count placeholder
  // Pad to 64 bytes
  for (let i = w.offset(); i < HEADER_SIZE; i++) w.u8(0);

  let chunkCount = 0;

  // Animation chunk (frame count + fps)
  const animChunkStart = w.offset();
  w.u32(0);   // chunk size placeholder
  w.u16(CHUNK_ANIMATION);
  w.u16(state.frameCount);
  w.u16(state.fps);
  w.u32At(animChunkStart, w.offset() - animChunkStart);
  chunkCount++;

  for (let i = 0; i < state.layers.length; i++) {
    const layer = state.layers[i];

    // Layer chunk
    const layerChunkStart = w.offset();
    w.u32(0);   // chunk size placeholder
    w.u16(CHUNK_LAYER);
    w.u16(i);   // layer index as ID
    w.u16(0);   // parent ID (0 = root)
    let flags = 0;
    if (layer.visible) flags |= FLAG_VISIBLE;
    if (layer.locked) flags |= FLAG_LOCKED;
    w.u8(flags);
    w.u8(layer.opacity);
    w.u8(BLEND_MODE_MAP[layer.blendMode] ?? 0);
    w.string(layer.name);
    w.u32At(layerChunkStart, w.offset() - layerChunkStart);
    chunkCount++;

    // Pixel data chunk per frame
    for (let f = 0; f < state.frameCount; f++) {
      const frameData = layer.frames[f] ?? layer.frames[0];
      const pixelChunkStart = w.offset();
      w.u32(0);   // chunk size placeholder
      w.u16(CHUNK_PIXEL_DATA);
      w.u16(i);   // layer ID
      w.u16(f);   // frame index (was x=0 in v1)
      w.u16(0);   // reserved (was y=0 in v1)
      w.u16(state.canvasWidth);
      w.u16(state.canvasHeight);
      const compressed = compress(new Uint8Array(frameData.data.buffer));
      w.bytes(compressed);
      w.u32At(pixelChunkStart, w.offset() - pixelChunkStart);
      chunkCount++;
    }
  }

  // Backpatch
  w.u32At(fileSizeOffset, w.offset());
  w.u32At(chunkCountOffset, chunkCount);

  return w.finish();
}
