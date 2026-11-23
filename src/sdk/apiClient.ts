import { sanitizeAnchorMap } from '../core/glbPlacement';
import { validateAndNormalizeSequence } from '../core/sequenceEngine';
import type {
  BackendSequencePayload,
  DemoPreset,
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceType,
  TrainingSequence,
} from '../types/trainer';

export interface NormalizedBackendResponse {
  sequence: TrainingSequence;
  presets?: DemoPreset[];
  activePresetId?: string;
  meshMapping?: DeviceMeshMapping;
  surfaceAnchors?: DeviceAnchorMap;
}

/**
 * Normalizes a backend API response that may be either:
 * 1) A raw TrainingSequence (`{ title, duration_ms, events }`), OR
 * 2) A rich envelope (`{ sequence, presets?, activePresetId?, meshMapping?, surfaceAnchors? }`).
 */
export function normalizeBackendPayload(
  payload: unknown,
): { ok: true; data: NormalizedBackendResponse } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Backend payload must be a valid JSON object.' };
  }

  const raw = payload as BackendSequencePayload & Record<string, unknown>;
  const rawSeq = raw.sequence ?? raw;
  const validated = validateAndNormalizeSequence(rawSeq);
  if (!validated.ok) {
    return validated;
  }

  let presets: DemoPreset[] | undefined;
  if (Array.isArray(raw.presets)) {
    const cleanPresets: DemoPreset[] = [];
    for (let i = 0; i < raw.presets.length; i++) {
      const p = raw.presets[i] as unknown as Record<string, unknown> | null;
      if (!p || typeof p !== 'object') continue;
      const pSeq = validateAndNormalizeSequence(p.sequence);
      if (!pSeq.ok) continue;
      cleanPresets.push({
        id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `preset-${i + 1}`,
        shortLabel:
          typeof p.shortLabel === 'string' && p.shortLabel.trim()
            ? p.shortLabel.trim()
            : pSeq.sequence.title,
        sequence: pSeq.sequence,
      });
    }
    if (cleanPresets.length > 0) {
      presets = cleanPresets;
    }
  }

  let meshMapping: DeviceMeshMapping | undefined;
  if (raw.meshMapping && typeof raw.meshMapping === 'object' && !Array.isArray(raw.meshMapping)) {
    const clean: DeviceMeshMapping = {};
    for (const [k, v] of Object.entries(raw.meshMapping)) {
      if (typeof k === 'string' && typeof v === 'string' && k.trim() && v.trim()) {
        clean[k.trim()] = v.trim();
      }
    }
    meshMapping = clean;
  }

  const surfaceAnchors =
    raw.surfaceAnchors && typeof raw.surfaceAnchors === 'object'
      ? sanitizeAnchorMap(raw.surfaceAnchors)
      : undefined;

  const activePresetId =
    typeof raw.activePresetId === 'string' && raw.activePresetId.trim()
      ? raw.activePresetId.trim()
      : presets?.[0]?.id;

  return {
    ok: true,
    data: {
      sequence: validated.sequence,
      presets,
      activePresetId,
      meshMapping,
      surfaceAnchors,
    },
  };
}

/**
 * Builds the REST endpoint URL for a given device & optional preset/sequence ID.
 * Supports both template URLs (`https://api.example.com/trainer/{device}`) and query-param base URLs.
 */
export function buildSequenceEndpointUrl(
  apiBaseUrl: string,
  device: DeviceType,
  presetId?: string,
): string {
  const trimmed = apiBaseUrl.trim();
  if (trimmed.includes('{device}')) {
    const replaced = trimmed.replaceAll('{device}', encodeURIComponent(device));
    if (!presetId) return replaced;
    const sep = replaced.includes('?') ? '&' : '?';
    return `${replaced}${sep}preset=${encodeURIComponent(presetId)}`;
  }

  const sep = trimmed.includes('?') ? '&' : '?';
  const base = `${trimmed}${sep}device=${encodeURIComponent(device)}`;
  return presetId ? `${base}&preset=${encodeURIComponent(presetId)}` : base;
}

export async function fetchSequenceFromApi(
  endpointUrl: string,
  init?: RequestInit,
): Promise<{ ok: true; data: NormalizedBackendResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch(endpointUrl, {
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
    if (!res.ok) {
      return { ok: false, error: `Backend request failed (${res.status} ${res.statusText}).` };
    }
    const json: unknown = await res.json();
    return normalizeBackendPayload(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error loading sequence.';
    return { ok: false, error: msg };
  }
}
