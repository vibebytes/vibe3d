import { Vibe3DError } from '@vibebyte/vibe3d-client';

/**
 * 房间绑定是连接层状态：一个 MCP 进程同一时刻只作用于一个房间，
 * 所以 room 级工具的参数里不出现 room_id。
 */
export class RoomSession {
  private bound?: string;

  constructor(initial?: string) {
    this.bound = initial;
  }

  get current(): string | undefined {
    return this.bound;
  }

  bind(roomId: string): void {
    this.bound = roomId;
  }

  release(roomId: string): void {
    if (this.bound === roomId) this.bound = undefined;
  }

  require(): string {
    if (!this.bound) {
      throw new Vibe3DError(
        'E_INVALID_PARAMS',
        '当前会话还没绑定房间：先调用 vibe3d_create_room 建房（或用 vibe3d_open_editor 打开）；之后 scene/node/render 类工具都作用于该房间。',
      );
    }
    return this.bound;
  }
}
