import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../common/Icon';
import { rpc } from '../lib/rpc';

interface RoomSummary {
  roomId: string;
  name: string;
  revision: number;
  nodeCount: number;
  updatedAt: string;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(t).toLocaleDateString();
}

export function RoomListPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await rpc<{ rooms: RoomSummary[] }>('room.list');
      setRooms(res.rooms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await rpc<{ roomId: string }>('room.create', { name: name.trim() || '未命名场景' });
      setName('');
      navigate(`/r/${res.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pb-4 pt-9">
        <header className="border-b border-base-300 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] tracking-[0.28em] text-base-content/45">VIBEBYTE · VIBE3D</p>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <h1 className="text-[22px] font-semibold tracking-tight">场景房间</h1>
                <span className="num text-[11px] text-base-content/45">{rooms.length} 个</span>
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-base-content/55">
                每个房间是一个可协作的 3D 文档：几何体、材质、相机与光照都由 daemon 持有，编辑器只负责呈现。
              </p>
            </div>
            <form
              className="flex w-full items-center gap-2 sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <input
                className="h-9 flex-1 rounded-lg border border-base-300 bg-base-200/60 px-3 text-[12.5px] text-base-content outline-none transition placeholder:text-base-content/40 focus:border-primary/50 focus:bg-base-200 sm:w-60"
                placeholder="新房间名称，回车创建"
                aria-label="新房间名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-content transition hover:brightness-110 disabled:opacity-40"
                disabled={busy}
              >
                <Icon name="plus" size={13} />
                新建房间
              </button>
            </form>
          </div>
        </header>

        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-xs text-error">
            <Icon name="alert" size={14} />
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.roomId}
              to={`/r/${room.roomId}`}
              className="room-card group"
              aria-label={`打开房间 ${room.name}`}
            >
              <div className="room-cover">
                <Icon name="layers" size={22} />
                <span className="chip num absolute right-2 top-2 h-4" title={`修订 ${room.revision}`}>
                  rev {room.revision}
                </span>
              </div>
              <div className="px-3.5 pb-3 pt-3">
                <h2 className="truncate text-[14px] font-medium tracking-tight">{room.name}</h2>
                <p className="num mt-0.5 truncate text-[10px] text-base-content/45">{room.roomId}</p>
                <div className="mt-2.5 flex items-center gap-2 text-[10.5px] text-base-content/50">
                  <span className="num">
                    节点 <span className="text-base-content/75">{room.nodeCount}</span>
                  </span>
                  <span className="size-0.5 rounded-full bg-base-content/20" />
                  <span>{relTime(room.updatedAt)}</span>
                  <Icon
                    name="arrow"
                    size={11}
                    className="ml-auto -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-70"
                  />
                </div>
              </div>
            </Link>
          ))}

          {rooms.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-base-300 px-6 py-12 text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-base-200 text-base-content/35">
                <Icon name="layers" size={18} />
              </span>
              <p className="mt-3 text-xs text-base-content/50">还没有房间</p>
              <p className="mt-1 text-[11px] text-base-content/45">在上方输入名称，创建第一个场景。</p>
            </div>
          )}
        </div>

        <footer className="mt-auto flex items-center gap-2 pt-10 text-[10.5px] text-base-content/45">
          <i className="dot text-primary" />
          daemon 为唯一真源 · 浏览器只是客户端
        </footer>
      </div>
    </div>
  );
}
