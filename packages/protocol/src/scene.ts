import { z } from 'zod';
import { DOC_SCHEMA_VERSION } from './errors';
import {
  assetImageSchema,
  cameraNameSchema,
  cameraStateSchema,
  decalSchema,
  envSchema,
  fxIdSchema,
  geometrySchema,
  lightSpecSchema,
  materialIdSchema,
  materialSchema,
  nodeIdSchema,
  nodeRefSchema,
  rgba,
  shaSchema,
  stageStateSchema,
  tagsSchema,
  transformSchema,
  vec3,
} from './schema';

export const modelAnimSchema = z.object({
  playing: z.boolean(),
  clip: z.string().min(1).optional(),
  clips: z.array(z.string().min(1)).min(1).max(8).optional().describe('多 clip 叠加播放列表'),
  speed: z.number().finite().positive(),
  loop: z.boolean().optional(),
  direction: z.enum(['forward', 'reverse']).optional(),
  weight: z.number().finite().min(0).max(1).optional(),
});

export const clipChannelSchema = z.enum(['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz']);

export const clipKeySchema = z.object({
  t: z.number().finite().min(0).describe('秒'),
  v: z.number().finite().describe('该通道的增量：位移/旋转(弧度)相加，缩放相乘'),
  ease: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
});

export const trackPathSchema = z
  .string()
  .regex(/^(position|rotation|scale|visible|opacity|bone\.[A-Za-z0-9_.-]+\.(rotation|position|scale))$/)
  .describe(
    'position/rotation/scale 为绝对 3 元数组（rotation 用弧度）；visible 为布尔；opacity 为 0..1；bone.<骨骼名>.rotation|position|scale 驱动 glTF 骨骼',
  ) as unknown as z.ZodString;

export const trackInterpSchema = z
  .enum(['linear', 'step', 'ease', 'cubic'])
  .describe('缺省 linear；step 保持前一关键帧值；cubic 为 Catmull-Rom');

export const trackKeySchema = z.object({
  t: z.number().finite().min(0).describe('秒'),
  v: z
    .union([vec3, z.number().finite(), z.boolean()])
    .describe('position/rotation/scale 传 [x,y,z]；visible 传布尔；opacity 传数字'),
  ease: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
});

const constantTrack = (raw: unknown): unknown => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { value, ...rest } = raw as Record<string, unknown>;
  if (value === undefined || 'keys' in rest) return raw;
  return { ...rest, interp: rest.interp ?? 'step', keys: [{ t: 0, v: value }] };
};

const trackObjectSchema = z
  .object({
    path: trackPathSchema,
    interp: trackInterpSchema.optional(),
    blend: z
      .enum(['absolute', 'additive'])
      .optional()
      .describe('absolute（缺省）覆盖节点 transform；additive 叠加在节点原值上（scale 为相乘）'),
    keys: z.array(trackKeySchema).min(1).describe('按 t 升序；超出末帧保持末值'),
  })
  .strict()
  .describe('一条属性轨道：path + 关键帧 keys[{t,v}] + 插值 interp；常量可简写为 {path, value}')
  .superRefine((track, ctx) => {
    const vector =
      track.path === 'position' ||
      track.path === 'rotation' ||
      track.path === 'scale' ||
      track.path.startsWith('bone.');
    for (const [index, key] of track.keys.entries()) {
      const ok = vector
        ? Array.isArray(key.v)
        : track.path === 'visible'
          ? typeof key.v === 'boolean'
          : typeof key.v === 'number';
      if (!ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['keys', index, 'v'],
          message: `${track.path} 轨道的 v 类型不匹配`,
        });
      }
    }
  });

export const trackSchema = z.preprocess(constantTrack, trackObjectSchema);

