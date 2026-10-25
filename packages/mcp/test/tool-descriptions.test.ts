import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

const tools = listTools();
const descriptionOf = (name: string): string => tools.find((tool) => tool.name === name)?.description ?? '';

describe('tool descriptions', () => {
  it('tells the agent to nest composite payloads for apply_ops', () => {
    const desc = descriptionOf('vibe3d_apply_ops');
    expect(desc).toContain('node:{');
    expect(desc).toContain('env:{');
    expect(desc).toContain('不能平铺');
  });

  it('spells out the flat fields for legacy node create', () => {
    const desc = descriptionOf('vibe3d_node');
    expect(desc).toContain('kind');
    expect(desc).toContain('shape');
    expect(desc).toContain('size');
  });

  it('warns that fog is an object, not a boolean', () => {
    const desc = descriptionOf('vibe3d_stage');
    expect(desc).toContain('fog');
    expect(desc).toContain('near');
    expect(desc).toContain('false');
  });

  it('says legacy stage/camera take flat fields', () => {
    expect(descriptionOf('vibe3d_camera')).toContain('平铺');
    expect(descriptionOf('vibe3d_camera')).toContain('camera:{');
    expect(descriptionOf('vibe3d_stage')).toContain('stage:{');
  });

  it('marks each op read or write when a tool mixes both', () => {
    expect(descriptionOf('vibe3d_scene')).toContain('[read] get ');
    expect(descriptionOf('vibe3d_scene')).toContain('[write] undo');
  });

  it('leaves single-purpose tools untagged', () => {
    expect(descriptionOf('vibe3d_render')).not.toContain('[read]');
    expect(descriptionOf('vibe3d_render')).not.toContain('[write]');
  });

  it('tells the agent how to poll an export job', () => {
    expect(descriptionOf('vibe3d_export_glb')).toContain('vibe3d_job.get');
  });
});
