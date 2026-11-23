export type DeviceType = 'ps5' | 'xbox' | 'pc' | 'ipad';

export type LegacyDeviceAlias =
  | DeviceType
  | 'playstation'
  | 'keyboard'
  | 'mouse'
  | 'ios';

export type TrainerMode = 'demo' | 'practice';

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
  shortLabel: string;
  sequence: TrainingSequence;
}

export interface DeviceButtonSpec {
  id: string;
  label: string;
  group: string;
  defaultTouch?: TouchCoordinate;
}

export interface DevicePlatformMeta {
  id: DeviceType;
  brandName: string;
  subtitle: string;
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
 */
export interface SurfaceAnchor {
  point: [number, number, number];
  normal: [number, number, number];
  meshName?: string;
}

export type DeviceAnchorMap = Record<string, SurfaceAnchor>;

export type AllAnchorMaps = Record<DeviceType, DeviceAnchorMap>;

/**
 * Calibration transform applied to a custom GLB model so it sits accurately on the studio pedestal.
 */
export interface GlbTransform {
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
  offsetY: number;
}

export type AllGlbTransforms = Record<DeviceType, GlbTransform>;

/**
 * Drop-in GLB asset URLs per platform. Any omitted URL or 404 seamlessly falls back to the built-in 3D studio hardware.
 */
export interface DeviceModelUrls {
  /** Foreground controller/device GLB URL (e.g. '/models/ps5.glb') */
  deviceGlbUrl?: string;
  /** Optional PC keyboard sub-model GLB URL (used when device === 'pc') */
  keyboardGlbUrl?: string;
  /** Optional PC mouse sub-model GLB URL (used when device === 'pc') */
  mouseGlbUrl?: string;
  /** Optional 3D background hero monument GLB URL (e.g. '/models/bg-playstation.glb') */
  backgroundGlbUrl?: string;
  /** Optional explicit orientation/scale transform for the foreground GLB */
  transform?: Partial<GlbTransform>;
}

/**
 * Connected real physical Bluetooth / USB controller telemetry.
 */
export interface ConnectedControllerInfo {
  id: string;
  name: string;
  index: number;
  detectedDevice: 'ps5' | 'xbox';
  connectionType: 'bluetooth-gamepad' | 'webhid' | 'simulated';
  hasHaptics: boolean;
  connectedAt: number;
}

export type PracticeJudgement =
  | 'perfect'
  | 'good'
  | 'early'
  | 'late'
  | 'wrong'
  | 'missed';

export interface PracticeFeedbackEntry {
  id: string;
  judgement: PracticeJudgement;
  pressedButtonId: string | null;
  expectedButtonId: string | null;
  expectedLabel?: string;
  /** Signed timing error in ms: negative = early, positive = late */
  deltaMs: number | null;
  timestampMs: number;
  eventId?: string;
  message: string;
}

export interface PracticeEventOutcome {
  eventId: string;
  targetMesh: string;
  status: 'pending' | 'perfect' | 'good' | 'early' | 'late' | 'missed';
  deltaMs: number | null;
}

export interface PracticeSessionStats {
  totalEvents: number;
  perfectCount: number;
  goodCount: number;
  timingErrorCount: number;
  wrongButtonCount: number;
  missedCount: number;
  streak: number;
  bestStreak: number;
  accuracyPct: number;
  avgDeltaMs: number | null;
  outcomes: Record<string, PracticeEventOutcome>;
  lastFeedback: PracticeFeedbackEntry | null;
  history: PracticeFeedbackEntry[];
}

/**
 * Standardized backend response payload for a device training scenario.
 * Backends may return either this envelope or a raw TrainingSequence object directly.
 */
export interface BackendSequencePayload {
  sequence?: TrainingSequence;
  presets?: DemoPreset[];
  activePresetId?: string;
  meshMapping?: DeviceMeshMapping;
  surfaceAnchors?: DeviceAnchorMap;
  title?: string;
  duration_ms?: number;
  events?: SequenceEvent[];
}

export interface ControllerTrainerProps {
  /** Initial active platform ('ps5' | 'playstation' | 'xbox' | 'pc' | 'ipad' | 'ios') */
  initialDevice?: LegacyDeviceAlias;
  /** Initial operating mode: 'demo' (watch choreography) or 'practice' (live Bluetooth/hardware testing) */
  initialMode?: TrainerMode;
  /** Optional REST API base URL; fetches `${apiBaseUrl}?device=${device}` on platform switch */
  apiBaseUrl?: string;
  /** Optional custom async fetcher (e.g., with auth headers, Axios, or React Query) */
  fetchSequence?: (
    device: DeviceType,
    presetId?: string,
  ) => Promise<BackendSequencePayload | TrainingSequence>;
  /** Optional static or reactive sequences provided directly via props */
  sequences?: Partial<Record<DeviceType, TrainingSequence>>;
  /** Optional custom demo presets per platform */
  presets?: Partial<Record<DeviceType, DemoPreset[]>>;
  /** Optional drop-in GLB model URLs for foreground devices and 3D background monuments */
  models?: Partial<Record<DeviceType, DeviceModelUrls>>;
  /** Optional mesh name mapping overrides for custom GLBs */
  meshMappings?: Partial<Record<DeviceType, DeviceMeshMapping>>;
  /** Optional exact 3D surface anchor overrides for custom GLBs */
  surfaceAnchors?: Partial<Record<DeviceType, DeviceAnchorMap>>;
  /** Automatically start playing when a sequence loads */
  autoPlay?: boolean;
  /** Hide the top platform switcher if the host app manages platform selection externally */
  hideDeviceSwitcher?: boolean;
  /** Callbacks for host application synchronization */
  onDeviceChange?: (device: DeviceType) => void;
  onActiveEventsChange?: (events: SequenceEvent[], timeMs: number) => void;
  onSequenceLoaded?: (device: DeviceType, sequence: TrainingSequence) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onPracticeFeedback?: (feedback: PracticeFeedbackEntry, stats: PracticeSessionStats) => void;
  onControllerConnectionChange?: (controller: ConnectedControllerInfo | null) => void;
  onApiError?: (error: Error, device: DeviceType) => void;
  className?: string;
}

export interface AstroTrainerPublicAPI {
  loadSequence: (deviceType: LegacyDeviceAlias, jsonData: BackendSequencePayload | TrainingSequence) => boolean;
  loadFromUrl: (
    deviceType: LegacyDeviceAlias,
    endpointUrl: string,
    fetchInit?: RequestInit,
  ) => Promise<boolean>;
  setDevice: (deviceType: LegacyDeviceAlias) => void;
  setMode: (mode: TrainerMode) => void;
  setMeshMapping: (deviceType: LegacyDeviceAlias, mapping: DeviceMeshMapping) => void;
  setSurfaceAnchors: (deviceType: LegacyDeviceAlias, anchors: DeviceAnchorMap) => void;
  connectBluetooth: () => Promise<ConnectedControllerInfo | null>;
  getControllerStatus: () => ConnectedControllerInfo | null;
  getPracticeStats: () => PracticeSessionStats;
  resetPractice: () => void;
  /** Programmatic/automated hardware input trigger (mirrors real Bluetooth controller press/release) */
  simulateHardwareInput: (buttonId: string, pressed: boolean, value?: number) => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setLoop: (enabled: boolean) => void;
  resetCamera: () => void;
  getState: () => {
    device: DeviceType;
    mode: TrainerMode;
    currentTimeMs: number;
    isPlaying: boolean;
    loopEnabled: boolean;
    controller: ConnectedControllerInfo | null;
    practiceStats: PracticeSessionStats;
    sequence: TrainingSequence;
  };
}

declare global {
  interface Window {
    AstroTrainerAPI?: AstroTrainerPublicAPI;
  }
}