const clipSchemaRuntime = z
  .object({
    type: z
      .enum(['sway', 'ripple', 'float', 'flicker', 'spin', 'keyframes'])
      .optional()
      .describe('sway/ripple/float/flicker/spin 为周期函数；keyframes 按 keys 插值；只给 tracks 时可省略'),
    channel: clipChannelSchema
      .optional()
      .describe('作用通道，缺省按类型推断（sway→rz、spin→ry、其余→py）；同通道 define 会替换'),
    axis: z.enum(['x', 'y', 'z']).optional().describe('仅 sway：等价于 channel=r<axis>'),
    amplitude: z.number().finite().optional().describe('周期函数振幅，缺省 1'),
    frequency: z.number().finite().optional().describe('Hz，缺省 0.5'),
    phase: z.number().finite().optional().describe('弧度'),
    speed: z.number().finite().optional().describe('时间轴倍率，缺省 1'),
    loop: z.boolean().optional().describe('配合 duration 取模循环'),
    duration: z.number().finite().positive().optional().describe('秒'),
    gust: z.number().finite().min(0).max(1).optional().describe('仅 sway：阵风包络强度'),
    keys: z
      .array(clipKeySchema)
      .optional()
      .describe('仅 keyframes：按 t 升序插值，超出末帧保持末值；每帧只给一个标量 v'),
    tracks: z
      .array(trackSchema)
      .min(1)
      .max(32)
      .optional()
      .describe('通用属性轨道：缺省绝对覆盖 transform，blend:additive 叠加（先于 channel 增量应用）'),
    drift: vec3.optional().describe('根运动：每秒位移 [x,y,z]（米/秒），按未取模时间累计，不随 loop 回绕'),
  })
  .strict()
  .superRefine((clip, ctx) => {
    if (clip.type === undefined && clip.tracks === undefined) {
      ctx.addIssue({ code: 'custom', path: ['type'], message: '需要 type 或 tracks 至少一个' });
    }
  });

export type ClipSpec = z.infer<typeof clipSchemaRuntime>;
export const clipSchema: z.ZodType<ClipSpec, z.ZodTypeDef, unknown> = clipSchemaRuntime.describe(
  '程序化动画片段：type 选周期函数或 keyframes（标量增量）；tracks 为任意属性的绝对轨道（position/rotation/scale/bone.<名>.*），loop+duration 循环',
);

export const fxSchema = z.object({
  id: fxIdSchema,
  type: z.enum(['particles', 'shaft']),
  nodeId: nodeIdSchema.optional(),
  position: vec3.optional(),
  spread: vec3.optional(),
  rate: z.number().finite().min(0).optional(),
  life: z.number().finite().min(0).optional(),
  size: z.number().finite().min(0).optional(),
  color: rgba.optional(),
  gravity: vec3.optional(),
  speed: z.number().finite().optional(),
  billboard: z.boolean().optional(),
  length: z.number().finite().optional(),
  radiusTop: z.number().finite().min(0).optional(),
  radiusBottom: z.number().finite().min(0).optional(),
  intensity: z.number().finite().min(0).optional(),
  seed: z.number().finite().optional(),
});

const nodeBase = {
  id: nodeIdSchema.describe(
    '客户端可指定；ops.apply 中与既有节点同 id 报 E_CONFLICT（不覆盖）。幂等重建：node.create upsert_by_name 或模板化 scene.import',
  ),
  name: z.string().min(1).max(200),
  parent: nodeIdSchema.nullable(),
  visible: z.boolean(),
  transform: transformSchema,
  clip: clipSchema.optional(),
  clips: z.array(clipSchema).max(8).optional(),
  tags: tagsSchema.optional(),
};

export const groupNodeSchema = z.object({ ...nodeBase, kind: z.literal('group') });
export const meshNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('mesh'),
  geometry: geometrySchema,
  material: materialIdSchema,
  decal: decalSchema.optional(),
});
export const lightNodeSchema = z.object({ ...nodeBase, kind: z.literal('light'), light: lightSpecSchema });
export const modelNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('model'),
  sha: shaSchema,
  anim: modelAnimSchema.optional(),
});

export const sceneNodeSchema = z.discriminatedUnion('kind', [
  groupNodeSchema,
  meshNodeSchema,
  lightNodeSchema,
  modelNodeSchema,
]);

export const newNodeSchema = z.discriminatedUnion('kind', [
  groupNodeSchema.extend({ id: nodeIdSchema.optional(), parent: nodeRefSchema.nullable() }),
  meshNodeSchema.extend({
    id: nodeIdSchema.optional(),
    parent: nodeRefSchema.nullable(),
    material: materialIdSchema.optional(),
  }),
  lightNodeSchema.extend({ id: nodeIdSchema.optional(), parent: nodeRefSchema.nullable() }),
  modelNodeSchema.extend({ id: nodeIdSchema.optional(), parent: nodeRefSchema.nullable() }),
]);

