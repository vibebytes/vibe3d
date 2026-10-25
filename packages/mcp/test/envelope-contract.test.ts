import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

interface Schema {
  properties?: Record<string, any>;
  allOf?: any[];
  oneOf?: any[];
  required?: string[];
}

const tools = listTools();
const schemaOf = (name: string): Schema =>
  (tools.find((tool) => tool.name === name)?.inputSchema ?? {}) as Schema;
const paramsDesc = (name: string): string => schemaOf(name).properties?.params?.description ?? '';
const multi = tools.filter((tool) => Array.isArray(schemaOf(tool.name).properties?.op?.enum));

describe('envelope params description', () => {
  it('no longer ships the copy-pasted mesh example', () => {
    for (const tool of multi) expect(paramsDesc(tool.name)).not.toContain('kind: "mesh"');
  });

  it('lists this tool own ops with their required fields', () => {
    expect(paramsDesc('vibe3d_node')).toContain('create{kind');
    expect(paramsDesc('vibe3d_node')).toContain('get{node_id}');
    expect(paramsDesc('vibe3d_room')).toContain('use{room_id}');
  });

  it('stays free of node vocabulary on unrelated tools', () => {
    expect(paramsDesc('vibe3d_job')).not.toContain('kind');
    expect(paramsDesc('vibe3d_job')).toContain('get{job_id}');
  });

  it('says flat fields are accepted', () => {
    expect(paramsDesc('vibe3d_node')).toContain('平铺');
  });
});

describe('envelope per-op required', () => {
  it('names the required fields of each op', () => {
    expect(paramsDesc('vibe3d_node')).toContain('get{node_id}');
    expect(paramsDesc('vibe3d_node')).toContain('create{kind');
    expect(paramsDesc('vibe3d_scene')).toContain('restore{checkpoint_id}');
    expect(paramsDesc('vibe3d_scene')).not.toContain('stats{');
  });

  it('drops fields that are only required by the transport', () => {
    expect(paramsDesc('vibe3d_render')).not.toContain('room_id');
  });

  it('shows node ids under one name across node ops', () => {
    expect(paramsDesc('vibe3d_node')).toContain('reparent{node_id,parent}');
    expect(paramsDesc('vibe3d_node')).not.toContain('reparent{id,');
    expect(paramsDesc('vibe3d_material')).toContain('patch{material_id');
  });
});

describe('help tool discovery', () => {
  const help = schemaOf('vibe3d_help');

  it('enumerates every tool name', () => {
    const names = help.properties?.tool?.enum ?? [];
    expect(names).toContain('vibe3d_node');
    expect(names).toContain('vibe3d_apply_ops');
    expect(names.length).toBe(tools.length - 1);
  });

  it('enumerates op names', () => {
    const ops = help.properties?.op?.enum ?? [];
    expect(ops).toContain('create');
    expect(ops).toContain('snapshot');
  });
});

describe('apply_ops payload contract', () => {
  const items = schemaOf('vibe3d_apply_ops').properties?.ops?.items ?? {};
  const arms: any[] = items.oneOf ?? [];
  const armOf = (op: string) => arms.find((arm) => arm?.properties?.op?.const === op);

  it('only guards the ops that carry a composite payload', () => {
    const enumLen = (items.properties?.op?.enum ?? []).length;
    expect(arms.length).toBeLessThan(enumLen);
    expect(armOf('node.create')).toBeTruthy();
    expect(armOf('animation.stop')).toBeUndefined();
  });

  it('requires the wrapper field of a composite op', () => {
    expect(armOf('node.create')?.required).toContain('node');
    expect(armOf('env.set')?.required).toContain('env');
    expect(armOf('stage.set')?.required).toContain('stage');
  });

  it('keeps camera.set open because every field is optional', () => {
    expect(armOf('camera.set')?.required).toEqual(['op']);
  });

  it('requires the id field of a node patch op', () => {
    expect(armOf('node.update')?.required).toContain('id');
  });
});
