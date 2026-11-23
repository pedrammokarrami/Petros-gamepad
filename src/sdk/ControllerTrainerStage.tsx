import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SEQUENCES,
  DEVICE_DEMO_PRESETS,
  PS5_DEMO_PRESETS,
  normalizeDeviceType,
} from '../data/devices';
import { sanitizeAnchorMap } from '../core/glbPlacement';
import { StudioSceneController } from '../three/StudioSceneController';
import {
  buildSequenceEndpointUrl,
  fetchSequenceFromApi,
  normalizeBackendPayload,
  type NormalizedBackendResponse,
} from './apiClient';
import type {
  AllAnchorMaps,
  AllMeshMappings,
  BackendSequencePayload,
  ControllerTrainerProps,
  DemoPreset,
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceModelUrls,
  DeviceType,
  LegacyDeviceAlias,
  SequenceEvent,
  TrainingSequence,
} from '../types/trainer';
import { DeviceSwitcher } from '../components/DeviceSwitcher';
import { CalloutBadge } from '../components/CalloutBadge';
import { TimelineDock } from '../components/TimelineDock';

const EMPTY_MAPPINGS: AllMeshMappings = { ps5: {}, xbox: {}, pc: {}, ipad: {} };
const EMPTY_ANCHORS: AllAnchorMaps = { ps5: {}, xbox: {}, pc: {}, ipad: {} };

function mergeModelConfigs(
  manifest: Partial<Record<DeviceType, DeviceModelUrls>>,
  override?: Partial<Record<DeviceType, DeviceModelUrls>>,
): Partial<Record<DeviceType, DeviceModelUrls>> {
  const result: Partial<Record<DeviceType, DeviceModelUrls>> = {};
  const devices: DeviceType[] = ['ps5', 'xbox', 'pc', 'ipad'];
  for (const dev of devices) {
    const merged: DeviceModelUrls = {
      ...(manifest[dev] ?? {}),
      ...(override?.[dev] ?? {}),
    };
    if (
      merged.deviceGlbUrl ||
      merged.keyboardGlbUrl ||
      merged.mouseGlbUrl ||
      merged.backgroundGlbUrl
    ) {
      result[dev] = merged;
    }
  }
  return result;
}

