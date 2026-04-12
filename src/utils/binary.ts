/** Helper for writing binary data sequentially. */
export class BinaryWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private pos = 0;

  constructor(initialSize = 4096) {
    this.buf = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buf);
  }

  private ensure(bytes: number) {
    while (this.pos + bytes > this.buf.byteLength) {
      const next = new ArrayBuffer(this.buf.byteLength * 2);
      new Uint8Array(next).set(new Uint8Array(this.buf));
      this.buf = next;
      this.view = new DataView(this.buf);
    }
  }

  u8(val: number) { this.ensure(1); this.view.setUint8(this.pos, val); this.pos += 1; }
  u16(val: number) { this.ensure(2); this.view.setUint16(this.pos, val, true); this.pos += 2; }
  u32(val: number) { this.ensure(4); this.view.setUint32(this.pos, val, true); this.pos += 4; }

  bytes(data: Uint8Array) {
    this.ensure(data.length);
    new Uint8Array(this.buf, this.pos, data.length).set(data);
    this.pos += data.length;
  }

  string(s: string) {
    const encoded = new TextEncoder().encode(s);
    this.u16(encoded.length);
    this.bytes(encoded);
  }

  /** Write u32 at a specific offset (for backpatching sizes). */
  u32At(offset: number, val: number) {
    this.view.setUint32(offset, val, true);
  }

  offset(): number { return this.pos; }

  finish(): ArrayBuffer {
    return this.buf.slice(0, this.pos);
  }
}

/** Helper for reading binary data sequentially. */
export class BinaryReader {
  private view: DataView;
  private pos = 0;

  constructor(buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }

  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }

  bytes(len: number): Uint8Array {
    const arr = new Uint8Array(this.view.buffer, this.pos, len);
    this.pos += len;
    return new Uint8Array(arr); // copy
  }

  string(): string {
    const len = this.u16();
    const data = this.bytes(len);
    return new TextDecoder().decode(data);
  }

  skip(n: number) { this.pos += n; }
  offset(): number { return this.pos; }
  remaining(): number { return this.view.byteLength - this.pos; }
}
