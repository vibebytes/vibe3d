export const PROTOCOL_VERSION = '0.1';
export const DAEMON_VERSION = '0.2.0';
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
  'E_CAMERA_NOT_FOUND',
  'E_DAEMON_OUTDATED',
  'E_MATERIAL_IN_USE',
  'E_EXPORT_DRIFT',
  'E_BUDGET_EXCEEDED',
  'E_THUMB_MISSING',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorSpec {
  rpc: number;
  http: number;
  retryable: boolean;
  message: string;
  hint?: string;
  example?: string;
  docRef?: string;
}

export const ERROR_SPECS: Record<ErrorCode, ErrorSpec> = {
  E_PARSE: { rpc: -32700, http: 400, retryable: false, message: '非法 JSON' },
  E_INVALID_REQUEST: { rpc: -32600, http: 400, retryable: false, message: '信封字段缺失或非法' },
  E_NO_METHOD: { rpc: -32601, http: 404, retryable: false, message: '方法不存在' },
  E_INVALID_PARAMS: {
    rpc: -32602,
    http: 400,
    retryable: false,
    message: '参数校验失败',
    hint: '对照工具 inputSchema 检查类型与取值范围，颜色用 [r,g,b,a] 0..1；长度单位米、角度单位见各字段 describe',
    example: '{"op":"node.create","node":{"kind":"mesh","name":"box1","transform":{"p":[0,0.5,0],"r":[0,0,0.5236],"s":[1,1,1]}}}',
    docRef: 'vibe3d_help {tool:"vibe3d_apply_ops"} 的字段表与全局约定块',
  },
  E_INTERNAL: { rpc: -32603, http: 500, retryable: true, message: '内部错误' },
  E_ROOM_NOT_FOUND: {
    rpc: -32001,
    http: 404,
    retryable: false,
    message: '房间不存在',
    hint: '先 list_rooms / create_room；room_id 只在建房与切换时传',
  },
  E_CONFLICT: {
    rpc: -32002,
    http: 409,
    retryable: true,
    message: 'revision 冲突',
    hint: '读 data.changedPaths，用最新 revision 作 baseRevision 只重放自己那部分',
  },
  E_ASSET_MISSING: {
    rpc: -32003,
    http: 422,
    retryable: false,
    message: '资产不存在',
    hint: '先用 put_asset 登记或 node.import 导入，再按 sha 引用',
  },
  E_RENDER_UNAVAILABLE: { rpc: -32004, http: 503, retryable: true, message: '渲染器不可用' },
  E_PROTOCOL: { rpc: -32005, http: 426, retryable: false, message: '协议版本不匹配' },
  E_ROOM_LIMIT: { rpc: -32006, http: 429, retryable: true, message: '房间数已达上限' },
  E_PAYLOAD_TOO_LARGE: {
    rpc: -32007,
    http: 413,
    retryable: false,
    message: '请求体过大',
    hint: '拆分 ops 分批 apply，或压缩贴图后重传；上限见 system.status 的 limits',
    docRef: 'system.status → limits.maxPayloadBytes',
  },
  E_UNAUTHORIZED: { rpc: -32008, http: 401, retryable: false, message: '未授权' },
  E_JOB_NOT_FOUND: { rpc: -32009, http: 404, retryable: false, message: '任务不存在或已过期' },
  E_UNSUPPORTED: {
    rpc: -32010,
    http: 400,
    retryable: false,
    message: '当前房间不支持该操作',
    hint: '换一条等价路径（如先 reparent 到根），或拆成多次基础操作',
  },
  E_LOCKED: { rpc: -32011, http: 409, retryable: true, message: '持久化目录已被占用' },
  E_ASSET_FORMAT: { rpc: -32012, http: 422, retryable: false, message: 'glTF 解析失败' },
  E_ASSET_EXTERNAL_REFS: {
    rpc: -32013,
    http: 422,
    retryable: false,
    message: 'glTF 非自包含',
    hint: '用 gltf-transform copy 把 .bin 与贴图内嵌成自包含 glb 后重试',
  },
  E_RATE_LIMITED: { rpc: -32014, http: 429, retryable: true, message: '请求过于频繁' },
  E_ASSET_TYPE: { rpc: -32015, http: 415, retryable: false, message: '资产类型不支持' },
  E_ASSET_IN_USE: { rpc: -32016, http: 409, retryable: false, message: '资产仍被引用' },
  E_LIMIT_EXCEEDED: { rpc: -32017, http: 409, retryable: false, message: '超出容量上限' },
  E_BUSY: { rpc: -32018, http: 429, retryable: true, message: '队列已满，请稍后重试' },
  E_CHECKPOINT_NOT_FOUND: { rpc: -32019, http: 404, retryable: false, message: '检查点不存在' },
  E_NODE_NOT_FOUND: {
    rpc: -32020,
    http: 404,
    retryable: false,
    message: '节点不存在',
    hint: '先用 scene.query / vibe3d_get_node 确认 id；id 由服务端生成，不要自己编',
  },
  E_MATERIAL_NOT_FOUND: {
    rpc: -32021,
    http: 404,
    retryable: false,
    message: '材质不存在',
    hint: '先用 scene.get 查 materials，或直接 create_material 新建',
  },
  E_CAMERA_NOT_FOUND: { rpc: -32022, http: 404, retryable: false, message: '机位不存在' },
  E_DAEMON_OUTDATED: {
    rpc: -32023,
    http: 409,
    retryable: true,
    message: 'daemon 版本过旧，不认识该方法',
  },
  E_MATERIAL_IN_USE: {
    rpc: -32024,
    http: 409,
    retryable: false,
    message: '材质仍被节点引用',
    hint: '先把引用节点换成别的材质，或传 force:true 强制删除',
  },
  E_EXPORT_DRIFT: {
    rpc: -32025,
    http: 500,
    retryable: true,
    message: '导出 GLB 与场景不一致',
    hint: '删掉该 glb 重新 export，或先 validate 清掉悬空引用',
  },
  E_BUDGET_EXCEEDED: {
    rpc: -32026,
    http: 422,
    retryable: false,
    message: '场景超出预算上限',
    hint: '删减节点 / 三角面 / 贴图，或放宽 budget 上限后重跑',
  },
  E_THUMB_MISSING: {
    rpc: -32027,
    http: 404,
    retryable: false,
    message: '缩略图不存在或已过期',
    hint: '缩略图按读路径懒生成：先调 get_room 触发生成，用返回的 thumbUrl 取图',
  },
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

  get hint(): string | undefined {
    const own = this.data?.hint;
    if (typeof own === 'string' && own.length > 0) return own;
    return ERROR_SPECS[this.code].hint;
  }

  get example(): string | undefined {
    const own = this.data?.example;
    if (typeof own === 'string' && own.length > 0) return own;
    return ERROR_SPECS[this.code].example;
  }

  get docRef(): string | undefined {
    const own = this.data?.docRef;
    if (typeof own === 'string' && own.length > 0) return own;
    return ERROR_SPECS[this.code].docRef;
  }

  toJSON(): AppErrorData {
    const hint = this.hint;
    const example = this.example;
    const docRef = this.docRef;
    const extras = {
      ...(hint ? { hint } : {}),
      ...(example ? { example } : {}),
      ...(docRef ? { docRef } : {}),
    };
    const data = this.data || Object.keys(extras).length > 0 ? { ...this.data, ...extras } : undefined;
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