export function ControllerTrainerStage({
  initialDevice = 'ps5',
  apiBaseUrl,
  fetchSequence,
  sequences: propSequences,
  presets: propPresets,
  models: propModels,
  meshMappings: propMeshMappings,
  surfaceAnchors: propSurfaceAnchors,
  autoPlay = false,
  hideDeviceSwitcher = false,
  onDeviceChange,
  onActiveEventsChange,
  onSequenceLoaded,
  onPlayStateChange,
  onApiError,
  className = '',
}: ControllerTrainerProps) {
  const resolvedInitialDevice = useMemo(
    () => normalizeDeviceType(initialDevice) ?? 'ps5',
    [initialDevice],
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<StudioSceneController | null>(null);
  const fetchRequestIdRef = useRef(0);

  const [activeDevice, setActiveDevice] = useState<DeviceType>(resolvedInitialDevice);
  const [sequences, setSequences] = useState<Record<DeviceType, TrainingSequence>>(() => ({
    ps5: propSequences?.ps5 ?? DEFAULT_SEQUENCES.ps5,
    xbox: propSequences?.xbox ?? DEFAULT_SEQUENCES.xbox,
    pc: propSequences?.pc ?? DEFAULT_SEQUENCES.pc,
    ipad: propSequences?.ipad ?? DEFAULT_SEQUENCES.ipad,
  }));
  const [presetsByDevice, setPresetsByDevice] = useState<Partial<Record<DeviceType, DemoPreset[]>>>(
    () => ({
      ...DEVICE_DEMO_PRESETS,
      ...(propPresets ?? {}),
    }),
  );
  const [activePresetIds, setActivePresetIds] = useState<Partial<Record<DeviceType, string>>>(() => ({
    ps5: propPresets?.ps5?.[0]?.id ?? PS5_DEMO_PRESETS[0].id,
    xbox: propPresets?.xbox?.[0]?.id,
    pc: propPresets?.pc?.[0]?.id,
    ipad: propPresets?.ipad?.[0]?.id,
  }));
  const [mappings, setMappings] = useState<AllMeshMappings>(() => ({
    ps5: propMeshMappings?.ps5 ?? EMPTY_MAPPINGS.ps5,
    xbox: propMeshMappings?.xbox ?? EMPTY_MAPPINGS.xbox,
    pc: propMeshMappings?.pc ?? EMPTY_MAPPINGS.pc,
    ipad: propMeshMappings?.ipad ?? EMPTY_MAPPINGS.ipad,
  }));
  const [anchors, setAnchors] = useState<AllAnchorMaps>(() => ({
    ps5: propSurfaceAnchors?.ps5 ? sanitizeAnchorMap(propSurfaceAnchors.ps5) : EMPTY_ANCHORS.ps5,
    xbox: propSurfaceAnchors?.xbox ? sanitizeAnchorMap(propSurfaceAnchors.xbox) : EMPTY_ANCHORS.xbox,
    pc: propSurfaceAnchors?.pc ? sanitizeAnchorMap(propSurfaceAnchors.pc) : EMPTY_ANCHORS.pc,
    ipad: propSurfaceAnchors?.ipad ? sanitizeAnchorMap(propSurfaceAnchors.ipad) : EMPTY_ANCHORS.ipad,
  }));
  const [manifestModels, setManifestModels] = useState<Partial<Record<DeviceType, DeviceModelUrls>>>(
    {},
  );

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [activeEvents, setActiveEvents] = useState<SequenceEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [isLoadingSequence, setIsLoadingSequence] = useState(false);

  // Fresh refs to avoid recreating the WebGLRenderer when props/state change
  const activeDeviceRef = useRef(activeDevice);
  const sequencesRef = useRef(sequences);
  const mappingsRef = useRef(mappings);
  const anchorsRef = useRef(anchors);
  const currentTimeRef = useRef(currentTimeMs);
  const isPlayingRef = useRef(isPlaying);
  const loopEnabledRef = useRef(loopEnabled);
  const autoPlayRef = useRef(autoPlay);
  const apiBaseUrlRef = useRef(apiBaseUrl);
  const fetchSequenceRef = useRef(fetchSequence);

  const callbacksRef = useRef({
    onDeviceChange,
    onActiveEventsChange,
    onSequenceLoaded,
    onPlayStateChange,
    onApiError,
  });

  activeDeviceRef.current = activeDevice;
  sequencesRef.current = sequences;
  mappingsRef.current = mappings;
  anchorsRef.current = anchors;
  currentTimeRef.current = currentTimeMs;
  isPlayingRef.current = isPlaying;
  loopEnabledRef.current = loopEnabled;
  autoPlayRef.current = autoPlay;
  apiBaseUrlRef.current = apiBaseUrl;
  fetchSequenceRef.current = fetchSequence;
  callbacksRef.current = {
    onDeviceChange,
    onActiveEventsChange,
    onSequenceLoaded,
    onPlayStateChange,
    onApiError,
  };

  const emitParentEvent = useCallback((event: string, detail: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'ASTRO_TRAINER_EVENT', event, ...detail }, '*');
      } catch {
        // Cross-origin parent postMessage ignored safely
      }
    }
  }, []);

  // Apply normalized backend/API payload to state & 3D scene
  const applyNormalizedPayload = useCallback(
    (device: DeviceType, data: NormalizedBackendResponse, switchToDevice: boolean) => {
      const nextMapping = data.meshMapping ?? mappingsRef.current[device];
      const nextAnchors = data.surfaceAnchors ?? anchorsRef.current[device];

      setSequences((prev) => ({ ...prev, [device]: data.sequence }));
      if (data.presets) {
        setPresetsByDevice((prev) => ({ ...prev, [device]: data.presets }));
      }
      if (data.activePresetId) {
        setActivePresetIds((prev) => ({ ...prev, [device]: data.activePresetId }));
      }
      if (data.meshMapping) {
        setMappings((prev) => ({ ...prev, [device]: data.meshMapping! }));
      }
      if (data.surfaceAnchors) {
        setAnchors((prev) => ({ ...prev, [device]: data.surfaceAnchors! }));
      }

      const ctrl = controllerRef.current;
      if (ctrl) {
        if (switchToDevice && device !== activeDeviceRef.current) {
          setActiveDevice(device);
          setCurrentTimeMs(0);
          setActiveEvents([]);
          ctrl.setPlaying(false);
          ctrl.setDevice(device, data.sequence, nextMapping, nextAnchors);
          callbacksRef.current.onDeviceChange?.(device);
          emitParentEvent('deviceChange', { device });
        } else if (device === activeDeviceRef.current || switchToDevice) {
          if (data.meshMapping) ctrl.setMeshMapping(data.meshMapping);
          if (data.surfaceAnchors) ctrl.setSurfaceAnchors(data.surfaceAnchors);
          ctrl.setSequence(data.sequence, true);
        }
        if (autoPlayRef.current) {
          ctrl.setPlaying(true);
        }
      } else if (switchToDevice) {
        setActiveDevice(device);
      }

      callbacksRef.current.onSequenceLoaded?.(device, data.sequence);
      emitParentEvent('sequenceLoaded', { device, title: data.sequence.title });
    },
    [emitParentEvent],
  );

  // Fetch sequence from custom fetcher or apiBaseUrl whenever configured
  const loadFromBackendIfConfigured = useCallback(
    async (device: DeviceType, presetId?: string) => {
      const customFetcher = fetchSequenceRef.current;
      const baseUrl = apiBaseUrlRef.current;
      if (!customFetcher && !baseUrl) return;

      const reqId = ++fetchRequestIdRef.current;
      setIsLoadingSequence(true);

      try {
        let result:
          | { ok: true; data: NormalizedBackendResponse }
          | { ok: false; error: string };

        if (customFetcher) {
          const raw = await customFetcher(device, presetId);
          result = normalizeBackendPayload(raw);
        } else {
          const url = buildSequenceEndpointUrl(baseUrl!, device, presetId);
          result = await fetchSequenceFromApi(url);
        }

        if (reqId !== fetchRequestIdRef.current) return;

        if (result.ok) {
          applyNormalizedPayload(device, result.data, false);
        } else {
          callbacksRef.current.onApiError?.(new Error(result.error), device);
        }
      } catch (err) {
        if (reqId !== fetchRequestIdRef.current) return;
        const errorObj = err instanceof Error ? err : new Error('Failed to load backend sequence.');
        callbacksRef.current.onApiError?.(errorObj, device);
      } finally {
        if (reqId === fetchRequestIdRef.current) {
          setIsLoadingSequence(false);
        }
      }
    },
    [applyNormalizedPayload],
  );

  // Load optional static drop-in GLB manifest (`/models/manifest.json`) once on mount (returns 200 OK)
  useEffect(() => {
    let cancelled = false;
    fetch('/models/manifest.json', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== 'object') return;
        setManifestModels(json as Partial<Record<DeviceType, DeviceModelUrls>>);
      })
      .catch(() => {
        // Optional manifest unavailable — built-in 3D models remain active
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount Three.js StudioSceneController ONCE inside dedicated isolated ref div
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const startDevice = activeDeviceRef.current;
    const controller = new StudioSceneController(
      mountEl,
      startDevice,
      sequencesRef.current[startDevice],
      {
        onTimeUpdate: (timeMs, events) => {
          setCurrentTimeMs(timeMs);
          setActiveEvents(events);
          callbacksRef.current.onActiveEventsChange?.(events, timeMs);
        },
        onPlayStateChange: (playing) => {
          setIsPlaying(playing);
          callbacksRef.current.onPlayStateChange?.(playing);
          emitParentEvent('playStateChange', { isPlaying: playing });
        },
      },
    );

    controller.setMeshMapping(mappingsRef.current[startDevice]);
    controller.setSurfaceAnchors(anchorsRef.current[startDevice]);
    controllerRef.current = controller;

    if (autoPlayRef.current) {
      controller.setPlaying(true);
    }

    // Trigger initial backend fetch if apiBaseUrl or fetchSequence is provided
    void loadFromBackendIfConfigured(startDevice);

    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'ASTRO_TRAINER_READY', device: startDevice }, '*');
      } catch {
        // Safe ignore
      }
    }

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [emitParentEvent, loadFromBackendIfConfigured]);

  // Sync merged GLB model URLs into the 3D scene controller
  useEffect(() => {
    const merged = mergeModelConfigs(manifestModels, propModels);
    controllerRef.current?.setModelUrls(merged);
  }, [manifestModels, propModels]);

  // Sync reactive prop sequences when provided by parent React app
  useEffect(() => {
    if (!propSequences) return;
    setSequences((prev) => {
      const next = { ...prev, ...propSequences };
      const activeSeq = propSequences[activeDeviceRef.current];
      if (activeSeq) {
        controllerRef.current?.setSequence(activeSeq, true);
      }
      return next;
    });
  }, [propSequences]);

  // Sync reactive prop presets
  useEffect(() => {
    if (!propPresets) return;
    setPresetsByDevice((prev) => ({ ...prev, ...propPresets }));
  }, [propPresets]);

  // Sync reactive prop mesh mappings
  useEffect(() => {
    if (!propMeshMappings) return;
    setMappings((prev) => {
      const next: AllMeshMappings = {
        ps5: propMeshMappings.ps5 ?? prev.ps5,
        xbox: propMeshMappings.xbox ?? prev.xbox,
        pc: propMeshMappings.pc ?? prev.pc,
        ipad: propMeshMappings.ipad ?? prev.ipad,
      };
      controllerRef.current?.setMeshMapping(next[activeDeviceRef.current]);
      return next;
    });
  }, [propMeshMappings]);

  // Sync reactive prop surface anchors
  useEffect(() => {
    if (!propSurfaceAnchors) return;
    setAnchors((prev) => {
      const next: AllAnchorMaps = {
        ps5: propSurfaceAnchors.ps5 ? sanitizeAnchorMap(propSurfaceAnchors.ps5) : prev.ps5,
        xbox: propSurfaceAnchors.xbox ? sanitizeAnchorMap(propSurfaceAnchors.xbox) : prev.xbox,
        pc: propSurfaceAnchors.pc ? sanitizeAnchorMap(propSurfaceAnchors.pc) : prev.pc,
        ipad: propSurfaceAnchors.ipad ? sanitizeAnchorMap(propSurfaceAnchors.ipad) : prev.ipad,
      };
      controllerRef.current?.setSurfaceAnchors(next[activeDeviceRef.current]);
      return next;
    });
  }, [propSurfaceAnchors]);

  // Re-fetch when apiBaseUrl or fetchSequence prop changes
  useEffect(() => {
    if (!apiBaseUrl && !fetchSequence) return;
    void loadFromBackendIfConfigured(activeDeviceRef.current);
  }, [apiBaseUrl, fetchSequence, loadFromBackendIfConfigured]);

  const handleSelectDevice = useCallback(
    (device: DeviceType) => {
      setActiveDevice(device);
      setCurrentTimeMs(0);
      setActiveEvents([]);
      controllerRef.current?.setPlaying(false);
      controllerRef.current?.setDevice(
        device,
        sequencesRef.current[device],
        mappingsRef.current[device],
        anchorsRef.current[device],
      );
      callbacksRef.current.onDeviceChange?.(device);
      emitParentEvent('deviceChange', { device });
      void loadFromBackendIfConfigured(device);
    },
    [emitParentEvent, loadFromBackendIfConfigured],
  );

  const handleTogglePlay = useCallback(() => {
    controllerRef.current?.setPlaying(!isPlayingRef.current);
  }, []);

  const handleToggleLoop = useCallback(() => {
    setLoopEnabled((prev) => {
      const next = !prev;
      controllerRef.current?.setLoopEnabled(next);
      return next;
    });
  }, []);

  const handleSeek = useCallback((ms: number) => {
    controllerRef.current?.seek(ms);
  }, []);

  const handleSelectPreset = useCallback((preset: DemoPreset) => {
    const dev = activeDeviceRef.current;
    setActivePresetIds((prev) => ({ ...prev, [dev]: preset.id }));
    setSequences((prev) => ({ ...prev, [dev]: preset.sequence }));
    controllerRef.current?.setSequence(preset.sequence, true);
    controllerRef.current?.setPlaying(true);
    callbacksRef.current.onSequenceLoaded?.(dev, preset.sequence);
  }, []);

  // Register global host integration API (`window.AstroTrainerAPI`) + iframe `postMessage` bridge
  useEffect(() => {
    const api = {
      loadSequence: (
        deviceType: LegacyDeviceAlias,
        jsonData: BackendSequencePayload | TrainingSequence,
      ) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (!normalizedDevice) return false;
        const parsed = normalizeBackendPayload(jsonData);
        if (!parsed.ok) {
          callbacksRef.current.onApiError?.(new Error(parsed.error), normalizedDevice);
          return false;
        }
        applyNormalizedPayload(normalizedDevice, parsed.data, true);
        return true;
      },
      loadFromUrl: async (
        deviceType: LegacyDeviceAlias,
        endpointUrl: string,
        fetchInit?: RequestInit,
      ) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (!normalizedDevice) return false;
        setIsLoadingSequence(true);
        try {
          const result = await fetchSequenceFromApi(endpointUrl, fetchInit);
          if (!result.ok) {
            callbacksRef.current.onApiError?.(new Error(result.error), normalizedDevice);
            return false;
          }
          applyNormalizedPayload(normalizedDevice, result.data, true);
          return true;
        } finally {
          setIsLoadingSequence(false);
        }
      },
      setDevice: (deviceType: LegacyDeviceAlias) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (normalizedDevice) {
          handleSelectDevice(normalizedDevice);
        }
      },
      setMeshMapping: (deviceType: LegacyDeviceAlias, mapping: DeviceMeshMapping) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (!normalizedDevice) return;
        setMappings((prev) => ({ ...prev, [normalizedDevice]: mapping }));
        if (normalizedDevice === activeDeviceRef.current) {
          controllerRef.current?.setMeshMapping(mapping);
        }
      },
      setSurfaceAnchors: (deviceType: LegacyDeviceAlias, nextAnchors: DeviceAnchorMap) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (!normalizedDevice) return;
        const clean = sanitizeAnchorMap(nextAnchors);
        setAnchors((prev) => ({ ...prev, [normalizedDevice]: clean }));
        if (normalizedDevice === activeDeviceRef.current) {
          controllerRef.current?.setSurfaceAnchors(clean);
        }
      },
      play: () => controllerRef.current?.setPlaying(true),
      pause: () => controllerRef.current?.setPlaying(false),
      seek: (ms: number) => controllerRef.current?.seek(ms),
      setLoop: (enabled: boolean) => {
        setLoopEnabled(enabled);
        controllerRef.current?.setLoopEnabled(enabled);
      },
      resetCamera: () => controllerRef.current?.resetCamera(),
      getState: () => ({
        device: activeDeviceRef.current,
        currentTimeMs: currentTimeRef.current,
        isPlaying: isPlayingRef.current,
        loopEnabled: loopEnabledRef.current,
        sequence: sequencesRef.current[activeDeviceRef.current],
      }),
    };

    window.AstroTrainerAPI = api;

    const handlePostMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown> | null;
      if (!msg || typeof msg !== 'object' || msg.type !== 'ASTRO_TRAINER_CMD') return;
      switch (msg.action) {
        case 'loadSequence':
          if (typeof msg.device === 'string' && msg.payload) {
            api.loadSequence(
              msg.device as LegacyDeviceAlias,
              msg.payload as BackendSequencePayload | TrainingSequence,
            );
          }
          break;
        case 'loadFromUrl':
          if (typeof msg.device === 'string' && typeof msg.url === 'string') {
            void api.loadFromUrl(msg.device as LegacyDeviceAlias, msg.url);
          }
          break;
        case 'setDevice':
          if (typeof msg.device === 'string') {
            api.setDevice(msg.device as LegacyDeviceAlias);
          }
          break;
        case 'setMeshMapping':
          if (typeof msg.device === 'string' && msg.mapping && typeof msg.mapping === 'object') {
            api.setMeshMapping(
              msg.device as LegacyDeviceAlias,
              msg.mapping as DeviceMeshMapping,
            );
          }
          break;
        case 'setSurfaceAnchors':
          if (typeof msg.device === 'string' && msg.anchors && typeof msg.anchors === 'object') {
            api.setSurfaceAnchors(
              msg.device as LegacyDeviceAlias,
              msg.anchors as DeviceAnchorMap,
            );
          }
          break;
        case 'play':
          api.play();
          break;
        case 'pause':
          api.pause();
          break;
        case 'seek':
          if (typeof msg.timeMs === 'number') api.seek(msg.timeMs);
          break;
        case 'setLoop':
          if (typeof msg.enabled === 'boolean') api.setLoop(msg.enabled);
          break;
        case 'resetCamera':
          api.resetCamera();
          break;
      }
    };

    window.addEventListener('message', handlePostMessage);
    return () => {
      window.removeEventListener('message', handlePostMessage);
      delete window.AstroTrainerAPI;
    };
  }, [applyNormalizedPayload, handleSelectDevice]);

  // Global keyboard shortcuts (Space: Play/Pause, H: Toggle Fullscreen Stage)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'h' || e.key === 'H') {
        setIsHudCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  const currentSequence = sequences[activeDevice];
  const currentDemoPresets = presetsByDevice[activeDevice] ?? [];

  return (
    <main
      dir="ltr"
      data-device={activeDevice}
      data-playing={isPlaying ? 'true' : 'false'}
      className={`relative w-full h-full overflow-hidden bg-[#c8cfd9] ${className}`.trim()}
    >
      {/* Dedicated isolated WebGL canvas container (never re-rendered by HUD updates) */}
      <div
        ref={canvasMountRef}
        data-testid="studio-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      {/* Top Glassmorphic Platform Switcher */}
      {!hideDeviceSwitcher && (
        <DeviceSwitcher activeDevice={activeDevice} onSelect={handleSelectDevice} />
      )}

      {/* Floating Glassmorphic Active Input Callout Badge */}
      <CalloutBadge activeEvents={activeEvents} />

      {/* Bottom VisionOS Dark Glass Timeline Dock */}
      <TimelineDock
        sequence={currentSequence}
        demoPresets={currentDemoPresets}
        activePresetId={activePresetIds[activeDevice] ?? null}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        loopEnabled={loopEnabled}
        isCollapsed={isHudCollapsed}
        isLoadingSequence={isLoadingSequence}
        onSelectPreset={handleSelectPreset}
        onTogglePlay={handleTogglePlay}
        onToggleLoop={handleToggleLoop}
        onSeek={handleSeek}
        onToggleCollapse={() => setIsHudCollapsed((v) => !v)}
        onResetCamera={() => controllerRef.current?.resetCamera()}
      />
    </main>
  );
}
