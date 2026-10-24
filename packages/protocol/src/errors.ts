export const PROTOCOL_VERSION = '0.1';
export const DAEMON_VERSION = '0.1.0';
export const DOC_SCHEMA_VERSION = 1;

export const ERROR_CODES = [
  'E_PARSE',
  'E_INVALID_REQUEST',
  'E_NO_METHOD',
  'E_INVALID_PARAMS',
  'E_INTERNAL',
  'E_ROOM_NOT_FOUND',
  'E_CONFLICT',
  'E_ASSET_MISSING',
  'E_RENDER_UNAVAILABLE',
  'E_PROTOCOL',
  'E_ROOM_LIMIT',
  'E_PAYLOAD_TOO_LARGE',
  'E_UNAUTHORIZED',
  'E_JOB_NOT_FOUND',
  'E_UNSUPPORTED',
  'E_LOCKED',
  'E_ASSET_FORMAT',
  'E_ASSET_EXTERNAL_REFS',
  'E_RATE_LIMITED',
  'E_ASSET_TYPE',
  'E_ASSET_IN_USE',
  'E_LIMIT_EXCEEDED',
  'E_BUSY',
  'E_CHECKPOINT_NOT_FOUND',
  'E_NODE_NOT_FOUND',
  'E_MATERIAL_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorSpec {
  rpc: number;
  http: number;
  retryable: boolean;
  message: string;
}

export const ERROR_SPECS: Record<ErrorCode, ErrorSpec> = {
  E_PARSE: { rpc: -32700, http: 400, retryable: false, message: '非法 JSON' },
  E_INVALID_REQUEST: { rpc: -32600, http: 400, retryable: false, message: '信封字段缺失或非法' },
  E_NO_METHOD: { rpc: -32601, http: 404, retryable: false, message: '方法不存在' },
  E_INVALID_PARAMS: { rpc: -32602, http: 400, retryable: false, message: '参数校验失败' },
  E_INTERNAL: { rpc: -32603, http: 500, retryable: true, message: '内部错误' },
  E_ROOM_NOT_FOUND: { rpc: -32001, http: 404, retryable: false, message: '房间不存在' },
  E_CONFLICT: { rpc: -32002, http: 409, retryable: true, message: 'revision 冲突' },
  E_ASSET_MISSING: { rpc: -32003, http: 422, retryable: false, message: '资产不存在' },
  E_RENDER_UNAVAILABLE: { rpc: -32004, http: 503, retryable: true, message: '渲染器不可用' },
  E_PROTOCOL: { rpc: -32005, http: 426, retryable: false, message: '协议版本不匹配' },
  E_ROOM_LIMIT: { rpc: -32006, http: 429, retryable: true, message: '房间数已达上限' },
  E_PAYLOAD_TOO_LARGE: { rpc: -32007, http: 413, retryable: false, message: '请求体过大' },
  E_UNAUTHORIZED: { rpc: -32008, http: 401, retryable: false, message: '未授权' },
  E_JOB_NOT_FOUND: { rpc: -32009, http: 404, retryable: false, message: '任务不存在或已过期' },
  E_UNSUPPORTED: { rpc: -32010, http: 400, retryable: false, message: '当前房间不支持该操作' },
  E_LOCKED: { rpc: -32011, http: 409, retryable: true, message: '持久化目录已被占用' },
  E_ASSET_FORMAT: { rpc: -32012, http: 422, retryable: false, message: 'glTF 解析失败' },
  E_ASSET_EXTERNAL_REFS: { rpc: -32013, http: 422, retryable: false, message: 'glTF 非自包含' },
  E_RATE_LIMITED: { rpc: -32014, http: 429, retryable: true, message: '请求过于频繁' },
  E_ASSET_TYPE: { rpc: -32015, http: 415, retryable: false, message: '资产类型不支持' },
  E_ASSET_IN_USE: { rpc: -32016, http: 409, retryable: false, message: '资产仍被引用' },
  E_LIMIT_EXCEEDED: { rpc: -32017, http: 409, retryable: false, message: '超出容量上限' },
  E_BUSY: { rpc: -32018, http: 429, retryable: true, message: '队列已满，请稍后重试' },
  E_CHECKPOINT_NOT_FOUND: { rpc: -32019, http: 404, retryable: false, message: '检查点不存在' },
  E_NODE_NOT_FOUND: { rpc: -32020, http: 404, retryable: false, message: '节点不存在' },
  E_MATERIAL_NOT_FOUND: { rpc: -32021, http: 404, retryable: false, message: '材质不存在' },
};

export interface AppErrorData {
  code: ErrorCode;
  message: string;
  data?: Record<string, unknown>;
  retryable: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly data: Record<string, unknown> | undefined;
  readonly http: number;
  readonly rpc: number;

  constructor(code: ErrorCode, message?: string, data?: Record<string, unknown>) {
    const spec = ERROR_SPECS[code];
    super(message ?? spec.message);
    this.name = 'AppError';
    this.code = code;
    this.data = data;
    this.http = spec.http;
    this.rpc = spec.rpc;
  }

  get retryable(): boolean {
    return ERROR_SPECS[this.code].retryable;
  }

  toJSON(): AppErrorData {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.data ? { data: this.data } : {}),
    };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
