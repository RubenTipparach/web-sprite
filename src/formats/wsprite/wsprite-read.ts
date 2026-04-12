import { BinaryReader } from '../../utils/binary';
import { decompress } from '../../utils/compression';
import { createLayer, type Layer } from '../../layers/Layer';
import {
  MAGIC, VERSION, HEADER_SIZE,
  CHUNK_LAYER, CHUNK_PIXEL_DATA,
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
} {
  const r = new BinaryReader(buffer);

  // Header
  const fileSize = r.u32();
  const magic = r.u16();
  if (magic !== MAGIC) throw new Error(`Invalid .wsprite file (magic: 0x${magic.toString(16)})`);
  const version = r.u16();
  if (version > VERSION) throw new Error(`Unsupported .wsprite version: ${version}`);
  const width = r.u16();
  const height = r.u16();
  const layerCount = r.u16();
  const colorDepth = r.u16();
  const chunkCount = r.u32();
  r.skip(HEADER_SIZE - r.offset()); // skip reserved bytes

  const layerMetas: LayerMeta[] = [];
  const pixelDataMap = new Map<number, Uint8ClampedArray>();

  // Read chunks
  for (let c = 0; c < chunkCount; c++) {
    const chunkStart = r.offset();
    const chunkSize = r.u32();
    const chunkType = r.u16();

    if (chunkType === CHUNK_LAYER) {
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
      const x = r.u16();
      const y = r.u16();
      const w = r.u16();
      const h = r.u16();
      const dataLen = chunkSize - (r.offset() - chunkStart);
      const compressedData = r.bytes(dataLen);
      const pixels = decompress(compressedData);
      pixelDataMap.set(layerIndex, new Uint8ClampedArray(pixels.buffer));
    } else {
      // Skip unknown chunks
      r.skip(chunkSize - (r.offset() - chunkStart));
    }
  }

  // Reconstruct layers
  const layers: Layer[] = layerMetas.map(meta => {
    const layer = createLayer(width, height, meta.name);
    layer.visible = meta.visible;
    layer.locked = meta.locked;
    layer.opacity = meta.opacity;
    layer.blendMode = meta.blendMode;

    const pixelData = pixelDataMap.get(meta.index);
    if (pixelData && pixelData.length === width * height * 4) {
      layer.data.data.set(pixelData);
    }

    return layer;
  });

  return { layers, width, height };
}