export const gltfAnimationSchema = z.object({
  name: z.string(),
  durationSec: z.number().finite().min(0),
  channels: z.number().int().min(0),
});

export const gltfReportSchema = z.object({
  version: z.literal('2.0'),
  selfContained: z.boolean(),
  missing: z.array(z.string()),
  extensions: z.array(z.string()),
  unsupported: z.array(z.string()),
  meshes: z.number().int().min(0),
  prims: z.number().int().min(0),
  tris: z.number().int().min(0),
  materials: z.number().int().min(0),
  textures: z.number().int().min(0),
  animations: z.array(gltfAnimationSchema),
  skins: z.number().int().min(0),
  bones: z.array(z.string()).optional().describe('skin 关节节点名（所有 skin 合并去重）'),
  size: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    diag: z.number().finite(),
  }),
  heroGuess: z.string().optional(),
});

export const assetMetaSchema = z.object({
  sha: shaSchema,
  bytes: z.number().int().min(0),
  name: z.string().max(300),
  mime: z.string().max(120),
  kind: z.enum(['gltf', 'image', 'bin']),
  gltf: gltfReportSchema.optional(),
  image: assetImageSchema.optional(),
});

const sceneDocRuntime = z.object({
  schemaVersion: z.literal(DOC_SCHEMA_VERSION),
  revision: z.number().int().min(0),
  name: z.string().max(120),
  nodes: z.record(nodeIdSchema, sceneNodeSchema),
  roots: z.array(nodeIdSchema),
  materials: z.record(materialIdSchema, materialSchema),
  assets: z.record(shaSchema, assetMetaSchema),
  env: envSchema,
  stage: stageStateSchema,
  camera: cameraStateSchema,
  cameras: z.record(cameraNameSchema, cameraStateSchema).default({}),
  fx: z.array(fxSchema).default([]),
  updatedAt: z.string().min(1),
});

export type SceneDoc = z.infer<typeof sceneDocRuntime>;
export const sceneDocSchema: z.ZodType<SceneDoc, z.ZodTypeDef, unknown> = sceneDocRuntime;

export type ModelAnim = z.infer<typeof modelAnimSchema>;
export type DecalSpec = z.infer<typeof decalSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type MeshNode = z.infer<typeof meshNodeSchema>;
export type LightNode = z.infer<typeof lightNodeSchema>;
export type ModelNode = z.infer<typeof modelNodeSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type GltfAnimation = z.infer<typeof gltfAnimationSchema>;
export type GltfReport = z.infer<typeof gltfReportSchema>;
export type AssetMeta = z.infer<typeof assetMetaSchema>;
export type ClipKey = z.infer<typeof clipKeySchema>;
export type TrackSpec = z.infer<typeof trackSchema>;
export type TrackKey = z.infer<typeof trackKeySchema>;
export type FxSpec = z.infer<typeof fxSchema>;

export const DEFAULT_STAGE: z.infer<typeof stageStateSchema> = {
  preset: 'clean',
  autoExposure: true,
  ground: true,
  keepModelLights: false,
};

export const DEFAULT_ENV = {
  background: [0.043, 0.055, 0.071, 1] as [number, number, number, number],
  ambient: [1, 1, 1, 1] as [number, number, number, number],
  ambientIntensity: 0.35,
};

export const DEFAULT_CAMERA = {
  mode: 'persp' as const,
  p: [3.2, 2.2, 4.2] as [number, number, number],
  target: [0, 0.75, 0] as [number, number, number],
  fov: 45,
  zoom: 1,
};

export function emptyDoc(name = '未命名场景'): SceneDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    revision: 0,
    name,
    nodes: {},
    roots: [],
    materials: {},
    assets: {},
    env: DEFAULT_ENV,
    stage: { ...DEFAULT_STAGE },
    camera: { ...DEFAULT_CAMERA },
    cameras: {},
    fx: [],
    updatedAt: new Date(0).toISOString(),
  };
}
