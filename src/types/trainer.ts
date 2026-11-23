export type DeviceType = 'ps5' | 'xbox' | 'pc' | 'ipad';

export type LegacyDeviceAlias = DeviceType | 'keyboard' | 'mouse';

export type PcGlbSlot = 'combined' | 'keyboard' | 'mouse';

export interface TiltVector {
  x: number;
  y: number;
  z: number;
}

export interface TouchCoordinate {
  /** Normalized horizontal screen position [0..1] from left to right */
  x: number;
  /** Normalized vertical screen position [0..1] from top to bottom */
  y: number;
}

export interface SequenceEvent {
  id: string;
  target_mesh: string;
  label: string;
  description?: string;
  start_ms: number;
  end_ms: number;
  tilt: TiltVector;
  /** Optional explicit showcase rotation override (radians) for cinematic camera-facing display */
  showcasePose?: TiltVector;
  color: string;
  touch?: TouchCoordinate;
}

export interface TrainingSequence {
  title: string;
  duration_ms: number;
  events: SequenceEvent[];
}

export interface DemoPreset {
  id: string;
  shortLabelFa: string;
  sequence: TrainingSequence;
}

export interface DeviceButtonSpec {
  id: string;
  labelFa: string;
  groupFa: string;
  defaultTouch?: TouchCoordinate;
}

export interface DevicePlatformMeta {
  id: DeviceType;
  brandName: string;
  subtitleFa: string;
  accentHex: string;
  pedestalGlowHex: string;
}

/**
 * Maps a standard button ID (e.g. 'BTN_L1', 'KEY_W', 'BTN_LMB') to an actual mesh name inside a GLB or procedural model.
 */
export type DeviceMeshMapping = Record<string, string>;

export type AllMeshMappings = Record<DeviceType, DeviceMeshMapping>;

/**
 * Exact 3D surface anchor pinned directly onto the device model (in the model's local space).
 * Stays locked to the exact spot across rotations, scaling, camera orbit, and spring tilt.
 */
export interface SurfaceAnchor {
  point: [number, number, number];
  normal: [number, number, number];
  meshName?: string;
}

export type DeviceAnchorMap = Record<string, SurfaceAnchor>;

export type AllAnchorMaps = Record<DeviceType, DeviceAnchorMap>;

/**
 * Calibration transform applied to a custom uploaded GLB model so it sits accurately on the studio pedestal.
 */
export interface GlbTransform {
  /** Rotation in radians around X, Y, Z */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Uniform scale multiplier (1 = normalized fit) */
  scale: number;
  /** Fine vertical elevation offset above the studio pedestal */
  offsetY: number;
}

export type AllGlbTransforms = Record<DeviceType, GlbTransform>;

export interface SelectedMeshInfo {
  meshName: string;
  screenX: number;
  screenY: number;
  currentButtonId: string | null;
  localPoint: [number, number, number];
  localNormal: [number, number, number];
}

export interface CustomModelInfo {
  fileName: string;
  meshCount: number;
  loadedAt: number;
}

export interface AstroTrainerPublicAPI {
  loadSequence: (deviceType: LegacyDeviceAlias, jsonData: TrainingSequence) => boolean;
  setDevice: (deviceType: LegacyDeviceAlias) => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  getState: () => {
    device: DeviceType;
    currentTimeMs: number;
    isPlaying: boolean;
    sequence: TrainingSequence;
  };
}

declare global {
  interface Window {
    AstroTrainerAPI?: AstroTrainerPublicAPI;
  }
}
