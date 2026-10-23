import { AppError, ERROR_SPECS, type ErrorCode } from '@vibebyte/vibe3d-protocol';
import { Vibe3DError, toVibe3DError } from './errors';
import type { HealthInfo, Transport } from './transport';

export interface MockTransportOptions {
  dispatch: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  uploadAsset?: (roomId: string, bytes: Uint8Array | Blob, name: string) => Promise<unknown>;
  health?: () => Promise<HealthInfo>;
}

const notWired = () => new Vibe3DError('E_NETWORK', 'mock transport 未实现该能力', undefined, 0);

export function mockTransport(opts: MockTransportOptions): Transport {
  return {
    async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      try {
        return (await opts.dispatch(method, params)) as T;
      } catch (err) {
        if (err instanceof AppError) {
          const spec = ERROR_SPECS[err.code as ErrorCode];
          throw toVibe3DError(err.code, err.message, err.data, spec?.http);
        }
        throw err;
      }
    },
    async uploadAsset(roomId, bytes, name) {
      if (!opts.uploadAsset) throw notWired();
      return opts.uploadAsset(roomId, bytes, name);
    },
    async health() {
      if (!opts.health) throw notWired();
      return opts.health();
    },
  };
}
