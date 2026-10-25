import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { repairInput } from '../src/repair';

const specInput = (capability: string): Parameters<typeof repairInput>[0] =>
  (CAPABILITIES as Record<string, { input: Parameters<typeof repairInput>[0] }>)[capability]!.input;

describe('node id vocabulary', () => {
  it('accepts node_id on the ops whose wire field is still id', () => {
    const out = repairInput(specInput('node.reparent'), { node_id: 'n_ab12cd34', parent: null });
    expect((out.value as Record<string, unknown>).id).toBe('n_ab12cd34');
    expect(out.fixes).toContain('node_id→id');
  });

  it('accepts id on the ops announced with node_id', () => {
    const out = repairInput(specInput('node.update'), { id: 'n_ab12cd34', patch: { visible: false } });
    const value = out.value as Record<string, unknown>;
    expect(value.nodeId ?? value.node_id ?? value.id).toBe('n_ab12cd34');
    expect(out.fixes.length).toBeGreaterThan(0);
  });
});
