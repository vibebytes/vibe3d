export const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export const NODE_ID_RE = /^n_[a-z0-9]{8}$/;
export const MATERIAL_ID_RE = /^m_[a-z0-9]{8}$/;
export const ROOM_ID_RE = /^r_[a-z0-9]{8}$/;
export const SHA_RE = /^[0-9a-f]{64}$/;

export type NodeId = `n_${string}`;
export type MaterialId = `m_${string}`;
export type RoomId = `r_${string}`;
export type Sha = string;

export interface IdOptions {
  random?: () => number;
  alphabet?: string;
}

function make(prefix: string, width: number, opts: IdOptions): string {
  const alphabet = opts.alphabet ?? ALPHABET;
  const random = opts.random ?? Math.random;
  let out = '';
  for (let i = 0; i < width; i++) {
    out += alphabet[Math.floor(random() * alphabet.length)] ?? '0';
  }
  return `${prefix}_${out}`;
}

export const makeNodeId = (opts: IdOptions = {}): NodeId => make('n', 8, opts) as NodeId;
export const makeMaterialId = (opts: IdOptions = {}): MaterialId => make('m', 8, opts) as MaterialId;
export const makeRoomId = (opts: IdOptions = {}): RoomId => make('r', 8, opts) as RoomId;

export const isNodeId = (v: unknown): v is NodeId => typeof v === 'string' && NODE_ID_RE.test(v);
export const isMaterialId = (v: unknown): v is MaterialId => typeof v === 'string' && MATERIAL_ID_RE.test(v);
export const isRoomId = (v: unknown): v is RoomId => typeof v === 'string' && ROOM_ID_RE.test(v);
export const isSha = (v: unknown): v is Sha => typeof v === 'string' && SHA_RE.test(v);
