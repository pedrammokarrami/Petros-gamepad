import type {
  PracticeFeedbackEntry,
  PracticeJudgement,
  SequenceEvent,
  TrainerMode,
} from '../types/trainer';

interface CalloutBadgeProps {
  activeEvents: SequenceEvent[];
  mode: TrainerMode;
  practiceFeedback: PracticeFeedbackEntry | null;
  hidden?: boolean;
}

function getJudgementStyle(judgement: PracticeJudgement): {
  dotColor: string;
  badgeClass: string;
  label: string;
} {
  switch (judgement) {
    case 'perfect':
      return {
        dotColor: '#34d399',
        badgeClass: 'border-emerald-400/50 text-emerald-200',
        label: 'PERFECT',
      };
    case 'good':
      return {
        dotColor: '#38bdf8',
        badgeClass: 'border-sky-400/50 text-sky-200',
        label: 'GOOD',
      };
    case 'early':
      return {
        dotColor: '#fbbf24',
        badgeClass: 'border-amber-400/50 text-amber-200',
        label: 'TOO EARLY',
      };
    case 'late':
      return {
        dotColor: '#fb923c',
        badgeClass: 'border-orange-400/50 text-orange-200',
        label: 'TOO LATE',
      };
    case 'wrong':
      return {
        dotColor: '#f43f5e',
        badgeClass: 'border-rose-400/60 text-rose-200',
        label: 'WRONG BUTTON',
      };
    case 'missed':
      return {
        dotColor: '#f43f5e',
        badgeClass: 'border-rose-400/60 text-rose-200',
        label: 'MISSED',
      };
  }
}

export function CalloutBadge({
  activeEvents,
  mode,
  practiceFeedback,
  hidden = false,
}: CalloutBadgeProps) {
  const showPracticeFeedback = mode === 'practice' && practiceFeedback !== null;
  const primary = activeEvents[0];
  const secondaryCount = activeEvents.length - 1;
  const isVisible = !hidden && (showPracticeFeedback || activeEvents.length > 0);

  const feedbackStyle = practiceFeedback
    ? getJudgementStyle(practiceFeedback.judgement)
    : null;

  return (
    <div
      aria-live="polite"
      data-testid="callout-badge"
      data-active={isVisible ? 'true' : 'false'}
      data-judgement={showPracticeFeedback ? practiceFeedback?.judgement : ''}
      className={`absolute top-[72px] sm:top-[82px] inset-x-0 z-20 flex justify-center px-4 pointer-events-none transition-all duration-200 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-2 scale-95'
      }`}
    >
      {showPracticeFeedback && practiceFeedback && feedbackStyle ? (
        <div
          className={`vision-glass rounded-full px-5 py-2.5 max-w-[min(780px,94vw)] flex items-center gap-3 border ${feedbackStyle.badgeClass}`}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: feedbackStyle.dotColor,
              boxShadow: `0 0 12px ${feedbackStyle.dotColor}`,
            }}
            aria-hidden="true"
          />
          <span className="text-xs sm:text-sm font-semibold text-white whitespace-nowrap">
            {practiceFeedback.message}
          </span>
          {practiceFeedback.expectedLabel &&
            practiceFeedback.judgement !== 'missed' && (
              <>
                <span className="hidden sm:inline text-slate-500 shrink-0" aria-hidden="true">
                  ·
                </span>
                <span className="hidden sm:inline text-xs text-slate-300 truncate max-w-[300px]">
                  {practiceFeedback.expectedLabel}
                </span>
              </>
            )}
        </div>
      ) : (
        primary && (
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
        )
      )}
    </div>
  );
}
