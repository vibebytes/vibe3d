export interface AnchorCase {
  name: string;
  anchor: Record<string, unknown>;
  ok: boolean;
  reasons?: string[];
}

const c = (name: string, anchor: Record<string, unknown>, ok: boolean, reasons?: string[]): AnchorCase => ({
  name,
  anchor: { name, ...anchor },
  ok,
  reasons,
});

export function anchorCases(): AnchorCase[] {
  return [
    c('exact-top-red', { at: [100, 10], hex: '#ff0000' }, true),
    c('exact-bottom-blue', { at: [100, 90], hex: '#0000ff' }, true),
    c('edge-tolerance-red', { at: [50, 55], hex: '#ff0000', tol_px: 8 }, true),
    c('wrong-colour', { at: [100, 10], hex: '#00ff00', tol_px: 2 }, false, ['colour_mismatch']),
    c('probe-only', { at: [30, 30] }, true),
    c('projected-centre', { p: [0, 0, 0], hex: '#0000ff' }, true),
    c('behind-camera', { p: [0, 0, 10], hex: '#ff0000' }, false, ['out_of_view']),
  ];
}

export function idAnchorCases(nodeId: string, materialId: string): AnchorCase[] {
  return [
    c('node-hit', { at: [2, 1], node: nodeId, material: materialId }, true),
    c('node-miss', { at: [0, 0], node: nodeId, tol_px: 3 }, false, ['node_mismatch']),
  ];
}
