import type { HostGrant } from './surface-handshake';
import { useSurface } from '../stores/surface';

/**
 * Record a host grant. The grant's bearer is minted by the *host* engine and only authorises
 * host-side tool calls; the daemon bearer comes from the editor URL (`?t=`) and is the only one
 * `/rpc` and the room socket accept. Overwriting it here would 401 every call, so the two are
 * kept apart: grant → store, daemon token → rpc.
 */
export function applyGrant(grant: HostGrant): void {
  useSurface.getState().setGrant(grant);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vibe3d:token'));
}
