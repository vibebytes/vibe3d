export { applyOps, inverseOps, type ReduceResult } from './reduce';
export { applyClipTransform, sampleClip } from './anim';
export { MAX_PARTICLES, particleCount, sampleParticles, type ParticleSample } from './fx';
export {
  sceneBounds,
  nodeBounds,
  frameCamera,
  frameNode,
  frameTarget,
  VIEW_NAMES,
  type Bounds,
  type FrameMode,
  type FrameTargetOptions,
  type ViewName,
} from './frame';
export { validateDoc, DEFAULT_LIMITS, type Limits } from './validate';
export {
  queryNodes,
  nodeView,
  type Bounds as QueryBounds,
  type NodeBrief,
  type NodeFilter,
  type NodeKind,
  type NodeView,
  type QueryResult,
} from './query';
export { geometryTris, sceneStats, type SceneStats } from './stats';
export {
  bakeBoxes,
  booleanBoxes,
  boxFromCenter,
  boxIntersect,
  boxUnion,
  boxesTris,
  subtractBox,
  type BooleanOp,
  type Box,
} from './csg';
export {
  validateScene,
  type CheckCode,
  type SceneIssue,
  type ValidateOptions,
  type ValidateResult,
} from './checks';
export {
  MATERIAL_PRESETS,
  applyUv,
  isMaterialPreset,
  normalizeMap,
  presetMaterial,
  uvMatrix,
  type MaterialPreset,
} from './material';
