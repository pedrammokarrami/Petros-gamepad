import type {
  AllMeshMappings,
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceType,
  GlbTransform,
} from '../types/trainer';
import { sanitizeAnchorMap, sanitizeGlbTransform } from './glbPlacement';

export const MAPPING_STORAGE_KEY = 'astro_trainer_mesh_mappings_v1';

const ALL_DEVICES: DeviceType[] = ['ps5', 'xbox', 'pc', 'ipad'];

export function createEmptyMappings(): AllMeshMappings {
  return {
    ps5: {},
    xbox: {},
    pc: {},
    ipad: {},
  };
}

/**
 * Assigns a meshName to a standard buttonId for a given device.
 * Ensures a 1-to-1 relationship by removing any previous button mapped to the same meshName.
 */
export function assignButtonMesh(
  current: DeviceMeshMapping,
  buttonId: string,
  meshName: string,
): DeviceMeshMapping {
  const next: DeviceMeshMapping = {};
  for (const [existingBtn, existingMesh] of Object.entries(current)) {
    if (existingMesh !== meshName && existingBtn !== buttonId) {
      next[existingBtn] = existingMesh;
    }
  }
  next[buttonId] = meshName;
  return next;
}

/**
 * Removes any mapping pointing to the specified meshName.
 */
export function unassignMesh(
  current: DeviceMeshMapping,
  meshName: string,
): DeviceMeshMapping {
  const next: DeviceMeshMapping = {};
  for (const [btnId, mappedMesh] of Object.entries(current)) {
    if (mappedMesh !== meshName) {
      next[btnId] = mappedMesh;
    }
  }
  return next;
}

/**
 * Looks up which buttonId is currently bound to a given meshName (if any).
 */
export function findButtonForMesh(
  mapping: DeviceMeshMapping,
  meshName: string,
): string | null {
  for (const [btnId, mappedMesh] of Object.entries(mapping)) {
    if (mappedMesh === meshName) {
      return btnId;
    }
  }
  return null;
}

/**
 * Resolves the concrete 3D mesh name to animate for a sequence event's `target_mesh`.
 * Prefers the user's custom Visual Mesh Binder mapping, falling back to direct mesh name.
 */
export function resolveTargetMeshName(
  mapping: DeviceMeshMapping,
  targetButtonId: string,
): string {
  return mapping[targetButtonId] || targetButtonId;
}

function cleanRecord(entry: unknown): DeviceMeshMapping {
  const clean: DeviceMeshMapping = {};
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        clean[k] = v.trim();
      }
    }
  }
  return clean;
}

export function loadMappingsFromStorage(storage?: Pick<Storage, 'getItem'>): AllMeshMappings {
  const base = createEmptyMappings();
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return base;
    const raw = store.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    for (const dev of ALL_DEVICES) {
      base[dev] = cleanRecord(parsed[dev]);
    }
    // Migrate legacy separate keyboard/mouse entries cleanly into unified pc mapping
    if (parsed.keyboard || parsed.mouse) {
      base.pc = {
        ...cleanRecord(parsed.keyboard),
        ...cleanRecord(parsed.mouse),
        ...base.pc,
      };
    }
  } catch {
    return base;
  }
  return base;
}

export function saveMappingsToStorage(
  mappings: AllMeshMappings,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // Ignore quota or privacy mode errors cleanly
  }
}

export interface ExportedMappingFile {
  version: 1 | 2;
  device: DeviceType;
  exportedAt: string;
  mappings: DeviceMeshMapping;
  anchors?: DeviceAnchorMap;
  glbTransform?: GlbTransform;
}

export function serializeMappingExport(
  device: DeviceType,
  mapping: DeviceMeshMapping,
  anchors?: DeviceAnchorMap,
  glbTransform?: GlbTransform,
): string {
  const payload: ExportedMappingFile = {
    version: 2,
    device,
    exportedAt: new Date().toISOString(),
    mappings: mapping,
    ...(anchors && Object.keys(anchors).length > 0 ? { anchors } : {}),
    ...(glbTransform ? { glbTransform } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseMappingImport(
  rawJson: string,
):
  | {
      ok: true;
      device?: DeviceType;
      mappings: DeviceMeshMapping;
      anchors?: DeviceAnchorMap;
      glbTransform?: GlbTransform;
    }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'فرمت فایل mapping.json نامعتبر است.' };
    }
    const source =
      parsed.mappings && typeof parsed.mappings === 'object'
        ? (parsed.mappings as Record<string, unknown>)
        : parsed;

    const clean: DeviceMeshMapping = {};
    for (const [k, v] of Object.entries(source)) {
      if (
        typeof v === 'string' &&
        v.trim().length > 0 &&
        k !== 'version' &&
        k !== 'device' &&
        k !== 'exportedAt'
      ) {
        clean[k] = v.trim();
      }
    }
    let device: DeviceType | undefined;
    if (typeof parsed.device === 'string') {
      if (parsed.device === 'keyboard' || parsed.device === 'mouse') {
        device = 'pc';
      } else if (ALL_DEVICES.includes(parsed.device as DeviceType)) {
        device = parsed.device as DeviceType;
      }
    }

    const anchors = parsed.anchors ? sanitizeAnchorMap(parsed.anchors) : undefined;
    const glbTransform = parsed.glbTransform
      ? (sanitizeGlbTransform(parsed.glbTransform) ?? undefined)
      : undefined;

    return { ok: true, device, mappings: clean, anchors, glbTransform };
  } catch {
    return { ok: false, error: 'خواندن فایل JSON با خطا مواجه شد.' };
  }
}
