import { ERROR_CODES, ERROR_SPECS, type ErrorCode } from '@vibebyte/vibe3d-protocol';

export type Vibe3DCode = ErrorCode | 'E_NETWORK' | 'E_HTTP' | 'E_TIMEOUT' | 'E_NO_DAEMON';

export class Vibe3DError extends Error {
  readonly code: Vibe3DCode;
  readonly data?: unknown;
  readonly status?: number;

  constructor(code: Vibe3DCode, message: string, data?: unknown, status?: number) {
    super(message);
    this.name = 'Vibe3DError';
    this.code = code;
    this.data = data;
    this.status = status;
  }

  get retryable(): boolean {
    if (this.code === 'E_NETWORK' || this.code === 'E_TIMEOUT') return true;
    const spec = ERROR_SPECS[this.code as ErrorCode];
    return spec ? spec.retryable : false;
  }

  toJSON(): { code: string; message: string; data?: unknown } {
    return { code: this.code, message: this.message, data: this.data };
  }
}

const KNOWN = new Set<string>(ERROR_CODES);

export function toVibe3DError(code: string, message: string, data?: unknown, status?: number): Vibe3DError {
  const safe = KNOWN.has(code) ? (code as ErrorCode) : 'E_INTERNAL';
  return new Vibe3DError(safe, message, data, status);
}

export function isVibe3DError(err: unknown): err is Vibe3DError {
  return err instanceof Vibe3DError;
}
