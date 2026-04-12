import type { Layer } from './Layer';
import { blendPixel } from './blend-modes';

/**
 * Flatten visible layers (bottom → top) into a single ImageData.
 */
export function compositeLayers(
  layers: Layer[],
  width: number,
  height: number,
): ImageData {
  const result = new ImageData(width, height);
  const dst = result.data;

  // Draw checkerboard transparency pattern into result
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      const light = ((x >> 2) + (y >> 2)) % 2 === 0;
      const v = light ? 204 : 170;
      dst[off] = v;
      dst[off + 1] = v;
      dst[off + 2] = v;
      dst[off + 3] = 255;
    }
  }

  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue;

    const src = layer.data.data;
    const opacityMul = layer.opacity / 255;

    for (let i = 0; i < width * height; i++) {
      const sOff = i * 4;
      const sa = src[sOff + 3] * opacityMul;
      if (sa === 0) continue;

      blendPixel(
        dst, sOff,
        src[sOff], src[sOff + 1], src[sOff + 2], Math.round(sa),
        layer.blendMode,
      );
    }
  }

  return result;
}

/** Flatten for export — no checkerboard, true alpha. */
export function flattenForExport(
  layers: Layer[],
  width: number,
  height: number,
): ImageData {
  const result = new ImageData(width, height);
  const dst = result.data;

  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue;

    const src = layer.data.data;
    const opacityMul = layer.opacity / 255;

    for (let i = 0; i < width * height; i++) {
      const sOff = i * 4;
      const sa = src[sOff + 3] * opacityMul;
      if (sa === 0) continue;

      blendPixel(
        dst, sOff,
        src[sOff], src[sOff + 1], src[sOff + 2], Math.round(sa),
        layer.blendMode,
      );
    }
  }

  return result;
}
