import { AppError, type AssetMeta, type Op, type RoomId, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import {
  type ChangedPaths,
  type OpSummary,
  applyOps,
  changedPaths,
  validateDoc,
} from '@vibebyte/vibe3d-scene';
import { currentAuthor } from '../author';

export interface ApplyResult {
  revision: number;
  applied: number;
  warnings: string[];
  inverse: Op[];
  summary: OpSummary;
}

export interface AuthorEntry {
  revision: number;
  author: string;
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
  private history = new Map<number, SceneDoc>();
  private opIds = new Map<string, number>();
  private authors = new Map<number, string>();
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
    opts: { expectRevision?: number; opId?: string; author?: string } = {},
  ): Promise<ApplyResult> {
    if (opts.opId) {
      const hit = this.applied.get(opts.opId);
      if (hit) return hit;
    }
    if (opts.expectRevision !== undefined && opts.expectRevision !== this.doc.revision) {
      throw this.conflict(opts.expectRevision);
    }

    const before = this.doc;
    const { doc, inverse, warnings, summary } = applyOps(before, ops);
    const next: SceneDoc = {
      ...doc,
      revision: before.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    validateDoc(next);

    const snapshot = structuredClone(before);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.remember(before.revision, snapshot);
    this.redoStack = [];
    this.commit(next, ops, opts.author ?? currentAuthor());

    const result: ApplyResult = { revision: next.revision, applied: ops.length, warnings, inverse, summary };
    if (opts.opId) {
      this.opIds.set(opts.opId, next.revision);
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

  async undoOp(opId: string): Promise<{ revision: number; undone: number; warnings: string[] }> {
    const target = this.opIds.get(opId);
    if (target === undefined) {
      throw new AppError('E_INVALID_PARAMS', `未知 opId：${opId}（该步不在可回放窗口内）`);
    }
    const base = this.history.get(target - 1);
    if (!base) {
      throw new AppError('E_INVALID_PARAMS', `opId 对应版本已不可回放：${opId}`);
    }
    const head = this.revision;
    const warnings: string[] = [];
    let doc = structuredClone(base);
    for (let rev = target + 1; rev <= head; rev++) {
      const batch = this.opLog.get(rev);
      if (!batch) {
        warnings.push(`revision ${rev} 缺少 op 记录，已跳过`);
        continue;
      }
      try {
        doc = applyOps(doc, batch).doc;
      } catch (err) {
        warnings.push(
          `revision ${rev} 重放失败，已跳过：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const next: SceneDoc = { ...doc, revision: head + 1, updatedAt: new Date().toISOString() };
    validateDoc(next);
    this.undoStack.push(structuredClone(this.doc));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.history.clear();
    this.remember(head, structuredClone(this.doc));
    this.opIds.clear();
    this.applied.clear();
    this.commit(next, []);
    return { revision: next.revision, undone: 1, warnings };
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

  diff(
    since: number,
    to?: number,
  ): {
    fromRevision: number;
    toRevision: number;
    ops: Op[];
    reset: boolean;
    authors: AuthorEntry[];
  } {
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
    const authors = reset
      ? []
      : [...this.authors.entries()]
          .filter(([revision]) => revision > since && revision <= toRevision)
          .sort(([a], [b]) => a - b)
          .map(([revision, author]) => ({ revision, author }));
    return { fromRevision: since, toRevision, ops: reset ? [] : ops, reset, authors };
  }

  opsAt(revision: number): Op[] {
    return this.opLog.get(revision) ?? [];
  }

  changedSince(expectRevision: number): ChangedPaths {
    const base = this.history.get(expectRevision);
    if (!base) return { paths: [], truncated: false };
    return changedPaths(base, this.doc);
  }

  conflict(expectRevision: number, reason?: 'missingBase'): AppError {
    const revision = this.doc.revision;
    const { paths, truncated } = this.changedSince(expectRevision);
    const missing = reason === 'missingBase';
    return new AppError('E_CONFLICT', missing ? 'strict 模式下写操作必须带 baseRevision' : 'revision 冲突', {
      expectRevision,
      actualRevision: revision,
      currentRevision: revision,
      changedPaths: paths,
      truncated,
      ...(missing ? { reason } : {}),
      hint: missing
        ? `先 scene.get 取当前 revision，再带 baseRevision:${revision} 重试`
        : `先 scene.get 读回当前 revision，再用 baseRevision:${revision} 重试；changedPaths 列出你 base 之后被改动的路径`,
      next: missing
        ? { tool: 'vibe3d_ops_apply', params: { baseRevision: revision } }
        : {
            tool: 'vibe3d_scene_get',
            params: { roomId: this.id },
            after: `vibe3d_ops_apply{baseRevision:${revision}}`,
          },
    });
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

  private remember(revision: number, doc: SceneDoc): void {
    this.history.set(revision, doc);
    while (this.history.size > MAX_REVISIONS) {
      const oldest = this.history.keys().next().value;
      if (oldest === undefined) break;
      this.history.delete(oldest);
    }
  }

  private commit(next: SceneDoc, ops: readonly Op[], author?: string): void {
    this.opLog.set(next.revision, [...ops]);
    if (author) this.authors.set(next.revision, author);
    while (this.opLog.size > MAX_REVISIONS) {
      const oldest = this.opLog.keys().next().value;
      if (oldest === undefined) break;
      this.opLog.delete(oldest);
      this.authors.delete(oldest);
    }
    this.doc = next;
    this.updatedAt = next.updatedAt;
    this.onChange?.(this, { kind: 'ops', ops: [...ops] });
  }
}
