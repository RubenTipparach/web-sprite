import { BinaryReader } from '../../utils/binary';
import { decompress } from '../../utils/compression';
import { createLayer, type Layer } from '../../layers/Layer';
import {
  MAGIC, HEADER_SIZE,
  CHUNK_LAYER, CHUNK_PIXEL_DATA, CHUNK_ANIMATION,
  FLAG_VISIBLE, FLAG_LOCKED,
} from './wsprite-format';
import type { BlendMode } from '../../layers/blend-modes';

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

interface LayerMeta {
  index: number;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
}

export function deserializeWsprite(buffer: ArrayBuffer): {
  layers: Layer[];
  width: number;
  height: number;
  frameCount: number;
  fps: number;
} {
  const r = new BinaryReader(buffer);

  // Header
  const fileSize = r.u32();
  const magic = r.u16();
  if (magic !== MAGIC) throw new Error(`Invalid .wsprite file (magic: 0x${magic.toString(16)})`);
  const version = r.u16();
  if (version > 2) throw new Error(`Unsupported .wsprite version: ${version}`);
  const width = r.u16();
  const height = r.u16();
  const layerCount = r.u16();
  const colorDepth = r.u16();
  const chunkCount = r.u32();
  r.skip(HEADER_SIZE - r.offset()); // skip reserved bytes

  const layerMetas: LayerMeta[] = [];
  // Map: layerIndex -> frameIndex -> pixel data
  const pixelDataMap = new Map<number, Map<number, Uint8ClampedArray>>();
  let frameCount = 1;
  let fps = 8;

  // Read chunks
  for (let c = 0; c < chunkCount; c++) {
    const chunkStart = r.offset();
    const chunkSize = r.u32();
    const chunkType = r.u16();

    if (chunkType === CHUNK_ANIMATION) {
      frameCount = r.u16();
      fps = r.u16();
      // Skip any remaining bytes in chunk
      const remaining = chunkSize - (r.offset() - chunkStart);
      if (remaining > 0) r.skip(remaining);
    } else if (chunkType === CHUNK_LAYER) {
      const index = r.u16();
      const parentId = r.u16();
      const flags = r.u8();
      const opacity = r.u8();
      const blendModeIdx = r.u8();
      const name = r.string();
      layerMetas.push({
        index,
        name,
        visible: (flags & FLAG_VISIBLE) !== 0,
        locked: (flags & FLAG_LOCKED) !== 0,
        opacity,
        blendMode: BLEND_MODES[blendModeIdx] ?? 'normal',
      });
    } else if (chunkType === CHUNK_PIXEL_DATA) {
      const layerIndex = r.u16();
      const frameOrX = r.u16(); // frame index in v2, x offset in v1
      const yOrReserved = r.u16();
      const w = r.u16();
      const h = r.u16();
      const dataLen = chunkSize - (r.offset() - chunkStart);
      const compressedData = r.bytes(dataLen);
      const pixels = decompress(compressedData);

      // In v1 there's one pixel data per layer (frameOrX=0 meaning x=0)
      // In v2 frameOrX is the frame index
      const frameIdx = version >= 2 ? frameOrX : 0;

      if (!pixelDataMap.has(layerIndex)) {
        pixelDataMap.set(layerIndex, new Map());
      }
      pixelDataMap.get(layerIndex)!.set(frameIdx, new Uint8ClampedArray(pixels.buffer));
    } else {
      // Skip unknown chunks
      r.skip(chunkSize - (r.offset() - chunkStart));
    }
  }

  // Reconstruct layers
  const layers: Layer[] = layerMetas.map(meta => {
    const layer = createLayer(width, height, meta.name, frameCount);
    layer.visible = meta.visible;
    layer.locked = meta.locked;
    layer.opacity = meta.opacity;
    layer.blendMode = meta.blendMode;

    const framesMap = pixelDataMap.get(meta.index);
    if (framesMap) {
      for (let f = 0; f < frameCount; f++) {
        const pixelData = framesMap.get(f);
        if (pixelData && pixelData.length === width * height * 4) {
          layer.frames[f].data.set(pixelData);
        }
      }
    }

    return layer;
  });

  return { layers, width, height, frameCount, fps };
}
