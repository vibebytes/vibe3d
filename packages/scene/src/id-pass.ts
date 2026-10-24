import { AppError, type SceneDoc, type SceneNode } from '@vibebyte/vibe3d-protocol';

export const ID_PASS_MAX_NODES = 255;
export const ID_PASS_MAX_PIXELS = 1_000_000;

export interface IdLegend {
  legend: Record<string, string>;
  byHex: Record<string, string>;
  order: string[];
}

export interface IdCoverage {
  nodeId: string;
  hex: string;
  pixels: number;
}

export interface IdMask {
  index: Uint8Array;
  coverage: IdCoverage[];
  unknown: number;
}

export function fitsIdPass(width: number, height: number): boolean {
  return width > 0 && height > 0 && width * height <= ID_PASS_MAX_PIXELS;
}

function visible(node: SceneNode, doc: SceneDoc): boolean {
  let current: SceneNode | undefined = node;
  let guard = 0;
  while (current) {
    if (!current.visible) return false;
    if (guard++ > 1024) return false;
    current = current.parent ? doc.nodes[current.parent] : undefined;
  }
  return true;
}

function hexOf(index: number): string {
  return `#${(index + 1).toString(16).padStart(6, '0')}`;
}

export function buildIdLegend(doc: SceneDoc): IdLegend {
  const order = Object.values(doc.nodes)
    .filter((node) => (node.kind === 'mesh' || node.kind === 'model') && visible(node, doc))
    .map((node) => node.id)
    .sort();
  if (order.length > ID_PASS_MAX_NODES) {
    throw new AppError(
      'E_INVALID_PARAMS',
      `id-pass 最多支持 ${ID_PASS_MAX_NODES} 个可渲染节点，当前 ${order.length} 个`,
      { max: ID_PASS_MAX_NODES, actual: order.length },
    );
  }
  const legend: Record<string, string> = {};
  const byHex: Record<string, string> = {};
  order.forEach((id, i) => {
    const hex = hexOf(i);
    legend[id] = hex;
    byHex[hex] = id;
  });
  return { legend, byHex, order };
}

export function decodeIdMask(rgba: Uint8Array, palette: IdLegend | Record<string, string>): IdMask {
  const full = (palette as IdLegend).order ? (palette as IdLegend) : null;
  const legend: Record<string, string> = full ? full.legend : (palette as Record<string, string>);
  const byHex: Record<string, string> = full
    ? full.byHex
    : Object.fromEntries(Object.entries(legend).map(([id, hex]) => [hex, id]));
  const ordered = full ? full.order : Object.keys(legend);
  const indexOf = new Map(ordered.map((id, i) => [id, i + 1]));
  const pixels = rgba.length / 4;
  const index = new Uint8Array(pixels);
  const counts = new Map<string, number>();
  let unknown = 0;
  for (let p = 0; p < pixels; p += 1) {
    const at = p * 4;
    const rgb = ((rgba[at] ?? 0) << 16) | ((rgba[at + 1] ?? 0) << 8) | (rgba[at + 2] ?? 0);
    const hex = `#${rgb.toString(16).padStart(6, '0')}`;
    const nodeId = byHex[hex];
    if (!nodeId) {
      if (rgb !== 0) unknown += 1;
      continue;
    }
    index[p] = indexOf.get(nodeId) ?? 0;
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }
  const coverage = [...counts.entries()]
    .map(([nodeId, count]) => ({ nodeId, hex: legend[nodeId] ?? '', pixels: count }))
    .sort((a, b) => b.pixels - a.pixels || a.nodeId.localeCompare(b.nodeId));
  return { index, coverage, unknown };
}
