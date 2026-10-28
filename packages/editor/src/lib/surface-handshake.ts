/**
 * Host-panel handshake, page side. Only active when the editor is embedded in a host iframe
 * (fast desktop `SurfaceHost`); a standalone tab never sees `host.ready` and stays untouched.
 *
 * Protocol (see agent/docs/vibe3d/fast-agent-extention-vibe3d-design.md §7.2.4):
 *   host → {kind:'host.ready', surfaceId, instanceKey, theme, size}
 *   page → {kind:'surface.ready', capabilities}
 *   host → {kind:'host.token', token, toolScope}
 */

export type SurfaceCapability = 'tool.call' | 'clipboard' | 'open-external';

export type HostMsg =
  | {
      kind: 'host.ready';
      surfaceId: string;
      instanceKey: string;
      theme: 'dark' | 'light';
      size: { width: number; height: number };
    }
  | { kind: 'host.token'; token: string; toolScope: string[] };

export type PageMsg =
  | { kind: 'surface.ready'; capabilities: SurfaceCapability[] }
  | { kind: 'surface.openExternal'; url: string }
  | { kind: 'surface.size'; width: number; height: number };

export interface HostGrant {
  surfaceId: string;
  instanceKey: string;
  theme: 'dark' | 'light';
  token: string;
  toolScope: string[];
}

export interface HandshakeDeps {
  /** The page window; `parent` is the host frame. */
  win: Window;
  /** Capabilities this page actually implements. */
  capabilities: readonly SurfaceCapability[];
  /** Called once per accepted `host.token`. */
  onGrant: (grant: HostGrant) => void;
  /** Called on every `host.ready` (theme / size may change on resize). */
  onHostReady?: (msg: Extract<HostMsg, { kind: 'host.ready' }>) => void;
}

const LOG = '[surface]';

function log(event: string, detail: Record<string, unknown> = {}): void {
  console.info(LOG, event, detail);
}

function isHostMsg(data: unknown): data is HostMsg {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  if (msg.kind === 'host.ready') {
    return (
      typeof msg.surfaceId === 'string' &&
      typeof msg.instanceKey === 'string' &&
      (msg.theme === 'dark' || msg.theme === 'light')
    );
  }
  if (msg.kind === 'host.token') {
    return typeof msg.token === 'string' && msg.token.length > 0 && Array.isArray(msg.toolScope);
  }
  return false;
}

/** Only the parent frame may drive the handshake; any other window is ignored. */
export function isFromParent(win: Window, source: MessageEventSource | null): boolean {
  return source !== null && source === win.parent;
}

/**
 * Install the page side of the handshake. Returns a disposer.
 * Safe to call in a standalone tab: nothing is posted until `host.ready` arrives.
 */
export function installSurfaceHandshake(deps: HandshakeDeps): () => void {
  const { win, capabilities, onGrant, onHostReady } = deps;
  const parent = win.parent;
  if (!parent || parent === win) {
    log('open', { embedded: false, href: win.location?.href ?? '' });
    log('standalone', { reason: 'no_parent_frame' });
    return () => {};
  }
  log('open', { embedded: true, href: win.location?.href ?? '' });

  let ready = false;
  let host: Extract<HostMsg, { kind: 'host.ready' }> | null = null;
  const post = (msg: PageMsg) => parent.postMessage(msg, '*');

  const onMessage = (ev: MessageEvent) => {
    if (!isFromParent(win, ev.source)) {
      log('ignore', { reason: 'not_from_parent', kind: (ev.data as { kind?: unknown })?.kind });
      return;
    }
    if (!isHostMsg(ev.data)) {
      log('ignore', { reason: 'bad_message', kind: (ev.data as { kind?: unknown })?.kind });
      return;
    }
    const msg = ev.data;
    if (msg.kind === 'host.ready') {
      host = msg;
      log('handshake', {
        surfaceId: msg.surfaceId,
        instanceKey: msg.instanceKey,
        theme: msg.theme,
        size: msg.size,
        first: !ready,
      });
      onHostReady?.(msg);
      if (!ready) {
        ready = true;
        post({ kind: 'surface.ready', capabilities: [...capabilities] });
        log('ready', {
          capabilities: [...capabilities],
          surfaceId: msg.surfaceId,
          instanceKey: msg.instanceKey,
        });
      }
      return;
    }
    log('token', { toolScope: msg.toolScope, surfaceId: host?.surfaceId ?? '' });
    onGrant({
      surfaceId: host?.surfaceId ?? '',
      instanceKey: host?.instanceKey ?? '',
      theme: host?.theme ?? 'dark',
      token: msg.token,
      toolScope: msg.toolScope.filter((t): t is string => typeof t === 'string'),
    });
  };

  win.addEventListener('message', onMessage);
  log('listen', { capabilities: [...capabilities] });

  // The host may post `host.ready` before this listener exists (iframe `load` fires after the
  // bundle starts). Announce readiness so the host can re-send; harmless if it already did.
  post({ kind: 'surface.ready', capabilities: [...capabilities] });
  log('announce', { capabilities: [...capabilities] });

  return () => win.removeEventListener('message', onMessage);
}
