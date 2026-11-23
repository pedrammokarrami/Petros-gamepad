export { ControllerTrainerStage } from './ControllerTrainerStage';
export {
  buildSequenceEndpointUrl,
  fetchSequenceFromApi,
  normalizeBackendPayload,
  type NormalizedBackendResponse,
} from './apiClient';
export {
  DEFAULT_MODEL_URLS,
  DEFAULT_SEQUENCES,
  DEVICE_BUTTONS,
  DEVICE_DEMO_PRESETS,
  DEVICE_PLATFORMS,
  PS5_DEMO_PRESETS,
  normalizeDeviceType,
} from '../data/devices';
export {
  computeButtonShowcasePose,
  evaluateTimelineFrame,
  formatMilliseconds,
  validateAndNormalizeSequence,
} from '../core/sequenceEngine';
export type {
  AllAnchorMaps,
  AllGlbTransforms,
  AllMeshMappings,
  AstroTrainerPublicAPI,
  BackendSequencePayload,
  ControllerTrainerProps,
  DemoPreset,
  DeviceAnchorMap,
  DeviceButtonSpec,
  DeviceMeshMapping,
  DeviceModelUrls,
  DevicePlatformMeta,
  DeviceType,
  GlbTransform,
  LegacyDeviceAlias,
  SequenceEvent,
  SurfaceAnchor,
  TiltVector,
  TouchCoordinate,
  TrainingSequence,
} from '../types/trainer';
