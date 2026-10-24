import { afterEach, describe, expect, it } from 'vitest';
import { type Harness, call, makeHarness } from './helpers/harness';

const ENV = 'VIBE3D_AUTHOR';
const prev = process.env[ENV];

const setAuthor = (value: string | undefined): void => {
  if (value === undefined) Reflect.deleteProperty(process.env, ENV);
  else process.env[ENV] = value;
};

async function room(h: Harness): Promise<string> {
  const { body } = await call(h, 'room.create', { name: 'author' });
  return body.result.roomId;
}

async function create(h: Harness, roomId: string, name: string): Promise<void> {
  await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', name }, roomId);
}

const diff = async (h: Harness, roomId: string, from: number) => {
  const res = await call(h, 'scene.diff', { roomId, from }, roomId);
  expect(res.body.error).toBeUndefined();
  return res.body.result;
};

afterEach(() => {
  setAuthor(prev);
});

describe('op 作者（VIBE3D_AUTHOR）', () => {
  it('写入时带作者，scene.diff 按 revision 回读', async () => {
    setAuthor('alice');
    const h = makeHarness();
    const roomId = await room(h);
    await create(h, roomId, 'a');

    expect((await diff(h, roomId, 0)).authors).toEqual([{ revision: 1, author: 'alice' }]);
  });

  it('多批写入各记各的作者，区间过滤只看 from 之后', async () => {
    const h = makeHarness();
    const roomId = await room(h);
    setAuthor('alice');
    await create(h, roomId, 'a');
    setAuthor('bob');
    await create(h, roomId, 'b');

    expect((await diff(h, roomId, 0)).authors).toEqual([
      { revision: 1, author: 'alice' },
      { revision: 2, author: 'bob' },
    ]);
    expect((await diff(h, roomId, 1)).authors).toEqual([{ revision: 2, author: 'bob' }]);
  });

  it('未设环境变量时不记作者，authors 为空数组', async () => {
    setAuthor(undefined);
    const h = makeHarness();
    const roomId = await room(h);
    await create(h, roomId, 'a');

    const result = await diff(h, roomId, 0);
    expect(result.authors).toEqual([]);
    expect(result.ops.length).toBeGreaterThan(0);
  });

  it('作者不进场景文档、不额外抬 revision', async () => {
    setAuthor('alice');
    const h = makeHarness();
    const roomId = await room(h);
    await create(h, roomId, 'a');

    const got = await call(h, 'scene.get', { roomId }, roomId);
    expect(got.body.result.revision).toBe(1);
    expect(JSON.stringify(got.body.result.doc)).not.toContain('alice');
  });

  it('去掉首尾空白并截断到 80 字', async () => {
    setAuthor(`  ${'x'.repeat(100)}  `);
    const h = makeHarness();
    const roomId = await room(h);
    await create(h, roomId, 'a');

    const [entry] = (await diff(h, roomId, 0)).authors;
    expect(entry.author).toHaveLength(80);
    expect(entry.author).toBe('x'.repeat(80));
  });

  it('scene.import 与 ops.apply 走同一路径，同样记作者', async () => {
    setAuthor('carol');
    const h = makeHarness();
    const roomId = await room(h);
    const doc = (await call(h, 'scene.get', { roomId }, roomId)).body.result.doc;
    const res = await call(h, 'scene.import', { roomId, doc }, roomId);
    expect(res.body.error).toBeUndefined();

    expect((await diff(h, roomId, 0)).authors).toEqual([{ revision: 1, author: 'carol' }]);
  });
});
