'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SEQUENCES,
  DEVICE_DEMO_PRESETS,
  PS5_DEMO_PRESETS,
  normalizeDeviceType,
} from '../data/devices';
import { sanitizeAnchorMap } from '../core/glbPlacement';
import {
  computePracticeStats,
  createPracticeSession,
  evaluatePracticeButtonPress,
  evaluatePracticeMisses,
  type PracticeSessionState,
} from '../core/practiceEngine';
import { StudioSceneController } from '../three/StudioSceneController';
import {
  buildSequenceEndpointUrl,
  fetchSequenceFromApi,
  normalizeBackendPayload,
  type NormalizedBackendResponse,
} from './apiClient';
import { HardwareInputService } from './hardwareInputService';
import type {
  AllAnchorMaps,
  AllMeshMappings,
  BackendSequencePayload,
  ConnectedControllerInfo,
  ControllerTrainerProps,
  DemoPreset,
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceModelUrls,
  DeviceType,
  LegacyDeviceAlias,
  PracticeFeedbackEntry,
  PracticeSessionStats,
  SequenceEvent,
  TrainerMode,
  TrainingSequence,
} from '../types/trainer';
import { DeviceSwitcher } from '../components/DeviceSwitcher';
import { CalloutBadge } from '../components/CalloutBadge';
import { TimelineDock } from '../components/TimelineDock';
import { BluetoothModal } from '../components/BluetoothModal';

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
  initialMode = 'demo',
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
  onPracticeFeedback,
  onControllerConnectionChange,
  onApiError,
  className = '',
}: ControllerTrainerProps) {
  const resolvedInitialDevice = useMemo(
    () => normalizeDeviceType(initialDevice) ?? 'ps5',
    [initialDevice],
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<StudioSceneController | null>(null);
  const hardwareServiceRef = useRef<HardwareInputService | null>(null);
  const fetchRequestIdRef = useRef(0);

  const [activeDevice, setActiveDevice] = useState<DeviceType>(resolvedInitialDevice);
  const [mode, setMode] = useState<TrainerMode>(initialMode);
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

  // Real Bluetooth / Hardware controller & Live Practice state
  const [connectedController, setConnectedController] = useState<ConnectedControllerInfo | null>(
    null,
  );
  const [pressedHardwareButtons, setPressedHardwareButtons] = useState<Record<string, number>>({});
  const [isBluetoothModalOpen, setIsBluetoothModalOpen] = useState(false);

  const practiceSessionRef = useRef<PracticeSessionState>(
    createPracticeSession(propSequences?.[resolvedInitialDevice] ?? DEFAULT_SEQUENCES[resolvedInitialDevice]),
  );
  const [practiceStats, setPracticeStats] = useState<PracticeSessionStats>(() =>
    computePracticeStats(practiceSessionRef.current),
  );
  const [liveFeedback, setLiveFeedback] = useState<PracticeFeedbackEntry | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const hwColorOverridesRef = useRef<Record<string, string>>({});

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [activeEvents, setActiveEvents] = useState<SequenceEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [isLoadingSequence, setIsLoadingSequence] = useState(false);

  // Fresh refs to avoid recreating the WebGLRenderer when props/state change
  const activeDeviceRef = useRef(activeDevice);
  const modeRef = useRef(mode);
  const sequencesRef = useRef(sequences);
  const mappingsRef = useRef(mappings);
  const anchorsRef = useRef(anchors);
  const currentTimeRef = useRef(currentTimeMs);
  const isPlayingRef = useRef(isPlaying);
  const loopEnabledRef = useRef(loopEnabled);
  const autoPlayRef = useRef(autoPlay);
  const apiBaseUrlRef = useRef(apiBaseUrl);
  const fetchSequenceRef = useRef(fetchSequence);
  const connectedControllerRef = useRef(connectedController);
  const practiceStatsRef = useRef(practiceStats);

  const callbacksRef = useRef({
    onDeviceChange,
    onActiveEventsChange,
    onSequenceLoaded,
    onPlayStateChange,
    onPracticeFeedback,
    onControllerConnectionChange,
    onApiError,
  });

  activeDeviceRef.current = activeDevice;
  modeRef.current = mode;
  sequencesRef.current = sequences;
  mappingsRef.current = mappings;
  anchorsRef.current = anchors;
  currentTimeRef.current = currentTimeMs;
  isPlayingRef.current = isPlaying;
  loopEnabledRef.current = loopEnabled;
  autoPlayRef.current = autoPlay;
  apiBaseUrlRef.current = apiBaseUrl;
  fetchSequenceRef.current = fetchSequence;
  connectedControllerRef.current = connectedController;
  practiceStatsRef.current = practiceStats;
  callbacksRef.current = {
    onDeviceChange,
    onActiveEventsChange,
    onSequenceLoaded,
    onPlayStateChange,
    onPracticeFeedback,
    onControllerConnectionChange,
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

  const showTransientFeedback = useCallback((entry: PracticeFeedbackEntry) => {
    setLiveFeedback(entry);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setLiveFeedback(null);
      feedbackTimerRef.current = null;
    }, 3500);
  }, []);

  const resetPracticeSession = useCallback((seq?: TrainingSequence) => {
    const targetSeq = seq ?? sequencesRef.current[activeDeviceRef.current];
    practiceSessionRef.current = createPracticeSession(targetSeq);
    const freshStats = computePracticeStats(practiceSessionRef.current);
    practiceStatsRef.current = freshStats;
    setPracticeStats(freshStats);
    setLiveFeedback(null);
    hwColorOverridesRef.current = {};
  }, []);

  const pushHardwareInputsTo3D = useCallback((pressedMap: Record<string, number>) => {
    const styled: Record<string, { value: number; color: string }> = {};
    for (const [btnId, val] of Object.entries(pressedMap)) {
      styled[btnId] = {
        value: val,
        color: hwColorOverridesRef.current[btnId] ?? '#38bdf8',
      };
    }
    controllerRef.current?.setHardwareInputs(styled);
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
          resetPracticeSession(data.sequence);
          callbacksRef.current.onDeviceChange?.(device);
          emitParentEvent('deviceChange', { device });
        } else if (device === activeDeviceRef.current || switchToDevice) {
          if (data.meshMapping) ctrl.setMeshMapping(data.meshMapping);
          if (data.surfaceAnchors) ctrl.setSurfaceAnchors(data.surfaceAnchors);
          ctrl.setSequence(data.sequence, true);
          resetPracticeSession(data.sequence);
        }
        if (autoPlayRef.current) {
          ctrl.setPlaying(true);
        }
      } else if (switchToDevice) {
        setActiveDevice(device);
        resetPracticeSession(data.sequence);
      }

      callbacksRef.current.onSequenceLoaded?.(device, data.sequence);
      emitParentEvent('sequenceLoaded', { device, title: data.sequence.title });
    },
    [emitParentEvent, resetPracticeSession],
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
          currentTimeRef.current = timeMs;
          setCurrentTimeMs(timeMs);
          setActiveEvents(events);
          callbacksRef.current.onActiveEventsChange?.(events, timeMs);

          // Live Practice Miss Detection while playing
          if (modeRef.current === 'practice' && isPlayingRef.current) {
            const seq = sequencesRef.current[activeDeviceRef.current];
            const missRes = evaluatePracticeMisses(practiceSessionRef.current, seq, timeMs);
            if (missRes.newlyMissed.length > 0) {
              practiceSessionRef.current = missRes.session;
              const stats = computePracticeStats(missRes.session);
              practiceStatsRef.current = stats;
              setPracticeStats(stats);
              const lastMiss = missRes.newlyMissed[missRes.newlyMissed.length - 1];
              showTransientFeedback(lastMiss);
              controllerRef.current?.triggerFeedbackPulse('#f43f5e');
              hardwareServiceRef.current?.triggerHaptic('error');
              callbacksRef.current.onPracticeFeedback?.(lastMiss, stats);
              emitParentEvent('practiceFeedback', { feedback: lastMiss, stats });
            }
          }
        },
        onPlayStateChange: (playing) => {
          isPlayingRef.current = playing;
          setIsPlaying(playing);
          callbacksRef.current.onPlayStateChange?.(playing);
          emitParentEvent('playStateChange', { isPlaying: playing });
        },
        onLoopRestart: () => {
          if (modeRef.current === 'practice') {
            resetPracticeSession();
          }
        },
      },
    );

    controller.setMeshMapping(mappingsRef.current[startDevice]);
    controller.setSurfaceAnchors(anchorsRef.current[startDevice]);
    controllerRef.current = controller;

    if (autoPlayRef.current) {
      controller.setPlaying(true);
    }

    void loadFromBackendIfConfigured(startDevice);

    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'ASTRO_TRAINER_READY', device: startDevice }, '*');
      } catch {
        // Safe ignore
      }
    }

    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      controller.dispose();
      controllerRef.current = null;
    };
  }, [emitParentEvent, loadFromBackendIfConfigured, resetPracticeSession, showTransientFeedback]);

  // Mount Real Bluetooth / Gamepad / PC Hardware Input Service ONCE
  useEffect(() => {
    const hw = new HardwareInputService({
      onConnectionChange: (info) => {
        setConnectedController(info);
        callbacksRef.current.onControllerConnectionChange?.(info);
        emitParentEvent('controllerConnection', { controller: info });

        // Automatically switch to the detected Bluetooth controller platform (DualSense -> ps5, Xbox -> xbox)
        if (info && activeDeviceRef.current !== info.detectedDevice) {
          const target = info.detectedDevice;
          setActiveDevice(target);
          setCurrentTimeMs(0);
          setActiveEvents([]);
          controllerRef.current?.setPlaying(false);
          controllerRef.current?.setDevice(
            target,
            sequencesRef.current[target],
            mappingsRef.current[target],
            anchorsRef.current[target],
          );
          resetPracticeSession(sequencesRef.current[target]);
          callbacksRef.current.onDeviceChange?.(target);
          emitParentEvent('deviceChange', { device: target });
        }
      },
      onButtonPress: (buttonId) => {
        if (modeRef.current === 'practice') {
          const seq = sequencesRef.current[activeDeviceRef.current];
          const timeMs = currentTimeRef.current;
          const evaluated = evaluatePracticeButtonPress(
            practiceSessionRef.current,
            seq,
            buttonId,
            timeMs,
          );
          practiceSessionRef.current = evaluated.session;
          const stats = computePracticeStats(evaluated.session);
          practiceStatsRef.current = stats;
          setPracticeStats(stats);
          showTransientFeedback(evaluated.feedback);

          const isSuccess =
            evaluated.feedback.judgement === 'perfect' ||
            evaluated.feedback.judgement === 'good';
          const isTimingWarning =
            evaluated.feedback.judgement === 'early' ||
            evaluated.feedback.judgement === 'late';
          const glowHex = isSuccess
            ? '#34d399'
            : isTimingWarning
              ? '#fbbf24'
              : '#f43f5e';

          hwColorOverridesRef.current[buttonId] = glowHex;
          controllerRef.current?.triggerFeedbackPulse(glowHex);
          hw.triggerHaptic(isSuccess ? 'hit' : 'error');

          callbacksRef.current.onPracticeFeedback?.(evaluated.feedback, stats);
          emitParentEvent('practiceFeedback', {
            feedback: evaluated.feedback,
            stats,
          });
        } else {
          // Even in Watch mode, real Bluetooth presses illuminate the 3D controller cleanly!
          hwColorOverridesRef.current[buttonId] = '#38bdf8';
          controllerRef.current?.triggerFeedbackPulse('#38bdf8');
        }
      },
      onButtonRelease: (buttonId) => {
        delete hwColorOverridesRef.current[buttonId];
      },
      onActiveButtonsChange: (pressedMap) => {
        setPressedHardwareButtons(pressedMap);
        pushHardwareInputsTo3D(pressedMap);
      },
    });

    hw.setTargetDevice(activeDeviceRef.current);
    hw.setCapturePcInputs(modeRef.current === 'practice');
    hardwareServiceRef.current = hw;

    return () => {
      hw.dispose();
      hardwareServiceRef.current = null;
    };
  }, [emitParentEvent, pushHardwareInputsTo3D, resetPracticeSession, showTransientFeedback]);

  // Keep HardwareInputService synced with activeDevice & mode
  useEffect(() => {
    hardwareServiceRef.current?.setTargetDevice(activeDevice);
  }, [activeDevice]);

  useEffect(() => {
    hardwareServiceRef.current?.setCapturePcInputs(mode === 'practice');
  }, [mode]);

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
        resetPracticeSession(activeSeq);
      }
      return next;
    });
  }, [propSequences, resetPracticeSession]);

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
      resetPracticeSession(sequencesRef.current[device]);
      callbacksRef.current.onDeviceChange?.(device);
      emitParentEvent('deviceChange', { device });
      void loadFromBackendIfConfigured(device);
    },
    [emitParentEvent, loadFromBackendIfConfigured, resetPracticeSession],
  );

  const handleSelectMode = useCallback(
    (nextMode: TrainerMode) => {
      setMode(nextMode);
      modeRef.current = nextMode;
      if (nextMode === 'practice') {
        resetPracticeSession();
        controllerRef.current?.seek(0);
      } else {
        setLiveFeedback(null);
      }
    },
    [resetPracticeSession],
  );

  const handleResetPracticeAndRestart = useCallback(() => {
    resetPracticeSession();
    controllerRef.current?.seek(0);
    controllerRef.current?.setPlaying(true);
  }, [resetPracticeSession]);

  const handleTogglePlay = useCallback(() => {
    const willPlay = !isPlayingRef.current;
    if (willPlay && modeRef.current === 'practice' && currentTimeRef.current <= 10) {
      resetPracticeSession();
    }
    controllerRef.current?.setPlaying(willPlay);
  }, [resetPracticeSession]);

  const handleToggleLoop = useCallback(() => {
    setLoopEnabled((prev) => {
      const next = !prev;
      controllerRef.current?.setLoopEnabled(next);
      return next;
    });
  }, []);

  const handleSeek = useCallback(
    (ms: number) => {
      if (modeRef.current === 'practice' && ms < currentTimeRef.current) {
        resetPracticeSession();
      }
      controllerRef.current?.seek(ms);
    },
    [resetPracticeSession],
  );

  const handleSelectPreset = useCallback(
    (preset: DemoPreset) => {
      const dev = activeDeviceRef.current;
      setActivePresetIds((prev) => ({ ...prev, [dev]: preset.id }));
      setSequences((prev) => ({ ...prev, [dev]: preset.sequence }));
      resetPracticeSession(preset.sequence);
      controllerRef.current?.setSequence(preset.sequence, true);
      controllerRef.current?.setPlaying(true);
      callbacksRef.current.onSequenceLoaded?.(dev, preset.sequence);
    },
    [resetPracticeSession],
  );

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
      setMode: (nextMode: TrainerMode) => {
        handleSelectMode(nextMode);
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
      connectBluetooth: async () => {
        return (await hardwareServiceRef.current?.connectBluetooth()) ?? null;
      },
      getControllerStatus: () => connectedControllerRef.current,
      getPracticeStats: () => practiceStatsRef.current,
      resetPractice: () => resetPracticeSession(),
      simulateHardwareInput: (buttonId: string, pressed: boolean, value = 1) => {
        hardwareServiceRef.current?.simulateInput(buttonId, pressed, value);
      },
      play: () => controllerRef.current?.setPlaying(true),
      pause: () => controllerRef.current?.setPlaying(false),
      seek: (ms: number) => handleSeek(ms),
      setLoop: (enabled: boolean) => {
        setLoopEnabled(enabled);
        controllerRef.current?.setLoopEnabled(enabled);
      },
      resetCamera: () => controllerRef.current?.resetCamera(),
      getState: () => ({
        device: activeDeviceRef.current,
        mode: modeRef.current,
        currentTimeMs: currentTimeRef.current,
        isPlaying: isPlayingRef.current,
        loopEnabled: loopEnabledRef.current,
        controller: connectedControllerRef.current,
        practiceStats: practiceStatsRef.current,
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
        case 'setMode':
          if (msg.mode === 'demo' || msg.mode === 'practice') {
            api.setMode(msg.mode);
          }
          break;
        case 'connectBluetooth':
          void api.connectBluetooth();
          break;
        case 'resetPractice':
          api.resetPractice();
          break;
        case 'simulateHardwareInput':
          if (typeof msg.buttonId === 'string' && typeof msg.pressed === 'boolean') {
            api.simulateHardwareInput(
              msg.buttonId,
              msg.pressed,
              typeof msg.value === 'number' ? msg.value : 1,
            );
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
  }, [applyNormalizedPayload, handleSeek, handleSelectDevice, handleSelectMode, resetPracticeSession]);

  // Global keyboard shortcuts (Space: Play/Pause when not in PC practice mode, H: Toggle Fullscreen Stage)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !(modeRef.current === 'practice' && activeDeviceRef.current === 'pc')) {
        e.preventDefault();
        handleTogglePlay();
      } else if ((e.key === 'h' || e.key === 'H') && !(modeRef.current === 'practice' && activeDeviceRef.current === 'pc')) {
        setIsHudCollapsed((v) => !v);
      } else if (e.key === 'Escape') {
        setIsBluetoothModalOpen(false);
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
      data-mode={mode}
      data-playing={isPlaying ? 'true' : 'false'}
      data-bt-connected={connectedController ? 'true' : 'false'}
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

      {/* Floating Glassmorphic Active Input / Live Practice Judgement Callout */}
      <CalloutBadge
        activeEvents={activeEvents}
        mode={mode}
        practiceFeedback={liveFeedback}
      />

      {/* Bottom VisionOS Dark Glass Timeline & Live Bluetooth Test Dock */}
      <TimelineDock
        sequence={currentSequence}
        demoPresets={currentDemoPresets}
        activePresetId={activePresetIds[activeDevice] ?? null}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        loopEnabled={loopEnabled}
        isCollapsed={isHudCollapsed}
        isLoadingSequence={isLoadingSequence}
        mode={mode}
        controller={connectedController}
        practiceStats={practiceStats}
        onSelectMode={handleSelectMode}
        onOpenBluetooth={() => {
          hardwareServiceRef.current?.scanExistingGamepads();
          setIsBluetoothModalOpen(true);
        }}
        onResetPractice={handleResetPracticeAndRestart}
        onSelectPreset={handleSelectPreset}
        onTogglePlay={handleTogglePlay}
        onToggleLoop={handleToggleLoop}
        onSeek={handleSeek}
        onToggleCollapse={() => setIsHudCollapsed((v) => !v)}
        onResetCamera={() => controllerRef.current?.resetCamera()}
      />

      {/* Compact Bluetooth Pairing & Live Button Tester Modal */}
      <BluetoothModal
        open={isBluetoothModalOpen}
        activeDevice={activeDevice}
        controller={connectedController}
        pressedButtons={Object.keys(pressedHardwareButtons)}
        onClose={() => setIsBluetoothModalOpen(false)}
        onScanBluetooth={() => {
          void hardwareServiceRef.current?.connectBluetooth();
        }}
        onStartLiveTest={() => {
          handleSelectMode('practice');
          controllerRef.current?.setPlaying(true);
        }}
      />
    </main>
  );
}
