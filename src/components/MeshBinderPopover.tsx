import {
  Check,
  Download,
  FlipHorizontal2,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { DEVICE_BUTTONS } from '../data/devices';
import { normalizeAngle } from '../core/glbPlacement';
import type {
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceType,
  GlbTransform,
  SelectedMeshInfo,
} from '../types/trainer';

interface MeshBinderPopoverProps {
  device: DeviceType;
  isMappingMode: boolean;
  hasCustomModel: boolean;
  glbTransform: GlbTransform;
  hoveredMeshName: string | null;
  selectedMesh: SelectedMeshInfo | null;
  mapping: DeviceMeshMapping;
  anchors: DeviceAnchorMap;
  onAssign: (buttonId: string, hit: SelectedMeshInfo) => void;
  onUnassignButton: (buttonId: string) => void;
  onClosePopover: () => void;
  onUpdateGlbTransform: (next: GlbTransform) => void;
  onResetGlbTransform: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onResetMappings: () => void;
  onExitMappingMode: () => void;
}

export function MeshBinderPopover({
  device,
  isMappingMode,
  hasCustomModel,
  glbTransform,
  hoveredMeshName,
  selectedMesh,
  mapping,
  anchors,
  onAssign,
  onUnassignButton,
  onClosePopover,
  onUpdateGlbTransform,
  onResetGlbTransform,
  onExportJson,
  onImportJson,
  onResetMappings,
  onExitMappingMode,
}: MeshBinderPopoverProps) {
  if (!isMappingMode) return null;

  const buttons = DEVICE_BUTTONS[device];
  const mappedIds = new Set([...Object.keys(mapping), ...Object.keys(anchors)]);
  const mappedCount = mappedIds.size;

  // Clamp popover within viewport bounds so it never clips off screen on mobile or desktop
  const popoverWidth =
    typeof window !== 'undefined' ? Math.min(286, window.innerWidth - 24) : 286;
  const popoverHeight = 330;
  const clampedLeft = selectedMesh
    ? Math.max(
        12,
        Math.min(
          typeof window !== 'undefined' ? window.innerWidth - popoverWidth - 12 : 200,
          selectedMesh.screenX - popoverWidth / 2,
        ),
      )
    : 12;
  const clampedTop = selectedMesh
    ? Math.max(
        hasCustomModel ? 170 : 128,
        Math.min(
          typeof window !== 'undefined' ? window.innerHeight - popoverHeight - 135 : 200,
          selectedMesh.screenY + 16,
        ),
      )
    : 140;

  return (
    <>
      {/* Sleek Calibration & Exact Surface Pinning Bar */}
      <div
        data-testid="mapping-mode-bar"
        className="fixed top-[66px] sm:top-[74px] inset-x-0 z-20 flex justify-center px-2 sm:px-3 pointer-events-none"
      >
        <div className="vision-glass pointer-events-auto rounded-2xl px-3 sm:px-4 py-2 flex flex-col gap-2 text-xs max-w-[min(900px,96vw)]">
          {/* Row 1: Exact Point Calibration Instructions & Save/Exit */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-200 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="font-semibold text-sky-300 shrink-0">
                تنظیم دقیق نقاط و مدل
              </span>
              <span className="hidden md:inline text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="hidden md:inline text-slate-300 truncate">
                {hoveredMeshName ? (
                  <>
                    سطح زیر نشانگر:{' '}
                    <strong dir="ltr" className="font-mono-tabular text-white">
                      {hoveredMeshName}
                    </strong>
                  </>
                ) : (
                  'مستقیماً روی هر نقطه از مدل کلیک کنید تا دقیقاً همان محل برای کلیک ثبت شود'
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-emerald-300/90 font-mono-tabular px-1.5">
                {mappedCount} نقطه
              </span>

              <button
                type="button"
                onClick={onExportJson}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                aria-label="دانلود فایل mapping.json"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خروجی JSON</span>
              </button>

              <label className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.13] text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer">
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>ورود JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImportJson(file);
                    e.target.value = '';
                  }}
                />
              </label>

              {mappedCount > 0 && (
                <button
                  type="button"
                  onClick={onResetMappings}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  aria-label="پاک کردن نقاط ثبت‌شده این دستگاه"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>پاکسازی</span>
                </button>
              )}

              <button
                type="button"
                onClick={onExitMappingMode}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-100 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                aria-label="تأیید و خروج از حالت تنظیم"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تأیید</span>
              </button>
            </div>
          </div>

          {/* Row 2: Precision GLB Orientation & Scale Placement Controls (visible when custom GLB is loaded) */}
          {hasCustomModel && (
            <div
              data-testid="glb-calibration-controls"
              className="flex flex-wrap items-center justify-center sm:justify-between gap-1.5 pt-2 border-t border-white/10"
            >
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                جایگذاری مدل GLB:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateGlbTransform({
                      ...glbTransform,
                      rotY: normalizeAngle(glbTransform.rotY + Math.PI),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-slate-100 text-[11px] transition-colors cursor-pointer"
                  title="برگرداندن پشت و روی مدل (۱۸۰ درجه)"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                  <span>پشت/رو ۱۸۰°</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateGlbTransform({
                      ...glbTransform,
                      rotZ: normalizeAngle(glbTransform.rotZ + Math.PI / 2),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-slate-100 text-[11px] transition-colors cursor-pointer"
                  title="چرخش افقی و عمودی (۹۰ درجه)"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                  <span>افقی/عمودی ۹۰°</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateGlbTransform({
                      ...glbTransform,
                      rotX: normalizeAngle(glbTransform.rotX + Math.PI / 8),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-slate-100 text-[11px] transition-colors cursor-pointer"
                  title="تغییر زاویه شیب مدل به سمت دوربین"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
                  <span>زاویه شیب</span>
                </button>

                <div className="inline-flex items-center rounded-lg bg-white/[0.07] overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateGlbTransform({
                        ...glbTransform,
                        scale: Math.max(0.45, Math.round((glbTransform.scale - 0.1) * 100) / 100),
                      })
                    }
                    className="px-2 py-1 hover:bg-white/[0.14] text-slate-200 transition-colors cursor-pointer"
                    aria-label="کوچک‌تر کردن مدل"
                    title="کوچک‌تر کردن مدل"
                  >
                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <span
                    dir="ltr"
                    className="font-mono-tabular text-[10px] text-slate-300 px-1.5"
                  >
                    {Math.round(glbTransform.scale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateGlbTransform({
                        ...glbTransform,
                        scale: Math.min(2.2, Math.round((glbTransform.scale + 0.1) * 100) / 100),
                      })
                    }
                    className="px-2 py-1 hover:bg-white/[0.14] text-slate-200 transition-colors cursor-pointer"
                    aria-label="بزرگ‌تر کردن مدل"
                    title="بزرگ‌تر کردن مدل"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onResetGlbTransform}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.13] text-slate-300 text-[11px] transition-colors cursor-pointer"
                  title="بازنشانی جایگذاری خودکار"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>خودکار</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Exact 3D Surface Point-to-Button Assignment Popover */}
      {selectedMesh && (
        <div
          role="dialog"
          aria-label="ثبت نقطه دقیق روی مدل"
          style={{
            left: `${clampedLeft}px`,
            top: `${clampedTop}px`,
            width: `${popoverWidth}px`,
          }}
          className="fixed z-30 vision-glass rounded-2xl p-3 text-right shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>نقطه دقیق انتخاب‌شده روی مدل</span>
              </div>
              <div
                dir="ltr"
                className="font-mono-tabular text-[11px] text-slate-300 truncate mt-0.5 text-right"
              >
                {selectedMesh.meshName} · ({selectedMesh.localPoint[0].toFixed(2)},{' '}
                {selectedMesh.localPoint[1].toFixed(2)}, {selectedMesh.localPoint[2].toFixed(2)})
              </div>
            </div>
            <button
              type="button"
              onClick={onClosePopover}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="بستن پنجره انتخاب دکمه"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="text-[11px] text-slate-400 mb-2">
            این نقطه دقیق برای کدام دکمه یا لمس ثبت شود؟
          </div>

          <div className="max-h-[210px] overflow-y-auto studio-scroll space-y-1 pl-1">
            {buttons.map((btn) => {
              const hasAnchor = Boolean(anchors[btn.id]);
              const isAssignedMesh = mapping[btn.id] === selectedMesh.meshName;

              return (
                <div key={btn.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onAssign(btn.id, selectedMesh);
                      onClosePopover();
                    }}
                    className={`flex-1 flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      hasAnchor || isAssignedMesh
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                        : 'hover:bg-white/[0.08] text-slate-200 border border-transparent'
                    }`}
                  >
                    <span className="truncate font-medium">{btn.labelFa}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span
                        dir="ltr"
                        className="font-mono-tabular text-[10px] text-slate-400"
                      >
                        {btn.id}
                      </span>
                      {hasAnchor && (
                        <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                  {hasAnchor && (
                    <button
                      type="button"
                      onClick={() => onUnassignButton(btn.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer shrink-0"
                      title={`حذف نقطه ${btn.id}`}
                      aria-label={`حذف نقطه ${btn.id}`}
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
