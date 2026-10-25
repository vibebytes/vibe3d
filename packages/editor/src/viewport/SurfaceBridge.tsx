import { useEffect } from 'react';
import { installSurfaceHandshake } from '../lib/surface-handshake';
import type { SurfaceCapability } from '../lib/surface-handshake';
import { applyGrant } from '../lib/surface-grant';

/** Capabilities this editor actually implements; the host rejects anything it did not declare. */
const CAPABILITIES: readonly SurfaceCapability[] = ['tool.call'];

/**
 * Page side of the host handshake. Mounted once at the app root; a standalone tab (no parent
 * frame) installs nothing and behaves exactly as before.
 */
export function SurfaceBridge() {
  useEffect(() => {
    console.info('[surface] mount', { href: window.location.href, embedded: window.parent !== window });
    return installSurfaceHandshake({
      win: window,
      capabilities: CAPABILITIES,
      onGrant: (grant) => {
        console.info('[surface] grant', { surfaceId: grant.surfaceId, toolScope: grant.toolScope });
        applyGrant(grant);
      },
    });
  }, []);
  return null;
}
