import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  DEFAULT_SEQUENCES,
  DEVICE_DEMO_PRESETS,
  DEVICE_PLATFORMS,
  PS5_DEMO_PRESETS,
  normalizeDeviceType,
} from './data/devices';
import {
  assignButtonMesh,
  loadMappingsFromStorage,
  parseMappingImport,
  saveMappingsToStorage,
  serializeMappingExport,
} from './core/meshMapping';
import {
  assignSurfaceAnchor,
  loadAnchorsFromStorage,
  loadGlbTransformsFromStorage,
  removeSurfaceAnchor,
  saveAnchorsToStorage,
  saveGlbTransformsToStorage,
} from './core/glbPlacement';
import {
  deletePersistedGlbForDevice,
  loadAllPersistedGlbs,
  savePersistedGlb,
} from './core/glbStorage';
import { validateAndNormalizeSequence } from './core/sequenceEngine';
import { StudioSceneController } from './three/StudioSceneController';
import type {
  AllAnchorMaps,
  AllGlbTransforms,
  AllMeshMappings,
  CustomModelInfo,
  DemoPreset,
  DeviceType,
  GlbTransform,
  LegacyDeviceAlias,
  PcGlbSlot,
  SelectedMeshInfo,
  SequenceEvent,
  TrainingSequence,
} from './types/trainer';
import { DeviceSwitcher } from './components/DeviceSwitcher';
import { CalloutBadge } from './components/CalloutBadge';
import { MeshBinderPopover } from './components/MeshBinderPopover';
import { TimelineDock } from './components/TimelineDock';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'neutral' | 'success' | 'error';
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<StudioSceneController | null>(null);

  const [activeDevice, setActiveDevice] = useState<DeviceType>('ps5');
  const [sequences, setSequences] = useState<Record<DeviceType, TrainingSequence>>(
    () => ({ ...DEFAULT_SEQUENCES }),
  );
  const [mappings, setMappings] = useState<AllMeshMappings>(() =>
    loadMappingsFromStorage(),
  );
  const [anchors, setAnchors] = useState<AllAnchorMaps>(() =>
    loadAnchorsFromStorage(),
  );
  const [glbTransforms, setGlbTransforms] = useState<AllGlbTransforms>(() =>
    loadGlbTransformsFromStorage(),
  );
  const [customModels, setCustomModels] = useState<
    Partial<Record<DeviceType, CustomModelInfo>>
  >({});
  const [activePresetIds, setActivePresetIds] = useState<Partial<Record<DeviceType, string>>>({
    ps5: PS5_DEMO_PRESETS[0].id,
  });

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [activeEvents, setActiveEvents] = useState<SequenceEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);

  const [hoveredMeshName, setHoveredMeshName] = useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<SelectedMeshInfo | null>(null);
  const [isDraggingGlb, setIsDraggingGlb] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Refs to keep global API and controller callbacks fresh without recreating WebGLRenderer
  const activeDeviceRef = useRef(activeDevice);
  const sequencesRef = useRef(sequences);
  const mappingsRef = useRef(mappings);
  const anchorsRef = useRef(anchors);
  const glbTransformsRef = useRef(glbTransforms);
  const currentTimeRef = useRef(currentTimeMs);
  const isPlayingRef = useRef(isPlaying);

  activeDeviceRef.current = activeDevice;
  sequencesRef.current = sequences;
  mappingsRef.current = mappings;
  anchorsRef.current = anchors;
  glbTransformsRef.current = glbTransforms;
  currentTimeRef.current = currentTimeMs;
  isPlayingRef.current = isPlaying;

  const showToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'neutral') => {
      const id = Date.now();
      setToast({ id, text, tone });
      window.setTimeout(() => {
        setToast((prev) => (prev && prev.id === id ? null : prev));
      }, 4200);
    },
    [],
  );

  // Persist mappings, exact surface anchors, and GLB placement transforms automatically to localStorage
  useEffect(() => {
    saveMappingsToStorage(mappings);
  }, [mappings]);

  useEffect(() => {
    saveAnchorsToStorage(anchors);
  }, [anchors]);

  useEffect(() => {
    saveGlbTransformsToStorage(glbTransforms);
  }, [glbTransforms]);

  // Mount Three.js StudioSceneController ONCE inside dedicated isolated ref div
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const controller = new StudioSceneController(
      mountEl,
      sequencesRef.current.ps5,
      {
        onTimeUpdate: (timeMs, events) => {
          setCurrentTimeMs(timeMs);
          setActiveEvents(events);
        },
        onPlayStateChange: (playing) => {
          setIsPlaying(playing);
        },
        onMeshSelected: (info) => {
          setSelectedMesh(info);
        },
        onMeshHovered: (meshName) => {
          setHoveredMeshName(meshName);
        },
        onModelLoaded: (device, fileName, meshCount, autoTransform, isRestore) => {
          setCustomModels((prev) => ({
            ...prev,
            [device]: { fileName, meshCount, loadedAt: Date.now() },
          }));
          if (isRestore) {
            // Restoring permanently saved GLB from IndexedDB: preserve saved mappings, exact anchors, and orientation
            return;
          }
          if (autoTransform) {
            setGlbTransforms((prev) => ({ ...prev, [device]: autoTransform }));
          }
          setSelectedMesh(null);

          const existingCount = new Set([
            ...Object.keys(mappingsRef.current[device] ?? {}),
            ...Object.keys(anchorsRef.current[device] ?? {}),
          ]).size;

          if (existingCount > 0) {
            // Preserve all previously mapped buttons & exact pinned points so user never loses their setup!
            controllerRef.current?.setMeshMapping(mappingsRef.current[device]);
            controllerRef.current?.setSurfaceAnchors(anchorsRef.current[device]);
            showToast(
              `مدل «${fileName}» ذخیره دائم شد و تمام ${existingCount} دکمه و نقطه قبلی شما حفظ گردید.`,
              'success',
            );
          } else {
            // Brand-new model with no mappings yet: open calibration bar so user can orient & pin exact spots
            setIsMappingMode(true);
            controllerRef.current?.setPlaying(false);
            controllerRef.current?.setMappingMode(true);
            showToast(
              `مدل «${fileName}» ذخیره دائم شد — جهت آن را بررسی کرده و روی نقاط دقیق کلیک کنید.`,
              'success',
            );
          }
        },
        onModelError: (msg) => {
          showToast(msg, 'error');
        },
      },
    );

    // Sync initial persisted anchors & mappings for initial ps5 device
    controller.setMeshMapping(mappingsRef.current.ps5);
    controller.setSurfaceAnchors(anchorsRef.current.ps5);
    controllerRef.current = controller;

    // Automatically restore permanently saved .glb files (e.g. user's custom PS5 DualSense) from IndexedDB
    let cancelled = false;
    loadAllPersistedGlbs()
      .then(async (records) => {
        if (cancelled || records.length === 0) return;
        for (const rec of records) {
          if (cancelled) break;
          try {
            await controller.loadGlbBuffer(rec.device, rec.buffer, rec.fileName, rec.slot, {
              silentRestore: true,
              savedTransform: glbTransformsRef.current[rec.device],
            });
          } catch {
            // Ignore corrupted stored record without breaking startup
          }
        }
      })
      .catch(() => {
        // IndexedDB unavailable
      });

    return () => {
      cancelled = true;
      controller.dispose();
      controllerRef.current = null;
    };
  }, [showToast]);

  const handleSelectDevice = useCallback((device: DeviceType) => {
    setActiveDevice(device);
    setSelectedMesh(null);
    setHoveredMeshName(null);
    setCurrentTimeMs(0);
    setActiveEvents([]);
    controllerRef.current?.setPlaying(false);
    controllerRef.current?.setDevice(
      device,
      sequencesRef.current[device],
      mappingsRef.current[device],
      anchorsRef.current[device],
      glbTransformsRef.current[device],
    );
  }, []);

  const handleTogglePlay = useCallback(() => {
    const next = !isPlayingRef.current;
    controllerRef.current?.setPlaying(next);
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
    setIsMappingMode(false);
    setSelectedMesh(null);
    controllerRef.current?.setMappingMode(false);
    controllerRef.current?.setSequence(preset.sequence, true);
    controllerRef.current?.setPlaying(true);
  }, []);

  const handleToggleMappingMode = useCallback(() => {
    setIsMappingMode((prev) => {
      const next = !prev;
      if (next) {
        controllerRef.current?.setPlaying(false);
      }
      controllerRef.current?.setMappingMode(next);
      return next;
    });
  }, []);

  const handleAssignButtonPoint = useCallback(
    (buttonId: string, hit: SelectedMeshInfo) => {
      const dev = activeDeviceRef.current;
      // 1. Save exact 3D local surface point & normal so indicators lock onto this exact millimeter
      setAnchors((prev) => {
        const updatedAnchors = assignSurfaceAnchor(prev[dev], buttonId, {
          point: hit.localPoint,
          normal: hit.localNormal,
          meshName: hit.meshName,
        });
        controllerRef.current?.setSurfaceAnchors(updatedAnchors);
        return { ...prev, [dev]: updatedAnchors };
      });
      // 2. Also bind mesh name for physical button depression when the model has separate button meshes
      setMappings((prev) => {
        const updatedDeviceMap = assignButtonMesh(prev[dev], buttonId, hit.meshName);
        controllerRef.current?.setMeshMapping(updatedDeviceMap);
        return { ...prev, [dev]: updatedDeviceMap };
      });
      showToast(`نقطه دقیق برای ${buttonId} روی مدل ثبت شد.`, 'success');
    },
    [showToast],
  );

  const handleUnassignButton = useCallback(
    (buttonId: string) => {
      const dev = activeDeviceRef.current;
      setAnchors((prev) => {
        const updatedAnchors = removeSurfaceAnchor(prev[dev], buttonId);
        controllerRef.current?.setSurfaceAnchors(updatedAnchors);
        return { ...prev, [dev]: updatedAnchors };
      });
      setMappings((prev) => {
        const nextMap = { ...prev[dev] };
        delete nextMap[buttonId];
        controllerRef.current?.setMeshMapping(nextMap);
        return { ...prev, [dev]: nextMap };
      });
      showToast(`نقطه ثبت‌شده ${buttonId} حذف شد.`, 'neutral');
    },
    [showToast],
  );

  const handleUpdateGlbTransform = useCallback((next: GlbTransform) => {
    const dev = activeDeviceRef.current;
    setGlbTransforms((prev) => ({ ...prev, [dev]: next }));
    controllerRef.current?.setGlbTransform(next);
  }, []);

  const handleResetGlbTransform = useCallback(() => {
    const dev = activeDeviceRef.current;
    const auto = controllerRef.current?.getAutoGlbTransform(dev);
    if (auto) {
      setGlbTransforms((prev) => ({ ...prev, [dev]: auto }));
      controllerRef.current?.setGlbTransform(auto);
      showToast('جایگذاری مدل به حالت خودکار بازگشت.', 'neutral');
    }
  }, [showToast]);

  const handleResetMappings = useCallback(() => {
    const dev = activeDeviceRef.current;
    setMappings((prev) => {
      controllerRef.current?.setMeshMapping({});
      return { ...prev, [dev]: {} };
    });
    setAnchors((prev) => {
      controllerRef.current?.setSurfaceAnchors({});
      return { ...prev, [dev]: {} };
    });
    setSelectedMesh(null);
    controllerRef.current?.setSelectedMeshName(null);
    showToast('تمام نقاط و اتصال‌های ثبت‌شده این دستگاه پاک شد.', 'neutral');
  }, [showToast]);

  const handleExportMapping = useCallback(() => {
    const dev = activeDeviceRef.current;
    const json = serializeMappingExport(
      dev,
      mappingsRef.current[dev],
      anchorsRef.current[dev],
      glbTransformsRef.current[dev],
    );
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping-${dev}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`فایل mapping-${dev}.json با نقاط دقیق ذخیره شد.`, 'success');
  }, [showToast]);

  const handleImportMapping = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = parseMappingImport(text);
      if (!parsed.ok) {
        showToast(parsed.error, 'error');
        return;
      }
      const targetDev = parsed.device ?? activeDeviceRef.current;
      setMappings((prev) => {
        const next = { ...prev, [targetDev]: parsed.mappings };
        if (targetDev === activeDeviceRef.current) {
          controllerRef.current?.setMeshMapping(parsed.mappings);
        }
        return next;
      });
      if (parsed.anchors) {
        const importedAnchors = parsed.anchors;
        setAnchors((prev) => {
          const next = { ...prev, [targetDev]: importedAnchors };
          if (targetDev === activeDeviceRef.current) {
            controllerRef.current?.setSurfaceAnchors(importedAnchors);
          }
          return next;
        });
      }
      if (parsed.glbTransform) {
        const importedTransform = parsed.glbTransform;
        setGlbTransforms((prev) => ({ ...prev, [targetDev]: importedTransform }));
        if (targetDev === activeDeviceRef.current) {
          controllerRef.current?.setGlbTransform(importedTransform);
        }
      }
      showToast('نقاط دقیق و تنظیمات مدل از فایل JSON اعمال شد.', 'success');
    },
    [showToast],
  );

  const handleUploadGlb = useCallback(
    (file: File, slot: PcGlbSlot = 'combined') => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
        showToast('لطفاً فایل با فرمت .glb یا .gltf انتخاب کنید.', 'error');
        return;
      }
      const targetDevice = activeDeviceRef.current;
      const savedT = glbTransformsRef.current[targetDevice];
      const hasExistingCalibration =
        savedT &&
        (Math.abs(savedT.rotX) > 1e-4 ||
          Math.abs(savedT.rotY) > 1e-4 ||
          Math.abs(savedT.rotZ) > 1e-4 ||
          Math.abs(savedT.scale - 1) > 1e-4 ||
          Math.abs(savedT.offsetY) > 1e-4);
      const hasExistingMappings =
        Object.keys(mappingsRef.current[targetDevice] ?? {}).length > 0 ||
        Object.keys(anchorsRef.current[targetDevice] ?? {}).length > 0;

      controllerRef.current
        ?.loadGlbFile(
          file,
          slot,
          hasExistingCalibration && hasExistingMappings ? savedT : undefined,
        )
        .then((buffer) => {
          // Persist binary GLB permanently in IndexedDB so device always launches with this model
          void savePersistedGlb(targetDevice, file.name, buffer, slot);
        })
        .catch(() => {
          // Error toast already triggered by controller callback
        });
    },
    [showToast],
  );

  const handleRestoreDefaultModel = useCallback(() => {
    const dev = activeDeviceRef.current;
    controllerRef.current?.restoreDefaultModel();
    void deletePersistedGlbForDevice(dev);
    setCustomModels((prev) => {
      const copy = { ...prev };
      delete copy[dev];
      return copy;
    });
    showToast('مدل استودیویی پیش‌فرض بازیابی شد و مدل ذخیره‌شده حذف گردید.', 'neutral');
  }, [showToast]);

  // Register global backend-integration API: window.AstroTrainerAPI.loadSequence(deviceType, jsonData)
  useEffect(() => {
    window.AstroTrainerAPI = {
      loadSequence: (deviceType: LegacyDeviceAlias, jsonData: TrainingSequence) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (!normalizedDevice) {
          return false;
        }
        const validated = validateAndNormalizeSequence(jsonData);
        if (!validated.ok) {
          showToast(validated.error, 'error');
          return false;
        }
        setSequences((prev) => ({
          ...prev,
          [normalizedDevice]: validated.sequence,
        }));
        setActiveDevice(normalizedDevice);
        setSelectedMesh(null);
        controllerRef.current?.setPlaying(false);
        controllerRef.current?.setDevice(
          normalizedDevice,
          validated.sequence,
          mappingsRef.current[normalizedDevice],
          anchorsRef.current[normalizedDevice],
          glbTransformsRef.current[normalizedDevice],
        );
        showToast(`سناریوی «${validated.sequence.title}» بارگذاری شد.`, 'success');
        return true;
      },
      setDevice: (deviceType: LegacyDeviceAlias) => {
        const normalizedDevice = normalizeDeviceType(deviceType);
        if (normalizedDevice) {
          handleSelectDevice(normalizedDevice);
        }
      },
      play: () => controllerRef.current?.setPlaying(true),
      pause: () => controllerRef.current?.setPlaying(false),
      seek: (ms: number) => controllerRef.current?.seek(ms),
      getState: () => ({
        device: activeDeviceRef.current,
        currentTimeMs: currentTimeRef.current,
        isPlaying: isPlayingRef.current,
        sequence: sequencesRef.current[activeDeviceRef.current],
      }),
    };

    return () => {
      delete window.AstroTrainerAPI;
    };
  }, [handleSelectDevice, showToast]);

  // Global keyboard shortcuts (Space: Play/Pause, H: Collapse/Expand HUD, Escape: Exit Mapping)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'h' || e.key === 'H') {
        setIsHudCollapsed((v) => !v);
      } else if (e.key === 'Escape') {
        setSelectedMesh(null);
        controllerRef.current?.setSelectedMeshName(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  // Drag & Drop .glb / .gltf anywhere onto the 3D studio stage
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDraggingGlb) setIsDraggingGlb(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingGlb(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingGlb(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadGlb(file);
    }
  };

  const currentSequence = sequences[activeDevice];
  const currentMapping = mappings[activeDevice];
  const currentAnchors = anchors[activeDevice];
  const currentGlbTransform = glbTransforms[activeDevice];
  const currentPinnedCount = new Set([
    ...Object.keys(currentMapping),
    ...Object.keys(currentAnchors),
  ]).size;
  const activePlatformMeta =
    DEVICE_PLATFORMS.find((p) => p.id === activeDevice) ?? DEVICE_PLATFORMS[0];

  return (
    <main
      data-device={activeDevice}
      data-playing={isPlaying ? 'true' : 'false'}
      data-mapping-mode={isMappingMode ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full h-full overflow-hidden bg-[#c8cfd9]"
    >
      {/* Dedicated isolated WebGL canvas container (never re-rendered by HUD updates) */}
      <div
        ref={canvasMountRef}
        data-testid="studio-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      {/* Top Glassmorphic Device Switcher */}
      <DeviceSwitcher
        activeDevice={activeDevice}
        onSelect={handleSelectDevice}
      />

      {/* Floating Glassmorphic Callout Badge (visible only during active button press) */}
      <CalloutBadge
        activeEvents={activeEvents}
        hidden={isMappingMode}
      />

      {/* Visual Calibration & Exact 3D Surface Pinning Popover */}
      <MeshBinderPopover
        device={activeDevice}
        isMappingMode={isMappingMode}
        hasCustomModel={Boolean(customModels[activeDevice])}
        glbTransform={currentGlbTransform}
        hoveredMeshName={hoveredMeshName}
        selectedMesh={selectedMesh}
        mapping={currentMapping}
        anchors={currentAnchors}
        onAssign={handleAssignButtonPoint}
        onUnassignButton={handleUnassignButton}
        onClosePopover={() => {
          setSelectedMesh(null);
          controllerRef.current?.setSelectedMeshName(null);
        }}
        onUpdateGlbTransform={handleUpdateGlbTransform}
        onResetGlbTransform={handleResetGlbTransform}
        onExportJson={handleExportMapping}
        onImportJson={handleImportMapping}
        onResetMappings={handleResetMappings}
        onExitMappingMode={handleToggleMappingMode}
      />

      {/* Bottom Monochrome Glassmorphic Timeline & Tools Dock */}
      <TimelineDock
        activeDevice={activeDevice}
        sequence={currentSequence}
        demoPresets={DEVICE_DEMO_PRESETS[activeDevice] ?? []}
        activePresetId={activePresetIds[activeDevice] ?? null}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        loopEnabled={loopEnabled}
        isMappingMode={isMappingMode}
        isCollapsed={isHudCollapsed}
        customModel={customModels[activeDevice] ?? null}
        mappedCount={currentPinnedCount}
        onSelectPreset={handleSelectPreset}
        onTogglePlay={handleTogglePlay}
        onToggleLoop={handleToggleLoop}
        onSeek={handleSeek}
        onToggleMappingMode={handleToggleMappingMode}
        onToggleCollapse={() => setIsHudCollapsed((v) => !v)}
        onUploadGlb={handleUploadGlb}
        onRestoreDefaultModel={handleRestoreDefaultModel}
        onExportMapping={handleExportMapping}
        onResetCamera={() => controllerRef.current?.resetCamera()}
      />

      {/* Drag & Drop GLB Visual Overlay */}
      {isDraggingGlb && (
        <div className="fixed inset-0 z-40 bg-[#0a0d14]/80 flex items-center justify-center p-6 pointer-events-none">
          <div className="vision-glass rounded-3xl px-10 py-8 flex flex-col items-center gap-3 text-center border-dashed border-2 border-sky-400/60">
            <Upload className="w-9 h-9 text-sky-300" aria-hidden="true" />
            <div className="text-base font-semibold text-white">
              فایل سه‌بعدی .GLB یا .GLTF را اینجا رها کنید
            </div>
            <p className="text-xs text-slate-300">
              مدل برای پلتفرم{' '}
              <span dir="ltr" className="font-semibold text-white">
                {activePlatformMeta.brandName}
              </span>{' '}
              روی سکوی استودیویی جایگزین خواهد شد
            </p>
          </div>
        </div>
      )}

      {/* Subtle Transient Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${
            isHudCollapsed ? 'bottom-16' : 'bottom-[244px] sm:bottom-[178px]'
          } left-1/2 -translate-x-1/2 z-30 max-w-[92vw] text-center vision-glass rounded-full px-4 py-2 text-xs font-medium pointer-events-none ${
            toast.tone === 'error'
              ? 'text-rose-200 border-rose-400/40'
              : toast.tone === 'success'
                ? 'text-emerald-200 border-emerald-400/35'
                : 'text-slate-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
