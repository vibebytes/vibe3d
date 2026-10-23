import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '../lib/rpc';

interface RoomSummary {
  roomId: string;
  name: string;
  revision: number;
  nodeCount: number;
  updatedAt: string;
}

export function RoomListPage() {
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
    setBusy(true);
    try {
      const res = await rpc<{ roomId: string }>('room.create', { name: name.trim() || '未命名场景' });
      setName('');
      await load();
      window.location.assign(`/r/${res.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-base-content/40">vibebyte · vibe3d</p>
          <h1 className="mt-2 text-2xl font-semibold">房间</h1>
        </div>
        <div className="join">
          <input
            className="input join-item input-sm w-56"
            placeholder="新房间名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <button
            type="button"
            className="btn join-item btn-primary btn-sm"
            disabled={busy}
            onClick={() => void create()}
          >
            新建
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error text-sm">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.length === 0 && <p className="text-sm text-base-content/50">还没有房间，先建一个。</p>}
        {rooms.map((room) => (
          <Link
            key={room.roomId}
            to={`/r/${room.roomId}`}
            className="card border border-base-300 bg-base-200 transition hover:border-primary"
          >
            <div className="card-body gap-2 p-4">
              <div className="flex items-center justify-between">
                <h2 className="card-title text-sm">{room.name}</h2>
                <span className="badge badge-ghost badge-sm num">r{room.revision}</span>
              </div>
              <p className="text-xs text-base-content/45">
                <span className="num">{room.roomId}</span> · 节点{' '}
                <span className="num">{room.nodeCount}</span>
              </p>
              <p className="text-[11px] text-base-content/30 num">
                {new Date(room.updatedAt).toLocaleString()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
