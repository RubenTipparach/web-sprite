export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

const clamp255 = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;

type BlendFn = (b: number, s: number) => number;

const blendFns: Record<BlendMode, BlendFn> = {
  normal: (_b, s) => s,
  multiply: (b, s) => (b * s) / 255,
  screen: (b, s) => 255 - ((255 - b) * (255 - s)) / 255,
  overlay: (b, s) => b < 128 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255,
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
};

/**
 * Blend source pixel over destination pixel (premultiplied-ish alpha compositing).
 * Writes result into dst array at dstOff.
 */
export function blendPixel(
  dst: Uint8ClampedArray, dstOff: number,
  sr: number, sg: number, sb: number, sa: number,
  mode: BlendMode,
) {
  if (sa === 0) return;

  const dr = dst[dstOff];
  const dg = dst[dstOff + 1];
  const db = dst[dstOff + 2];
  const da = dst[dstOff + 3];

  if (da === 0) {
    dst[dstOff] = sr;
    dst[dstOff + 1] = sg;
    dst[dstOff + 2] = sb;
    dst[dstOff + 3] = sa;
    return;
  }

  const fn = blendFns[mode];
  const br = fn(dr, sr);
  const bg = fn(dg, sg);
  const bb = fn(db, sb);

  // Alpha compositing
  const aS = sa / 255;
  const aD = da / 255;
  const aO = aS + aD * (1 - aS);

  if (aO === 0) {
    dst[dstOff] = 0;
    dst[dstOff + 1] = 0;
    dst[dstOff + 2] = 0;
    dst[dstOff + 3] = 0;
    return;
  }

  dst[dstOff]     = clamp255(Math.round((br * aS + dr * aD * (1 - aS)) / aO));
  dst[dstOff + 1] = clamp255(Math.round((bg * aS + dg * aD * (1 - aS)) / aO));
  dst[dstOff + 2] = clamp255(Math.round((bb * aS + db * aD * (1 - aS)) / aO));
  dst[dstOff + 3] = clamp255(Math.round(aO * 255));
}
