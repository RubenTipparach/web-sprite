/**
 * Minimal GIF89a encoder for animated sprites.
 * Supports: multiple frames, transparency, per-frame delay.
 * Uses median-cut color quantization to 256 colors per frame.
 */

function writeLittleEndian(arr: number[], value: number, bytes: number) {
  for (let i = 0; i < bytes; i++) {
    arr.push(value & 0xff);
    value >>= 8;
  }
}

/** Quantize RGBA pixels to a 256-color palette. Returns palette + indexed pixels. */
function quantize(rgba: Uint8ClampedArray, w: number, h: number): {
  palette: number[]; // flat RGB, 256*3 entries
  indexed: Uint8Array;
  transparentIndex: number;
} {
  const pixelCount = w * h;
  const indexed = new Uint8Array(pixelCount);

  // Collect unique colors (ignoring transparent pixels)
  const colorMap = new Map<number, number>(); // color key -> count
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    if (rgba[off + 3] < 128) continue; // transparent
    const key = (rgba[off] << 16) | (rgba[off + 1] << 8) | rgba[off + 2];
    colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
  }

  // Build palette: up to 255 colors + 1 transparent
  const colors = Array.from(colorMap.keys());
  const palette: number[] = [];
  const transparentIndex = 0;

  // Reserve index 0 for transparency
  palette.push(0, 0, 0); // transparent color (arbitrary RGB)

  if (colors.length <= 255) {
    // All colors fit
    const lookup = new Map<number, number>();
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      lookup.set(c, i + 1);
      palette.push((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
    }
    // Pad to 256
    while (palette.length < 256 * 3) palette.push(0, 0, 0);

    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      if (rgba[off + 3] < 128) {
        indexed[i] = transparentIndex;
      } else {
        const key = (rgba[off] << 16) | (rgba[off + 1] << 8) | rgba[off + 2];
        indexed[i] = lookup.get(key) ?? 1;
      }
    }
  } else {
    // Need to reduce colors — simple popularity-based quantization
    const sorted = colors.sort((a, b) => (colorMap.get(b) ?? 0) - (colorMap.get(a) ?? 0));
    const top = sorted.slice(0, 255);
    const lookup = new Map<number, number>();
    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      lookup.set(c, i + 1);
      palette.push((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
    }
    while (palette.length < 256 * 3) palette.push(0, 0, 0);

    // Map remaining colors to nearest in palette
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      if (rgba[off + 3] < 128) {
        indexed[i] = transparentIndex;
        continue;
      }
      const key = (rgba[off] << 16) | (rgba[off + 1] << 8) | rgba[off + 2];
      const exact = lookup.get(key);
      if (exact !== undefined) {
        indexed[i] = exact;
      } else {
        // Find nearest color
        const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
        let bestDist = Infinity;
        let bestIdx = 1;
        for (let j = 0; j < top.length; j++) {
          const c = top[j];
          const cr = (c >> 16) & 0xff, cg = (c >> 8) & 0xff, cb = c & 0xff;
          const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
          if (dist < bestDist) { bestDist = dist; bestIdx = j + 1; }
        }
        indexed[i] = bestIdx;
      }
    }
  }

  return { palette, indexed, transparentIndex };
}

/** LZW compression for GIF. */
function lzwEncode(indexed: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const output: number[] = [];
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxCode = 4096;

  // Dictionary: string of indices -> code
  const dict = new Map<string, number>();
  for (let i = 0; i < clearCode; i++) {
    dict.set(String(i), i);
  }

  // Bit packing
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  const bytes: number[] = [];

  function writeBits(code: number, size: number) {
    bitBuffer |= code << bitsInBuffer;
    bitsInBuffer += size;
    while (bitsInBuffer >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitsInBuffer -= 8;
    }
  }

  function resetDict() {
    dict.clear();
    for (let i = 0; i < clearCode; i++) {
      dict.set(String(i), i);
    }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  }

  writeBits(clearCode, codeSize);

  let w = String(indexed[0]);
  for (let i = 1; i < indexed.length; i++) {
    const k = String(indexed[i]);
    const wk = w + ',' + k;
    if (dict.has(wk)) {
      w = wk;
    } else {
      writeBits(dict.get(w)!, codeSize);
      if (nextCode < maxCode) {
        dict.set(wk, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetDict();
      }
      w = k;
    }
  }
  writeBits(dict.get(w)!, codeSize);
  writeBits(eoiCode, codeSize);
  if (bitsInBuffer > 0) bytes.push(bitBuffer & 0xff);

  // Pack into sub-blocks (max 255 bytes each)
  const result: number[] = [];
  let pos = 0;
  while (pos < bytes.length) {
    const blockSize = Math.min(255, bytes.length - pos);
    result.push(blockSize);
    for (let i = 0; i < blockSize; i++) result.push(bytes[pos++]);
  }
  result.push(0); // block terminator

  return new Uint8Array(result);
}

export interface GifFrame {
  rgba: Uint8ClampedArray;
  delay: number; // in centiseconds (1/100th of a second)
}

/** Encode animated GIF from RGBA frames. */
export function encodeGif(width: number, height: number, frames: GifFrame[]): Uint8Array {
  const data: number[] = [];

  // Header
  data.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a

  // Logical Screen Descriptor
  writeLittleEndian(data, width, 2);
  writeLittleEndian(data, height, 2);
  data.push(0x70); // no global color table, 8 bits color resolution
  data.push(0);    // background color index
  data.push(0);    // pixel aspect ratio

  // Netscape Application Extension (for looping)
  data.push(0x21, 0xff, 0x0b); // extension introducer + app extension label + block size
  // NETSCAPE2.0
  data.push(0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30);
  data.push(0x03, 0x01); // sub-block size, loop sub-block id
  writeLittleEndian(data, 0, 2); // loop count (0 = infinite)
  data.push(0x00); // block terminator

  for (const frame of frames) {
    const { palette, indexed, transparentIndex } = quantize(frame.rgba, width, height);

    // Graphic Control Extension
    data.push(0x21, 0xf9, 0x04); // extension + GCE label + block size
    data.push(0x09); // disposal = restore to bg, transparent flag
    writeLittleEndian(data, frame.delay, 2); // delay
    data.push(transparentIndex); // transparent color index
    data.push(0x00); // block terminator

    // Image Descriptor
    data.push(0x2c); // image separator
    writeLittleEndian(data, 0, 2); // left
    writeLittleEndian(data, 0, 2); // top
    writeLittleEndian(data, width, 2);
    writeLittleEndian(data, height, 2);
    data.push(0x87); // local color table, 256 colors (2^(7+1))

    // Local Color Table (256 * 3 bytes)
    for (let i = 0; i < 256 * 3; i++) {
      data.push(palette[i]);
    }

    // LZW min code size
    const minCodeSize = 8;
    data.push(minCodeSize);

    // LZW compressed data
    const compressed = lzwEncode(indexed, minCodeSize);
    for (let i = 0; i < compressed.length; i++) {
      data.push(compressed[i]);
    }
  }

  // Trailer
  data.push(0x3b);

  return new Uint8Array(data);
}
