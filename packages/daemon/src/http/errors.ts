import { AppError, ERROR_SPECS, isAppError } from '@vibebyte/vibe3d-protocol';
import type { ErrorCode } from '@vibebyte/vibe3d-protocol';

export interface RpcErrorBody {
  code: number;
  message: string;
  data: { code: ErrorCode; retryable: boolean; [k: string]: unknown };
}

export interface RpcFailure {
  status: number;
  body: RpcErrorBody;
}

export function toRpcFailure(err: unknown): RpcFailure {
  if (isAppError(err)) {
    return {
      status: err.http,
      body: {
        code: err.rpc,
        message: err.message,
        data: { code: err.code, retryable: err.retryable, ...(err.toJSON().data ?? {}) },
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  const spec = ERROR_SPECS.E_INTERNAL;
  return {
    status: spec.http,
    body: { code: spec.rpc, message, data: { code: 'E_INTERNAL', retryable: true } },
  };
}

export const fail = (code: ErrorCode, message?: string, data?: Record<string, unknown>): never => {
  throw new AppError(code, message, data);
};
