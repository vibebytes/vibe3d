export { relativeTransform, worldMatrix, worldPointToLocal } from './frame';
export { subtreeIds } from './subtree';
export { arrayPlacements, type ArrayAxis, type ArrayMode, type ArrayOptions, type Placement } from './array';
export {
  attachDelta,
  type AttachCorner,
  type AttachFace,
  type AttachOptions,
} from './attach';
export { applyOps, inverseOps, type OpSummary, type ReduceResult } from './reduce';
export { applyClipTransform, sampleClip } from './anim';
export { MAX_PARTICLES, particleCount, sampleParticles, type ParticleSample } from './fx';
export {
  sceneBounds,
  nodeBounds,
  nodeOwnBounds,
  frameCamera,
  frameNode,
  frameTarget,
  VIEW_NAMES,
  type Bounds,
  type FrameMode,
  type FrameTargetOptions,
  type ViewName,
} from './frame';
export { changedPaths, type ChangedPathOptions, type ChangedPaths } from './changed';
export { mergeSubtrees, type MergeSubtreesResult } from './restore';
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
  checkBudget,
  type BudgetKey,
  type BudgetMetric,
  type BudgetReport,
  type SceneBudget,
} from './budget';
export {
  pickNode,
  type PickHit,
  type PickOptions,
  type PickRay,
  type PickResult,
} from './pick';
export {
  ID_PASS_MAX_NODES,
  ID_PASS_MAX_PIXELS,
  fitsIdPass,
  buildIdLegend,
  decodeIdMask,
  type IdCoverage,
  type IdLegend,
  type IdMask,
} from './id-pass';
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
  type GroundEvidence,
  type SceneIssue,
  type ValidateOptions,
  type ValidateResult,
} from './checks';
export {
  QUALITY_LEVELS,
  resolveQuality,
  type QualityLevel,
  type QualityPreset,
} from './quality';
export { tubeMesh, type TubeMesh, type TubeSpec } from './tube';
export {
  BACKDROP_DEFAULTS,
  backdropSweep,
  type BackdropMesh,
  type BackdropSpec,
} from './backdrop';
export { bakeGeometry, type BakedMesh } from './bake';
export { mergeGroup, type MergeOptions, type MergePlan } from './merge';
export {
  autoClipRange,
  autoFogRange,
  parseShotMeta,
  shotMetaOf,
  shotWarning,
  type FogMode,
  type FogReport,
  type ShotCamera,
  type ShotMeta,
  type ShotMetaInput,
} from './shot-meta';
export {
  MATERIAL_PRESETS,
  applyUv,
  isMaterialPreset,
  normalizeMap,
  presetMaterial,
  resolveMaterialPreset,
  uvMatrix,
  type MaterialPreset,
  type PresetResolution,
} from './material';
