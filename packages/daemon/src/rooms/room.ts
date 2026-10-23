import { AppError, type AssetMeta, type Op, type RoomId, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps, validateDoc } from '@vibebyte/vibe3d-scene';

export interface ApplyResult {
  revision: number;
  applied: number;
  warnings: string[];
  inverse: Op[];
}

export interface ChangeInfo {
  kind: 'ops' | 'undo' | 'redo' | 'assets';
  ops: Op[];
}

export interface RoomMeta {
  roomId: RoomId;
  name: string;
  revision: number;
  nodes: number;
  createdAt: string;
  updatedAt: string;
}

const MAX_HISTORY = 100;
const MAX_REVISIONS = 200;

export interface RoomOptions {
  createdAt?: string;
  onChange?: (room: Room, change: ChangeInfo) => void;
}

export class Room {
  readonly id: RoomId;
  readonly createdAt: string;
  doc: SceneDoc;
  updatedAt: string;
  private readonly onChange?: (room: Room, change: ChangeInfo) => void;

  private queue: Promise<unknown> = Promise.resolve();
  private undoStack: SceneDoc[] = [];
  private redoStack: SceneDoc[] = [];
  private opLog = new Map<number, Op[]>();
  private applied = new Map<string, ApplyResult>();

  constructor(doc: SceneDoc, roomId: RoomId, opts: RoomOptions = {}) {
    this.id = roomId;
    this.doc = doc;
    this.createdAt = opts.createdAt ?? new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.onChange = opts.onChange;
  }

  get revision(): number {
    return this.doc.revision;
  }

  get name(): string {
    return this.doc.name;
  }

  meta(): RoomMeta {
    return {
      roomId: this.id,
      name: this.doc.name,
      revision: this.doc.revision,
      nodes: Object.keys(this.doc.nodes).length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async apply(
    ops: readonly Op[],
    opts: { expectRevision?: number; opId?: string } = {},
  ): Promise<ApplyResult> {
    if (opts.opId) {
      const hit = this.applied.get(opts.opId);
      if (hit) return hit;
    }
    if (opts.expectRevision !== undefined && opts.expectRevision !== this.doc.revision) {
      throw new AppError('E_CONFLICT', 'revision 冲突', {
        currentRevision: this.doc.revision,
      });
    }

    const before = this.doc;
    const { doc, inverse, warnings } = applyOps(before, ops);
    const next: SceneDoc = {
      ...doc,
      revision: before.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    validateDoc(next);

    this.undoStack.push(structuredClone(before));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.commit(next, ops);

    const result: ApplyResult = { revision: next.revision, applied: ops.length, warnings, inverse };
    if (opts.opId) {
      this.applied.set(opts.opId, result);
      if (this.applied.size > 500) {
        const oldest = this.applied.keys().next().value;
        if (oldest !== undefined) this.applied.delete(oldest);
      }
    }
    return result;
  }

  async undo(steps = 1): Promise<{ revision: number; undone: number }> {
    const base = this.revision;
    let undone = 0;
    let target: SceneDoc | undefined;
    while (undone < steps) {
      target = this.undoStack.pop();
      if (!target) break;
      this.redoStack.push(structuredClone(this.doc));
      this.doc = target;
      undone++;
    }
    if (undone === 0) return { revision: base, undone: 0 };
    this.doc = { ...this.doc, revision: base + undone, updatedAt: new Date().toISOString() };
    this.updatedAt = this.doc.updatedAt;
    this.applied.clear();
    this.onChange?.(this, { kind: 'undo', ops: [] });
    return { revision: this.doc.revision, undone };
  }

  async redo(steps = 1): Promise<{ revision: number; redone: number }> {
    const base = this.revision;
    let redone = 0;
    while (redone < steps) {
      const target = this.redoStack.pop();
      if (!target) break;
      this.undoStack.push(structuredClone(this.doc));
      this.doc = target;
      redone++;
    }
    if (redone === 0) return { revision: base, redone: 0 };
    this.doc = { ...this.doc, revision: base + redone, updatedAt: new Date().toISOString() };
    this.updatedAt = this.doc.updatedAt;
    this.applied.clear();
    this.onChange?.(this, { kind: 'redo', ops: [] });
    return { revision: this.doc.revision, redone };
  }

  diff(since: number, to?: number): { fromRevision: number; toRevision: number; ops: Op[]; reset: boolean } {
    const toRevision = Math.min(to ?? this.doc.revision, this.doc.revision);
    const ops: Op[] = [];
    let reset = false;
    for (let rev = since + 1; rev <= toRevision; rev++) {
      const batch = this.opLog.get(rev);
      if (!batch) {
        reset = true;
        continue;
      }
      ops.push(...batch);
    }
    return { fromRevision: since, toRevision, ops: reset ? [] : ops, reset };
  }

  opsAt(revision: number): Op[] {
    return this.opLog.get(revision) ?? [];
  }

  registerAsset(meta: AssetMeta): AssetMeta {
    const known = this.doc.assets[meta.sha];
    if (known) return known;
    const updatedAt = new Date().toISOString();
    this.doc = {
      ...this.doc,
      assets: { ...this.doc.assets, [meta.sha]: meta },
      updatedAt,
    };
    this.updatedAt = updatedAt;
    this.onChange?.(this, { kind: 'assets', ops: [] });
    return meta;
  }

  private commit(next: SceneDoc, ops: readonly Op[]): void {
    this.opLog.set(next.revision, [...ops]);
    while (this.opLog.size > MAX_REVISIONS) {
      const oldest = this.opLog.keys().next().value;
      if (oldest === undefined) break;
      this.opLog.delete(oldest);
    }
    this.doc = next;
    this.updatedAt = next.updatedAt;
    this.onChange?.(this, { kind: 'ops', ops: [...ops] });
  }
}
