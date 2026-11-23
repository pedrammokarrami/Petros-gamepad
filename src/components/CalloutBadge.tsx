import type { SequenceEvent } from '../types/trainer';

interface CalloutBadgeProps {
  activeEvents: SequenceEvent[];
  hidden?: boolean;
}

export function CalloutBadge({ activeEvents, hidden = false }: CalloutBadgeProps) {
  const isVisible = !hidden && activeEvents.length > 0;
  const primary = activeEvents[0];
  const secondaryCount = activeEvents.length - 1;

  return (
    <div
      aria-live="polite"
      data-testid="callout-badge"
      data-active={isVisible ? 'true' : 'false'}
      className={`absolute top-[72px] sm:top-[82px] inset-x-0 z-20 flex justify-center px-4 pointer-events-none transition-all duration-200 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-2 scale-95'
      }`}
    >
      {primary && (
        <div className="vision-glass rounded-full px-5 py-2.5 max-w-[min(780px,94vw)] flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: primary.color,
              boxShadow: `0 0 12px ${primary.color}`,
            }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2.5">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs sm:text-sm font-semibold text-white whitespace-nowrap">
                {primary.label}
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-300/80 shrink-0">
                {primary.target_mesh}
              </span>
              {secondaryCount > 0 && (
                <span className="text-[11px] text-slate-300 shrink-0">
                  +{secondaryCount} simultaneous
                </span>
              )}
            </div>
            {primary.description && (
              <>
                <span className="hidden sm:inline text-slate-500 shrink-0" aria-hidden="true">
                  ·
                </span>
                <p className="text-[11px] sm:text-xs text-slate-300/90 truncate sm:max-w-[440px]">
                  {primary.description}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
