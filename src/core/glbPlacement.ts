import type {
  AllAnchorMaps,
  AllGlbTransforms,
  DeviceAnchorMap,
  DeviceType,
  GlbTransform,
  SurfaceAnchor,
} from '../types/trainer';

export const ANCHOR_STORAGE_KEY = 'astro_trainer_surface_anchors_v1';
export const GLB_TRANSFORM_STORAGE_KEY = 'astro_trainer_glb_transforms_v1';

const ALL_DEVICES: DeviceType[] = ['ps5', 'xbox', 'pc', 'ipad'];

export interface GlbMeshHint {
  name: string;
  materialName?: string;
  /** Center position relative to the model's bounding-box center */
  center: [number, number, number];
}

export interface BoundingDimensions {
  x: number;
  y: number;
  z: number;
}

export function createDefaultGlbTransform(): GlbTransform {
  return { rotX: 0, rotY: 0, rotZ: 0, scale: 1, offsetY: 0 };
}

export function createEmptyAnchorMaps(): AllAnchorMaps {
  return { ps5: {}, xbox: {}, pc: {}, ipad: {} };
}

export function createDefaultGlbTransforms(): AllGlbTransforms {
  return {
    ps5: createDefaultGlbTransform(),
    xbox: createDefaultGlbTransform(),
    pc: createDefaultGlbTransform(),
    ipad: createDefaultGlbTransform(),
  };
}

const FRONT_PATTERN = /(screen|display|oled|lcd|glass|panel|touch|face|front|keycap|button|dpad|stick|pad)/i;
const BACK_PATTERN = /(back|rear|camera|lens|lidar|flash|apple|logo|rear_shell|bottom|feet|serial)/i;

/**
 * Scores which side (+axis or -axis) contains front vs back geometry based on mesh & material names.
 * Positive return value => front faces +axis; negative return value => front faces -axis (needs 180° flip).
 */
function scoreFrontAxisDirection(hints: GlbMeshHint[], axisIdx: 0 | 1 | 2): number {
  let score = 0;
  for (const h of hints) {
    const label = `${h.name} ${h.materialName ?? ''}`;
    const coord = h.center[axisIdx];
    if (Math.abs(coord) < 1e-4) continue;
    const sign = coord > 0 ? 1 : -1;
    if (FRONT_PATTERN.test(label) && !BACK_PATTERN.test(label)) {
      score += sign * 2;
    } else if (BACK_PATTERN.test(label)) {
      score -= sign * 2.5;
    }
  }
  return score;
}

/**
 * Computes an intelligent, deterministic studio presentation transform for any uploaded GLB model:
 * - Detects flat/thin devices (iPad, keyboards) standing vertically vs lying flat
 * - Automatically rotates vertical/portrait iPads to landscape
 * - Detects front screen vs rear camera/logo orientation so the front faces the camera
 */
export function computeAutoGlbTransform(
  deviceType: DeviceType,
  size: BoundingDimensions,
  hints: GlbMeshHint[] = [],
): GlbTransform {
  const sx = Math.max(size.x, 1e-4);
  const sy = Math.max(size.y, 1e-4);
  const sz = Math.max(size.z, 1e-4);

  const isFlatZ = sz <= sx * 0.45 && sz <= sy * 0.45;
  const isFlatY = sy <= sx * 0.45 && sy <= sz * 0.45;
  const isFlatX = sx <= sy * 0.45 && sx <= sz * 0.45;

  let rotX = 0;
  let rotY = 0;
  let rotZ = 0;

  if (isFlatZ) {
    // Standing upright facing ±Z (common for Sketchfab/Blender iPads & screens)
    const frontScore = scoreFrontAxisDirection(hints, 2);
    if (frontScore < 0) {
      rotY = Math.PI;
    }
    if ((deviceType === 'ipad' || deviceType === 'pc') && sy > sx * 1.08) {
      rotZ = Math.PI / 2;
    }
    // Gentle keynote recline toward the overhead telephoto camera
    rotX = deviceType === 'ipad' ? -0.28 : -0.34;
  } else if (isFlatY) {
    // Lying flat on XZ plane
    const frontScore = scoreFrontAxisDirection(hints, 1);
    if (frontScore < 0) {
      rotZ = Math.PI;
    }
    if ((deviceType === 'ipad' || deviceType === 'pc') && sz > sx * 1.08) {
      rotY = Math.PI / 2;
    }
    rotX = deviceType === 'ipad' ? 0.62 : 0.36;
  } else if (isFlatX) {
    // Standing sideways facing ±X
    const frontScore = scoreFrontAxisDirection(hints, 0);
    rotY = frontScore < 0 ? Math.PI / 2 : -Math.PI / 2;
    if ((deviceType === 'ipad' || deviceType === 'pc') && sy > sz * 1.08) {
      rotZ = Math.PI / 2;
    }
    rotX = deviceType === 'ipad' ? -0.28 : -0.34;
  } else {
    // Sculpted 3D hardware (controllers / mice)
    const frontScoreZ = scoreFrontAxisDirection(hints, 2);
    if (frontScoreZ < 0) {
      rotY = Math.PI;
    }
    if ((deviceType === 'ps5' || deviceType === 'xbox') && sz > sx * 1.25) {
      rotY += Math.PI / 2;
    }
    rotX = 0.24;
  }

  return {
    rotX: normalizeAngle(rotX),
    rotY: normalizeAngle(rotY),
    rotZ: normalizeAngle(rotZ),
    scale: 1,
    offsetY: 0,
  };
}

