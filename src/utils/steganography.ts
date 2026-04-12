/**
 * Steganography: encode/decode binary data in the LSBs of image pixels.
 *
 * Format: Uses 2 least-significant bits per RGB channel (6 bits per pixel).
 * Alpha channel is left untouched to avoid visible artifacts.
 *
 * Header (first 12 bytes encoded):
 *   [4 bytes] Magic: "WSPR" (0x57535052)
 *   [4 bytes] Data length (uint32, little-endian)
 *   [4 bytes] CRC32 of data (for integrity check)
 *
 * Then the compressed .wsprite data follows.
 *
 * Capacity: 512x512 image = ~192 KB, 1024x1024 = ~786 KB
 */

const STEG_MAGIC = [0x57, 0x53, 0x50, 0x52]; // "WSPR"

/** Encode binary data into the LSBs of an ImageData (mutates it in place). */
export function steganographyEncode(image: ImageData, data: Uint8Array): boolean {
  const pixels = image.data;
  // 6 usable bits per pixel (2 per R, G, B channel)
  const maxBytes = Math.floor((image.width * image.height * 6) / 8);

  // Build header: magic + length + crc32
  const header = new Uint8Array(12);
  header[0] = STEG_MAGIC[0];
  header[1] = STEG_MAGIC[1];
  header[2] = STEG_MAGIC[2];
  header[3] = STEG_MAGIC[3];
  // Data length (little-endian)
  header[4] = data.length & 0xff;
  header[5] = (data.length >> 8) & 0xff;
  header[6] = (data.length >> 16) & 0xff;
  header[7] = (data.length >> 24) & 0xff;
  // CRC32
  const crc = crc32(data);
  header[8] = crc & 0xff;
  header[9] = (crc >> 8) & 0xff;
  header[10] = (crc >> 16) & 0xff;
  header[11] = (crc >> 24) & 0xff;

  const fullPayload = new Uint8Array(header.length + data.length);
  fullPayload.set(header);
  fullPayload.set(data, header.length);

  if (fullPayload.length > maxBytes) {
    return false; // doesn't fit
  }

  // Convert payload to a bit stream
  let bitIndex = 0;

  function writeBits(byte: number, count: number) {
    // Write `count` bits from `byte` (MSB first)
    for (let i = count - 1; i >= 0; i--) {
      const bit = (byte >> i) & 1;
      const pixelIdx = Math.floor(bitIndex / 6);
      const channelBit = bitIndex % 6;
      const channel = Math.floor(channelBit / 2); // 0=R, 1=G, 2=B
      const bitPos = channelBit % 2; // 0=bit1 (more significant), 1=bit0

      const off = pixelIdx * 4 + channel;
      if (bitPos === 0) {
        // Bit position 1 (second-lowest bit)
        pixels[off] = (pixels[off] & 0xFD) | (bit << 1);
      } else {
        // Bit position 0 (lowest bit)
        pixels[off] = (pixels[off] & 0xFE) | bit;
      }
      bitIndex++;
    }
  }

  for (let i = 0; i < fullPayload.length; i++) {
    // Encode each byte as: 2 bits into R, 2 into G, 2 into B, then next pixel for remaining
    // Actually we just stream bits sequentially, 6 per pixel
    writeBits(fullPayload[i], 8);
  }

  return true;
}

/** Attempt to decode hidden .wsprite data from an ImageData. Returns null if none found. */
export function steganographyDecode(image: ImageData): Uint8Array | null {
  const pixels = image.data;

  let bitIndex = 0;

  function readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const pixelIdx = Math.floor(bitIndex / 6);
      const channelBit = bitIndex % 6;
      const channel = Math.floor(channelBit / 2);
      const bitPos = channelBit % 2;

      const off = pixelIdx * 4 + channel;
      let bit: number;
      if (bitPos === 0) {
        bit = (pixels[off] >> 1) & 1;
      } else {
        bit = pixels[off] & 1;
      }

      value = (value << 1) | bit;
      bitIndex++;
    }
    return value;
  }

  function readByte(): number {
    return readBits(8);
  }

  // Read magic
  const magic = [readByte(), readByte(), readByte(), readByte()];
  if (magic[0] !== STEG_MAGIC[0] || magic[1] !== STEG_MAGIC[1] ||
      magic[2] !== STEG_MAGIC[2] || magic[3] !== STEG_MAGIC[3]) {
    return null; // no hidden data
  }

  // Read length (little-endian)
  const b0 = readByte(), b1 = readByte(), b2 = readByte(), b3 = readByte();
  const length = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);

  if (length <= 0 || length > 1024 * 1024) {
    return null; // sanity check
  }

  // Read CRC
  const c0 = readByte(), c1 = readByte(), c2 = readByte(), c3 = readByte();
  const expectedCrc = c0 | (c1 << 8) | (c2 << 16) | (c3 << 24);

  // Read data
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = readByte();
  }

  // Verify CRC
  const actualCrc = crc32(data);
  if (actualCrc !== expectedCrc) {
    return null; // corrupted
  }

  return data;
}

/** Get max embeddable bytes for a given image size. */
export function steganographyCapacity(width: number, height: number): number {
  return Math.floor((width * height * 6) / 8) - 12; // minus header
}

/** Simple CRC32 implementation. */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
