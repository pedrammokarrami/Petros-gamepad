import React, { useRef } from 'react';
import {
  Bluetooth,
  Check,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { formatMilliseconds } from '../core/sequenceEngine';
import type {
  ConnectedControllerInfo,
  DemoPreset,
  PracticeSessionStats,
  TrainerMode,
  TrainingSequence,
} from '../types/trainer';

interface TimelineDockProps {
  sequence: TrainingSequence;
  demoPresets: DemoPreset[];
  activePresetId: string | null;
  currentTimeMs: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  isCollapsed: boolean;
  isLoadingSequence?: boolean;
  mode: TrainerMode;
  controller: ConnectedControllerInfo | null;
  practiceStats: PracticeSessionStats;
  onSelectMode: (mode: TrainerMode) => void;
  onOpenBluetooth: () => void;
  onResetPractice: () => void;
  onSelectPreset: (preset: DemoPreset) => void;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onSeek: (ms: number) => void;
  onToggleCollapse: () => void;
  onResetCamera: () => void;
}

export function TimelineDock({
  sequence,
  demoPresets,
  activePresetId,
  currentTimeMs,
  isPlaying,
  loopEnabled,
  isCollapsed,
  isLoadingSequence = false,
  mode,
  controller,
  practiceStats,
  onSelectMode,
  onOpenBluetooth,
  onResetPractice,
  onSelectPreset,
  onTogglePlay,
  onToggleLoop,
  onSeek,
  onToggleCollapse,
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

  const tickCount = 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => ({
    pct: (i / tickCount) * 100,
    ms: Math.round((i / tickCount) * duration),
    major: i % 2 === 0,
  }));

  const totalErrors =
    practiceStats.wrongButtonCount +
    practiceStats.missedCount +
    practiceStats.timingErrorCount;
  const totalHits = practiceStats.perfectCount + practiceStats.goodCount;

  return (
    <section
      aria-label="Playback timeline controls"
      className={`absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(940px,95%)] transition-transform duration-300 ease-out ${
        isCollapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Fullscreen Stage Tab */}
      <div className="flex justify-center mb-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Show timeline controls' : 'Hide timeline controls'}
          className="vision-glass-subtle inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Show Timeline</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Fullscreen Stage</span>
            </>
          )}
        </button>
      </div>

      {/* Main VisionOS Dark Glass Timeline Panel */}
      <div className="vision-glass rounded-3xl px-4 sm:px-5 py-3.5 space-y-2.5">
        {/* Top Row: Sequence Title + Mode Switch + Bluetooth + Reset View */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-semibold text-white truncate">
              {sequence.title}
            </h1>
            {isLoadingSequence && (
              <Loader2
                className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0"
                aria-label="Loading sequence"
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Watch vs Live Hardware Test Mode Switcher */}
            <div
              role="group"
              aria-label="Trainer mode"
              className="inline-flex items-center p-0.5 rounded-xl bg-white/[0.05] border border-white/[0.08]"
            >
              <button
                type="button"
                onClick={() => onSelectMode('demo')}
                aria-pressed={mode === 'demo'}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  mode === 'demo'
                    ? 'bg-white/[0.16] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Watch
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('practice')}
                aria-pressed={mode === 'practice'}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  mode === 'practice'
                    ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/35'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Gamepad2 className="w-3 h-3" aria-hidden="true" />
                <span>Live Test</span>
              </button>
            </div>

            {/* Bluetooth Controller Connect / Live Status Button */}
            <button
              type="button"
              onClick={onOpenBluetooth}
              data-testid="bluetooth-connect-btn"
              aria-label={
                controller
                  ? `Bluetooth connected: ${controller.name}`
                  : 'Connect Bluetooth controller'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors shrink-0 cursor-pointer border ${
                controller
                  ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200 hover:bg-emerald-500/25'
                  : 'bg-sky-500/15 border-sky-400/30 text-sky-200 hover:bg-sky-500/25'
              }`}
            >
              <Bluetooth className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline max-w-[120px] truncate">
                {controller ? controller.name : 'Bluetooth'}
              </span>
              {controller && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>

            <button
              type="button"
              onClick={onResetCamera}
              aria-label="Reset camera view"
              title="Reset camera view"
              className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live Hardware Test Scorecard Strip (shown only in Live Test mode) */}
        {mode === 'practice' ? (
          <div
            data-testid="practice-scorecard"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-black/25 border border-white/[0.07] px-3 py-1.5 text-[11px]"
          >
            <div className="flex flex-wrap items-center gap-3 font-mono-tabular">
              <span className="text-slate-300">
                Accuracy{' '}
                <strong
                  className={
                    practiceStats.accuracyPct >= 80
                      ? 'text-emerald-300'
                      : practiceStats.accuracyPct >= 50
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }
                >
                  {practiceStats.accuracyPct}%
                </strong>
              </span>
              <span className="text-emerald-300">
                Hits <strong>{totalHits}/{practiceStats.totalEvents}</strong>
              </span>
              <span className={totalErrors > 0 ? 'text-rose-300' : 'text-slate-400'}>
                Errors <strong>{totalErrors}</strong>
                {totalErrors > 0 && (
                  <span className="hidden sm:inline text-[10px] text-rose-300/80 ml-1">
                    ({practiceStats.wrongButtonCount} wrong · {practiceStats.missedCount} missed ·{' '}
                    {practiceStats.timingErrorCount} timing)
                  </span>
                )}
              </span>
              {practiceStats.avgDeltaMs !== null && (
                <span className="hidden md:inline text-slate-400">
                  Avg{' '}
                  <strong className="text-slate-200">
                    {practiceStats.avgDeltaMs >= 0
                      ? `+${practiceStats.avgDeltaMs}ms`
                      : `${practiceStats.avgDeltaMs}ms`}
                  </strong>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onResetPractice}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-slate-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        ) : (
          /* Optional Curated Demo Presets Strip (in Watch mode) */
          demoPresets.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll pb-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap shrink-0 mr-1">
                <Sparkles className="w-3 h-3 text-sky-300" aria-hidden="true" />
                <span className="hidden sm:inline">Sequences:</span>
              </span>
              {demoPresets.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset)}
                    aria-pressed={isSelected}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-sky-500/20 text-white border-sky-400/45 shadow-sm'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white border-white/[0.06]'
                    }`}
                  >
                    {preset.shortLabel}
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* Bottom Row: Transport Controls + Precision Millisecond Counter + Interactive Scrubber */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause sequence' : 'Play sequence'}
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
                aria-label="Toggle loop playback"
                title="Loop playback"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  loopEnabled
                    ? 'bg-white/[0.14] text-white'
                    : 'bg-white/[0.04] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div
              data-testid="time-readout"
              className="font-mono-tabular text-[11px] sm:text-xs text-slate-300 whitespace-nowrap shrink-0 min-w-[112px] sm:min-w-[122px] text-center bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1.5"
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

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Interactive button timing timeline"
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

            {/* Event Timing Blocks (with Live Test hit/error color coding) */}
            <div className="absolute inset-x-2 bottom-1.5 h-5">
              {sequence.events.map((evt) => {
                const leftPct = (evt.start_ms / duration) * 100;
                const widthPct = Math.max(
                  2.5,
                  ((evt.end_ms - evt.start_ms) / duration) * 100,
                );
                const isActive =
                  currentTimeMs >= evt.start_ms && currentTimeMs <= evt.end_ms;
                const outcome = mode === 'practice' ? practiceStats.outcomes[evt.id] : undefined;

                let blockColor = evt.color;
                if (outcome?.status === 'perfect' || outcome?.status === 'good') {
                  blockColor = '#34d399';
                } else if (outcome?.status === 'early' || outcome?.status === 'late') {
                  blockColor = '#fbbf24';
                } else if (outcome?.status === 'missed') {
                  blockColor = '#f43f5e';
                }

                return (
                  <div
                    key={evt.id}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor:
                        isActive || (outcome && outcome.status !== 'pending')
                          ? `${blockColor}55`
                          : `${blockColor}26`,
                      borderColor:
                        isActive || (outcome && outcome.status !== 'pending')
                          ? blockColor
                          : `${blockColor}88`,
                    }}
                    title={`${evt.label} (${evt.start_ms}–${evt.end_ms} ms)`}
                    className="absolute top-0 h-full rounded-md border flex items-center justify-center gap-0.5 px-1 overflow-hidden transition-colors duration-100"
                  >
                    {outcome && (outcome.status === 'perfect' || outcome.status === 'good') && (
                      <Check className="w-2.5 h-2.5 text-emerald-200 shrink-0" aria-hidden="true" />
                    )}
                    {outcome && outcome.status === 'missed' && (
                      <X className="w-2.5 h-2.5 text-rose-200 shrink-0" aria-hidden="true" />
                    )}
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
