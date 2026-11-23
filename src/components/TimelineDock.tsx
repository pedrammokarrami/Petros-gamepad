import React, { useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { formatMilliseconds } from '../core/sequenceEngine';
import type {
  CustomModelInfo,
  DemoPreset,
  DeviceType,
  PcGlbSlot,
  TrainingSequence,
} from '../types/trainer';

interface TimelineDockProps {
  activeDevice: DeviceType;
  sequence: TrainingSequence;
  demoPresets: DemoPreset[];
  activePresetId: string | null;
  currentTimeMs: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  isMappingMode: boolean;
  isCollapsed: boolean;
  customModel: CustomModelInfo | null;
  mappedCount: number;
  onSelectPreset: (preset: DemoPreset) => void;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onSeek: (ms: number) => void;
  onToggleMappingMode: () => void;
  onToggleCollapse: () => void;
  onUploadGlb: (file: File, slot?: PcGlbSlot) => void;
  onRestoreDefaultModel: () => void;
  onExportMapping: () => void;
  onResetCamera: () => void;
}

export function TimelineDock({
  activeDevice,
  sequence,
  demoPresets,
  activePresetId,
  currentTimeMs,
  isPlaying,
  loopEnabled,
  isMappingMode,
  isCollapsed,
  customModel,
  mappedCount,
  onSelectPreset,
  onTogglePlay,
  onToggleLoop,
  onSeek,
  onToggleMappingMode,
  onToggleCollapse,
  onUploadGlb,
  onRestoreDefaultModel,
  onExportMapping,
  onResetCamera,
}: TimelineDockProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const duration = Math.max(1, sequence.duration_ms);
  const progressPct = Math.min(100, Math.max(0, (currentTimeMs / duration) * 100));

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.round(ratio * duration));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const step = Math.round(duration * 0.03);
    const delta = e.deltaY > 0 ? step : -step;
    onSeek(Math.max(0, Math.min(duration, currentTimeMs + delta)));
  };

  // Build clean ruler ticks (every 500ms or 10 subdivisions)
  const tickCount = 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => ({
    pct: (i / tickCount) * 100,
    ms: Math.round((i / tickCount) * duration),
    major: i % 2 === 0,
  }));

  return (
    <section
      aria-label="کنترل تایملاین و ابزارهای مدل"
      className={`fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(940px,95vw)] transition-transform duration-300 ease-out ${
        isCollapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Zen Mode Tab */}
      <div className="flex justify-center mb-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'نمایش کنترل‌های تایملاین' : 'پنهان کردن کنترل‌های تایملاین'}
          className="vision-glass-subtle inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>نمایش تایملاین</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>نمای تمام‌صفحه</span>
            </>
          )}
        </button>
      </div>

      {/* Main VisionOS Monochrome Glass Timeline Panel */}
      <div className="vision-glass rounded-3xl px-4 sm:px-5 py-3.5 space-y-3">
        {/* Top Row: Sequence Title & Compact Hardware Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold text-white truncate">
              {sequence.title}
            </h1>
            {customModel && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <span>· {customModel.fileName}</span>
                <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-400/25 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                  ذخیره دائم
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto studio-scroll">
            {activeDevice === 'pc' ? (
              <>
                <label
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.13] text-[11px] sm:text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="بارگذاری فایل GLB برای کیبورد"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                  <span>GLB کیبورد</span>
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadGlb(file, 'keyboard');
                      e.target.value = '';
                    }}
                  />
                </label>
                <label
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.13] text-[11px] sm:text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="بارگذاری فایل GLB برای ماوس"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                  <span>GLB ماوس</span>
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadGlb(file, 'mouse');
                      e.target.value = '';
                    }}
                  />
                </label>
              </>
            ) : (
              <label
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.13] text-[11px] sm:text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="بارگذاری فایل سه‌بعدی GLB یا GLTF"
              >
                <Upload className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                <span>آپلود GLB</span>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadGlb(file, 'combined');
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            {customModel && (
              <button
                type="button"
                onClick={onRestoreDefaultModel}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] text-[11px] sm:text-xs text-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>مدل پیش‌فرض</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMappingMode}
              aria-pressed={isMappingMode}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isMappingMode
                  ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                  : 'bg-white/[0.06] hover:bg-white/[0.13] text-slate-200 border border-transparent'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تنظیم نقاط</span>
              {mappedCount > 0 && (
                <span className="font-mono-tabular text-[10px] text-emerald-300">
                  ({mappedCount})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onExportMapping}
              aria-label="خروجی فایل mapping.json"
              title="دانلود فایل mapping.json"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span dir="ltr" className="font-mono-tabular text-[11px]">
                mapping.json
              </span>
            </button>

            <button
              type="button"
              onClick={onResetCamera}
              aria-label="بازنشانی زاویه دوربین"
              title="بازنشانی زاویه دوربین"
              className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Curated Showcase Demo Presets Strip (e.g. 3 PS5 DualSense choreographed demos) */}
        {demoPresets.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll pb-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap shrink-0 ml-1">
              <Sparkles className="w-3 h-3 text-sky-300" aria-hidden="true" />
              <span className="hidden sm:inline">دموهای انیمیشن:</span>
            </span>
            {demoPresets.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  aria-pressed={isSelected}
                  className={`px-2 sm:px-2.5 py-1 rounded-xl text-[10.5px] sm:text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-sky-500/20 text-white border-sky-400/45 shadow-sm'
                      : 'bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white border-white/[0.06]'
                  }`}
                >
                  {preset.shortLabelFa}
                </button>
              );
            })}
          </div>
        )}

        {/* Bottom Row: Transport Controls + Precision Millisecond Readout + Scrubber Track */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 shrink-0">
            {/* Play / Pause & Loop */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'توقف پخش' : 'شروع پخش'}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white text-slate-950 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center shadow-lg cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4 fill-current translate-x-[1px]" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={onToggleLoop}
                aria-pressed={loopEnabled}
                aria-label="تکرار خودکار تایملاین"
                title="تکرار خودکار"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  loopEnabled
                    ? 'bg-white/[0.14] text-white'
                    : 'bg-white/[0.04] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* Precise Millisecond Counter (LTR isolated) */}
            <div
              dir="ltr"
              data-testid="time-readout"
              className="font-mono-tabular text-[11px] sm:text-xs text-slate-300 whitespace-nowrap shrink-0 min-w-[106px] sm:min-w-[118px] text-center bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1.5"
            >
              <span className="text-white font-semibold">
                {formatMilliseconds(currentTimeMs)}
              </span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-400">
                {formatMilliseconds(duration)} ms
              </span>
            </div>
          </div>

          {/* Precision Ruler & Event Blocks Scrubber (LTR timeline progression) */}
          <div
            ref={trackRef}
            dir="ltr"
            role="slider"
            tabIndex={0}
            aria-label="نوار زمان‌بندی تعاملی دکمه‌ها"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Math.round(currentTimeMs)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTimeMs + 100));
              if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTimeMs - 100));
            }}
            className="relative w-full sm:flex-1 h-11 sm:h-12 rounded-2xl bg-black/35 border border-white/[0.09] px-2 cursor-ew-resize select-none overflow-hidden focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {/* Fine Ruler Ticks */}
            <div className="absolute inset-x-2 top-1 h-3 pointer-events-none">
              {ticks.map((t, idx) => (
                <div
                  key={idx}
                  style={{ left: `${t.pct}%` }}
                  className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                >
                  <div
                    className={`w-px ${
                      t.major ? 'h-2 bg-white/30' : 'h-1 bg-white/15'
                    }`}
                  />
                  {t.major && idx > 0 && idx < ticks.length - 1 && (
                    <span className="font-mono-tabular text-[8px] text-slate-500 leading-none mt-0.5 hidden sm:block">
                      {t.ms}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Event Timing Blocks */}
            <div className="absolute inset-x-2 bottom-1.5 h-5">
              {sequence.events.map((evt) => {
                const leftPct = (evt.start_ms / duration) * 100;
                const widthPct = Math.max(
                  2.5,
                  ((evt.end_ms - evt.start_ms) / duration) * 100,
                );
                const isActive =
                  currentTimeMs >= evt.start_ms && currentTimeMs <= evt.end_ms;

                return (
                  <div
                    key={evt.id}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: isActive
                        ? `${evt.color}55`
                        : `${evt.color}26`,
                      borderColor: isActive ? evt.color : `${evt.color}88`,
                    }}
                    title={`${evt.label} (${evt.start_ms}–${evt.end_ms} ms)`}
                    className="absolute top-0 h-full rounded-md border flex items-center justify-center px-1.5 overflow-hidden transition-colors duration-100"
                  >
                    <span className="font-mono-tabular text-[9px] font-medium text-white/95 truncate">
                      {evt.target_mesh.replace(/^(BTN_|KEY_|TOUCH_)/, '')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Playhead Needle */}
            <div
              style={{ left: `calc(8px + (100% - 16px) * ${progressPct / 100})` }}
              className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)] pointer-events-none -translate-x-1/2"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white shadow-md -translate-x-[4px] -translate-y-0.5" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
