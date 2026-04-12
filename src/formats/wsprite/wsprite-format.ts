export const MAGIC = 0x5753;      // "WS"
export const VERSION = 1;
export const HEADER_SIZE = 64;
export const COLOR_DEPTH_RGBA = 32;

export const CHUNK_PALETTE = 0x0001;
export const CHUNK_LAYER = 0x0002;
export const CHUNK_PIXEL_DATA = 0x0003;
export const CHUNK_SELECTION = 0x0004;
export const CHUNK_METADATA = 0x0005;

// Layer flags
export const FLAG_VISIBLE = 0x01;
export const FLAG_LOCKED = 0x02;