export function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = ((rad % twoPi) + twoPi) % twoPi;
  if (a > Math.PI) a -= twoPi;
  return Math.round(a * 1000) / 1000;
}

export function assignSurfaceAnchor(
  current: DeviceAnchorMap,
  buttonId: string,
  anchor: SurfaceAnchor,
): DeviceAnchorMap {
  return {
    ...current,
    [buttonId]: {
      point: [
        Math.round(anchor.point[0] * 10000) / 10000,
        Math.round(anchor.point[1] * 10000) / 10000,
        Math.round(anchor.point[2] * 10000) / 10000,
      ],
      normal: [
        Math.round(anchor.normal[0] * 10000) / 10000,
        Math.round(anchor.normal[1] * 10000) / 10000,
        Math.round(anchor.normal[2] * 10000) / 10000,
      ],
      ...(anchor.meshName ? { meshName: anchor.meshName } : {}),
    },
  };
}

export function removeSurfaceAnchor(
  current: DeviceAnchorMap,
  buttonId: string,
): DeviceAnchorMap {
  const next: DeviceAnchorMap = {};
  for (const [k, v] of Object.entries(current)) {
    if (k !== buttonId) next[k] = v;
  }
  return next;
}

function isVec3Tuple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

export function sanitizeAnchorMap(raw: unknown): DeviceAnchorMap {
  const clean: DeviceAnchorMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  for (const [btnId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    if (isVec3Tuple(obj.point) && isVec3Tuple(obj.normal)) {
      clean[btnId] = {
        point: [obj.point[0], obj.point[1], obj.point[2]],
        normal: [obj.normal[0], obj.normal[1], obj.normal[2]],
        ...(typeof obj.meshName === 'string' && obj.meshName.trim()
          ? { meshName: obj.meshName.trim() }
          : {}),
      };
    }
  }
  return clean;
}

export function sanitizeGlbTransform(raw: unknown): GlbTransform | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const num = (k: string, fallback: number) =>
    typeof obj[k] === 'number' && Number.isFinite(obj[k] as number)
      ? (obj[k] as number)
      : fallback;
  return {
    rotX: normalizeAngle(num('rotX', 0)),
    rotY: normalizeAngle(num('rotY', 0)),
    rotZ: normalizeAngle(num('rotZ', 0)),
    scale: Math.max(0.35, Math.min(2.6, num('scale', 1))),
    offsetY: Math.max(-1.2, Math.min(1.5, num('offsetY', 0))),
  };
}

export function loadAnchorsFromStorage(storage?: Pick<Storage, 'getItem'>): AllAnchorMaps {
  const base = createEmptyAnchorMaps();
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return base;
    const raw = store.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const dev of ALL_DEVICES) {
      base[dev] = sanitizeAnchorMap(parsed[dev]);
    }
  } catch {
    return base;
  }
  return base;
}

export function saveAnchorsToStorage(
  anchors: AllAnchorMaps,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(anchors));
  } catch {
    // Ignore quota errors
  }
}

export function loadGlbTransformsFromStorage(
  storage?: Pick<Storage, 'getItem'>,
): AllGlbTransforms {
  const base = createDefaultGlbTransforms();
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return base;
    const raw = store.getItem(GLB_TRANSFORM_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const dev of ALL_DEVICES) {
      const clean = sanitizeGlbTransform(parsed[dev]);
      if (clean) base[dev] = clean;
    }
  } catch {
    return base;
  }
  return base;
}

export function saveGlbTransformsToStorage(
  transforms: AllGlbTransforms,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(GLB_TRANSFORM_STORAGE_KEY, JSON.stringify(transforms));
  } catch {
    // Ignore quota errors
  }
}
