import { Vibe3DError } from '@vibebyte/vibe3d-client';

/**
 * 连接层的默认房间。stdio 拿不到「这是哪个聊天」，所以默认房间只在无歧义时当便利：
 * 本进程接触过多个房间后，不带 room_id 的调用一律拒绝，由调用方显式指定。
 */
export class RoomSession {
  private bound?: string;
  private readonly seen = new Set<string>();
  private readonly names = new Map<string, string>();

  constructor(roomId?: string) {
    if (roomId) this.use(roomId);
  }

  get current(): string | undefined {
    return this.bound;
  }

  get rooms(): string[] {
    return [...this.seen];
  }

  /** 新建房间：成为默认房间，并计入本进程接触过的房间 */
  add(roomId: string): void {
    this.bound = roomId;
    this.seen.add(roomId);
  }

  /** 显式切换：调用方声明「本进程只有我在用」，之前接触过的房间不再算歧义 */
  use(roomId: string): void {
    this.bound = roomId;
    this.seen.clear();
    this.seen.add(roomId);
  }

  /** 显式寻址读到房间时：仅在还没有默认房间时采纳，不改写已有绑定 */
  adopt(roomId: string): void {
    if (!this.bound) this.use(roomId);
  }

  release(roomId: string): void {
    this.seen.delete(roomId);
    this.names.delete(roomId);
    if (this.bound === roomId) this.bound = undefined;
    const [only] = this.seen;
    if (!this.bound && this.seen.size === 1 && only) this.bound = only;
  }

  setName(roomId: string, name: string): void {
    this.names.set(roomId, name);
  }

  label(roomId: string): string {
    const name = this.names.get(roomId);
    return name ? `${roomId}「${name}」` : roomId;
  }

  require(): string {
    if (this.seen.size > 1) {
      const rooms = this.rooms.map((id) => this.label(id)).join('、');
      throw new Vibe3DError(
        'E_INVALID_PARAMS',
        `本进程已接触多个房间（${rooms}），无法判断这次作用于哪一个。请在调用里显式传 room_id（用你自己建房时返回的 id；房间列表见 vibe3d_room {op:"list"}）。`,
        { rooms: this.rooms },
      );
    }
    if (!this.bound) {
      throw new Vibe3DError(
        'E_INVALID_PARAMS',
        '当前会话还没绑定房间：先调用 vibe3d_create_room 建房（或 vibe3d_use_room 绑定已有房间），或在本次调用里显式传 room_id。',
      );
    }
    return this.bound;
  }
}
