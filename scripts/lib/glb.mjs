import { deflateSync } from 'node:zlib';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const pad = (buf, byte) => {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, byte)]);
};

export function packGlb(json, bin) {
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = bin ? pad(bin, 0) : Buffer.alloc(0);
  const total = 12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.writeUInt32LE(JSON_CHUNK, 4);
  const parts = [head, jsonHead, jsonChunk];
  if (binChunk.length) {
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(binChunk.length, 0);
    binHead.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(binHead, binChunk);
  }
  return Buffer.concat(parts);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function checkerPng(width = 64, cell = 8, rgbA = [95, 227, 192], rgbB = [17, 24, 32]) {
  const raw = Buffer.alloc((width * 3 + 1) * width);
  for (let y = 0; y < width; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const c = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? rgbA : rgbB;
      raw[row + 1 + x * 3] = c[0];
      raw[row + 2 + x * 3] = c[1];
      raw[row + 3 + x * 3] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function f32(values) {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

export function u16(values) {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => buf.writeUInt16LE(v, i * 2));
  return buf;
}

export class BinBuilder {
  constructor() {
    this.parts = [];
    this.views = [];
    this.offset = 0;
  }

  add(buf, target) {
    const view = { buffer: 0, byteOffset: this.offset, byteLength: buf.length };
    if (target) view.target = target;
    this.views.push(view);
    this.parts.push(buf);
    this.offset += buf.length;
    const rem = this.offset % 4;
    if (rem) {
      this.parts.push(Buffer.alloc(4 - rem, 0));
      this.offset += 4 - rem;
    }
    return this.views.length - 1;
  }

  buffer() {
    return Buffer.concat(this.parts);
  }
}

export const accessor = (bufferView, componentType, count, type, extra = {}) => ({
  bufferView,
  componentType,
  count,
  type,
  ...extra,
});

export const QUAT = 'VEC4';
export const VEC3 = 'VEC3';
export const VEC2 = 'VEC2';
export const SCALAR = 'SCALAR';
export const FLOAT = 5126;
export const USHORT = 5123;
export const UBYTE = 5121;
export const ARRAY_BUFFER = 34962;
export const ELEMENT_ARRAY_BUFFER = 34963;
