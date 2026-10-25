import { create } from 'zustand';

export interface SurfaceGrantState {
  surfaceId: string;
  instanceKey: string;
  theme: 'dark' | 'light';
  token: string;
  toolScope: string[];
}

interface SurfaceStore {
  grant: SurfaceGrantState | null;
  setGrant(grant: SurfaceGrantState | null): void;
}

/** Host-issued panel bearer. Lives in memory only: a reload must re-handshake. */
export const useSurface = create<SurfaceStore>((set) => ({
  grant: null,
  setGrant: (grant) => set({ grant }),
}));

export function surfaceToken(): string {
  return useSurface.getState().grant?.token ?? '';
}

export function surfaceCan(tool: string): boolean {
  const grant = useSurface.getState().grant;
  return !!grant && grant.toolScope.includes(tool);
}
