import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type RoomId, emptyDoc, sceneDocSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { flushRoom } from '../src/doc/persist';
import { Room } from '../src/rooms/room';
import { WsHub } from '../src/ws/hub';

const ROOM = 'r_ab12cd34' as RoomId;
const stage = (preset: 'flat' | 'cine' | 'clean') => [{ op: 'stage.set' as const, stage: { preset } }];

function room(): Room {
  return new Room(structuredClone(emptyDoc()), ROOM);
}

describe('写队列', () => {
  it('并发写入串行化，revision 不丢', async () => {
    const r = room();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => r.run(() => r.apply(stage(i % 2 ? 'cine' : 'flat')))),
    );
    expect(results.map((x) => x.revision).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(r.revision).toBe(50);
    expect(r.opsAt(50).length).toBe(1);
  });

  it('任务抛错不阻塞队列，前序写入保留', async () => {
    const r = room();
    await r.run(() => r.apply(stage('cine')));
    await expect(r.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    const next = await r.run(() => r.apply(stage('flat')));
    expect(next.revision).toBe(2);
    expect(r.doc.stage.preset).toBe('flat');
  });

  it('非法 ops 被拒后 doc 不变', async () => {
    const r = room();
    await r.run(() => r.apply(stage('cine')));
    const before = structuredClone(r.doc);
    await expect(r.run(() => r.apply([{ op: 'node.delete', id: 'n_missing0' } as never]))).rejects.toThrow();
    expect(r.doc).toEqual(before);
  });
});

describe('opId 重放', () => {
  it('同一 opId 重放返回首次结果，只落一次盘', async () => {
    const r = room();
    const first = await r.run(() => r.apply(stage('cine'), { opId: 'op-1' }));
    const again = await r.run(() => r.apply(stage('flat'), { opId: 'op-1' }));
    expect(again).toEqual(first);
    expect(r.revision).toBe(1);
    expect(r.doc.stage.preset).toBe('cine');
  });

  it('不同 opId 各记一次', async () => {
    const r = room();
    await r.run(() => r.apply(stage('cine'), { opId: 'op-1' }));
    const second = await r.run(() => r.apply(stage('flat'), { opId: 'op-2' }));
    expect(second.revision).toBe(2);
    expect(r.doc.stage.preset).toBe('flat');
  });
});

describe('WS 慢消费者', () => {
  function socket(bufferedAmount = 0) {
    const sent: string[] = [];
    const closed: Array<{ code?: number; reason?: string }> = [];
    return {
      sent,
      closed,
      bufferedAmount,
      send: (data: string) => void sent.push(data),
      close: (code?: number, reason?: string) => void closed.push({ code, reason }),
    };
  }

  it('缓冲超限：发 overflow、1013 关闭并摘除', () => {
    const hub = new WsHub();
    const slow = socket();
    const ok = socket();
    hub.add(ROOM, slow);
    hub.add(ROOM, ok);
    slow.bufferedAmount = 5 * 1024 * 1024;
    hub.event(ROOM, 'scene.changed', { revision: 7 });
    expect(slow.closed).toEqual([{ code: 1013, reason: 'slow consumer' }]);
    const frames = slow.sent.map((s) => JSON.parse(s) as { type: string; revision?: number });
    expect(frames.filter((f) => f.type === 'overflow')).toEqual([{ type: 'overflow', revision: 7 }]);
    expect(frames.at(-1)).toMatchObject({ type: 'overflow', revision: 7 });
    expect(hub.count(ROOM)).toBe(1);
    expect(ok.sent.length).toBeGreaterThan(0);
  });

  it('快照请求超时后清理 waiter', async () => {
    const hub = new WsHub();
    hub.add(ROOM, socket());
    await expect(hub.requestSnapshot(ROOM, {}, 10)).rejects.toThrow('editor 快照超时');
    hub.resolveSnapshot('nope');
  });
});

describe('写队列中途 kill', () => {
  it('中断的写入不落盘，重启恢复到最近一次 flush', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe3d-crash-'));
    const r = room();
    await r.run(() => r.apply(stage('cine')));
    flushRoom(dir, r);

    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const hung = r.run(async () => {
      await gate;
      return r.apply(stage('flat'));
    });
    let queuedDone = false;
    const queued = r
      .run(() => r.apply(stage('flat')))
      .then(() => {
        queuedDone = true;
      });
    await Promise.resolve();
    expect(queuedDone).toBe(false);

    const onDisk = JSON.parse(readFileSync(join(dir, `${ROOM}.json`), 'utf8')) as {
      doc: { revision: number; stage: { preset: string } };
    };
    expect(onDisk.doc.revision).toBe(1);
    expect(onDisk.doc.stage.preset).toBe('cine');

    const revived = new Room(sceneDocSchema.parse(onDisk.doc), ROOM);
    expect(revived.revision).toBe(1);
    const next = await revived.run(() => revived.apply(stage('flat')));
    expect(next.revision).toBe(2);

    release();
    await hung;
    await queued;
  });
});

describe('锁竞争', () => {
  it('房间之间互不阻塞：A 卡住不影响 B 写入', async () => {
    const a = room();
    const b = room();
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const blocked = a.run(async () => {
      await gate;
      return a.apply(stage('cine'));
    });
    const fast = await b.run(() => b.apply(stage('flat')));
    expect(fast.revision).toBe(1);
    expect(a.revision).toBe(0);
    release();
    expect((await blocked).revision).toBe(1);
  });

  it('同房间 apply / undo 交错仍串行，revision 单调', async () => {
    const r = room();
    await r.run(() => r.apply(stage('cine')));
    const results = await Promise.all([
      r.run(() => r.apply(stage('flat'))),
      r.run(() => r.undo()),
      r.run(() => r.apply(stage('cine'))),
    ]);
    expect(results.map((x) => x.revision)).toEqual([2, 3, 4]);
    expect(r.revision).toBe(4);
    expect(r.doc.stage.preset).toBe('cine');
  });
});

describe('持久化', () => {
  it('原子落盘：文件可解析、无残留 tmp', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe3d-persist-'));
    const r = room();
    await r.run(() => r.apply(stage('cine')));
    flushRoom(dir, r);
    const files = readdirSync(dir);
    expect(files).toEqual([`${ROOM}.json`]);
    const saved = JSON.parse(readFileSync(join(dir, `${ROOM}.json`), 'utf8')) as {
      doc: { revision: number };
    };
    expect(saved.doc.revision).toBe(1);
  });

  it('崩溃残留的 tmp 不影响正式文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe3d-persist-'));
    const r = room();
    await r.run(() => r.apply(stage('flat')));
    flushRoom(dir, r);
    writeFileSync(join(dir, `${ROOM}.json.tmp`), '{broken', 'utf8');
    const saved = JSON.parse(readFileSync(join(dir, `${ROOM}.json`), 'utf8')) as {
      doc: { stage: { preset: string } };
    };
    expect(saved.doc.stage.preset).toBe('flat');
  });
});
