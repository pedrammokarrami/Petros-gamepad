import { formatShortButtonName } from './gamepadMapper';
import type {
  PracticeEventOutcome,
  PracticeFeedbackEntry,
  PracticeJudgement,
  PracticeSessionStats,
  TrainingSequence,
} from '../types/trainer';

export interface PracticeTimingWindows {
  /** |deltaMs| <= perfectMs => PERFECT */
  perfectMs: number;
  /** |deltaMs| <= goodMs => GOOD */
  goodMs: number;
  /** |deltaMs| <= maxMatchMs => EARLY / LATE timing error (still consumes event) */
  maxMatchMs: number;
}

export const DEFAULT_TIMING_WINDOWS: PracticeTimingWindows = {
  perfectMs: 95,
  goodMs: 210,
  maxMatchMs: 360,
};

export interface PracticeSessionState {
  sequenceTitle: string;
  outcomes: Record<string, PracticeEventOutcome>;
  wrongButtonCount: number;
  streak: number;
  bestStreak: number;
  deltaSamples: number[];
  lastFeedback: PracticeFeedbackEntry | null;
  history: PracticeFeedbackEntry[];
  feedbackCounter: number;
}

export function createPracticeSession(sequence: TrainingSequence): PracticeSessionState {
  const outcomes: Record<string, PracticeEventOutcome> = {};
  for (const evt of sequence.events) {
    outcomes[evt.id] = {
      eventId: evt.id,
      targetMesh: evt.target_mesh,
      status: 'pending',
      deltaMs: null,
    };
  }
  return {
    sequenceTitle: sequence.title,
    outcomes,
    wrongButtonCount: 0,
    streak: 0,
    bestStreak: 0,
    deltaSamples: [],
    lastFeedback: null,
    history: [],
    feedbackCounter: 0,
  };
}

function formatSignedMs(deltaMs: number): string {
  const rounded = Math.round(deltaMs);
  return rounded >= 0 ? `+${rounded}ms` : `${rounded}ms`;
}

/**
 * Evaluates a real hardware button press (from Bluetooth PS5/Xbox controller, PC Keyboard/Mouse, or Touch)
 * against the active training sequence at `currentTimeMs`.
 *
 * Returns the updated session state + the immediate feedback entry (Perfect / Good / Early / Late / Wrong).
 */
export function evaluatePracticeButtonPress(
  session: PracticeSessionState,
  sequence: TrainingSequence,
  pressedButtonId: string,
  currentTimeMs: number,
  windows: PracticeTimingWindows = DEFAULT_TIMING_WINDOWS,
): { session: PracticeSessionState; feedback: PracticeFeedbackEntry } {
  const nextFeedbackId = `fb-${session.feedbackCounter + 1}`;
  const pendingEvents = sequence.events.filter(
    (evt) => session.outcomes[evt.id]?.status === 'pending',
  );

  // 1. Find the closest pending event matching this exact button within the match window
  let bestSameButton: { evt: TrainingSequence['events'][number]; deltaMs: number; absDelta: number } | null = null;
  for (const evt of pendingEvents) {
    if (evt.target_mesh !== pressedButtonId) continue;
    const deltaMs = currentTimeMs - evt.start_ms;
    const absDelta = Math.abs(deltaMs);
    // Also allow hitting slightly inside a long hold event if still pending
    const insideHoldWindow = currentTimeMs >= evt.start_ms - windows.maxMatchMs && currentTimeMs <= Math.min(evt.end_ms, evt.start_ms + windows.maxMatchMs);
    if (absDelta <= windows.maxMatchMs || insideHoldWindow) {
      if (!bestSameButton || absDelta < bestSameButton.absDelta) {
        bestSameButton = { evt, deltaMs, absDelta };
      }
    }
  }

  if (bestSameButton) {
    const { evt, deltaMs, absDelta } = bestSameButton;
    let judgement: PracticeJudgement;
    let message: string;

    if (absDelta <= windows.perfectMs) {
      judgement = 'perfect';
      message = `PERFECT · ${formatShortButtonName(pressedButtonId)} (${formatSignedMs(deltaMs)})`;
    } else if (absDelta <= windows.goodMs) {
      judgement = 'good';
      const dir = deltaMs < 0 ? 'Slightly Early' : 'Slightly Late';
      message = `GOOD · ${formatShortButtonName(pressedButtonId)} (${dir} ${formatSignedMs(deltaMs)})`;
    } else if (deltaMs < 0) {
      judgement = 'early';
      message = `TOO EARLY · ${formatShortButtonName(pressedButtonId)} (${formatSignedMs(deltaMs)})`;
    } else {
      judgement = 'late';
      message = `TOO LATE · ${formatShortButtonName(pressedButtonId)} (${formatSignedMs(deltaMs)})`;
    }

    const isSuccess = judgement === 'perfect' || judgement === 'good';
    const nextStreak = isSuccess ? session.streak + 1 : 0;
    const nextBestStreak = Math.max(session.bestStreak, nextStreak);

    const feedback: PracticeFeedbackEntry = {
      id: nextFeedbackId,
      judgement,
      pressedButtonId,
      expectedButtonId: evt.target_mesh,
      expectedLabel: evt.label,
      deltaMs: Math.round(deltaMs),
      timestampMs: Math.round(currentTimeMs),
      eventId: evt.id,
      message,
    };

    const nextSession: PracticeSessionState = {
      ...session,
      outcomes: {
        ...session.outcomes,
        [evt.id]: {
          eventId: evt.id,
          targetMesh: evt.target_mesh,
          status: judgement,
          deltaMs: Math.round(deltaMs),
        },
      },
      streak: nextStreak,
      bestStreak: nextBestStreak,
      deltaSamples: [...session.deltaSamples, Math.round(deltaMs)],
      lastFeedback: feedback,
      history: [...session.history.slice(-24), feedback],
      feedbackCounter: session.feedbackCounter + 1,
    };

    return { session: nextSession, feedback };
  }

  // 2. No matching pending button in window -> WRONG BUTTON ERROR!
  // Look up the nearest expected event so we can tell the player WHICH button they were supposed to press.
  let nearestExpected: TrainingSequence['events'][number] | null = null;
  let nearestDist = Infinity;
  for (const evt of pendingEvents) {
    const dist = Math.abs(currentTimeMs - evt.start_ms);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestExpected = evt;
    }
  }

  const pressedShort = formatShortButtonName(pressedButtonId);
  const expectedShort = nearestExpected ? formatShortButtonName(nearestExpected.target_mesh) : null;
  const message = expectedShort
    ? `WRONG BUTTON · Pressed ${pressedShort} (Expected ${expectedShort})`
    : `WRONG BUTTON · Unexpected ${pressedShort}`;

  const feedback: PracticeFeedbackEntry = {
    id: nextFeedbackId,
    judgement: 'wrong',
    pressedButtonId,
    expectedButtonId: nearestExpected?.target_mesh ?? null,
    expectedLabel: nearestExpected?.label,
    deltaMs: nearestExpected ? Math.round(currentTimeMs - nearestExpected.start_ms) : null,
    timestampMs: Math.round(currentTimeMs),
    eventId: nearestExpected?.id,
    message,
  };

  const nextSession: PracticeSessionState = {
    ...session,
    wrongButtonCount: session.wrongButtonCount + 1,
    streak: 0,
    lastFeedback: feedback,
    history: [...session.history.slice(-24), feedback],
    feedbackCounter: session.feedbackCounter + 1,
  };

  return { session: nextSession, feedback };
}

/**
 * Checks whether the playhead has passed any pending events beyond the late window (`start_ms + maxMatchMs`)
 * and marks them as MISSED errors.
 */
export function evaluatePracticeMisses(
  session: PracticeSessionState,
  sequence: TrainingSequence,
  currentTimeMs: number,
  windows: PracticeTimingWindows = DEFAULT_TIMING_WINDOWS,
): { session: PracticeSessionState; newlyMissed: PracticeFeedbackEntry[] } {
  const newlyMissed: PracticeFeedbackEntry[] = [];
  let updatedOutcomes: Record<string, PracticeEventOutcome> | null = null;
  let counter = session.feedbackCounter;

  for (const evt of sequence.events) {
    const outcome = session.outcomes[evt.id];
    if (!outcome || outcome.status !== 'pending') continue;
    const missCutoff = evt.start_ms + windows.maxMatchMs;
    if (currentTimeMs > missCutoff) {
      if (!updatedOutcomes) {
        updatedOutcomes = { ...session.outcomes };
      }
      updatedOutcomes[evt.id] = {
        ...outcome,
        status: 'missed',
        deltaMs: null,
      };
      counter += 1;
      newlyMissed.push({
        id: `fb-${counter}`,
        judgement: 'missed',
        pressedButtonId: null,
        expectedButtonId: evt.target_mesh,
        expectedLabel: evt.label,
        deltaMs: null,
        timestampMs: Math.round(currentTimeMs),
        eventId: evt.id,
        message: `MISSED · ${formatShortButtonName(evt.target_mesh)} (${evt.label})`,
      });
    }
  }

  if (!updatedOutcomes) {
    return { session, newlyMissed: [] };
  }

  const last = newlyMissed[newlyMissed.length - 1];
  return {
    session: {
      ...session,
      outcomes: updatedOutcomes,
      streak: 0,
      lastFeedback: last,
      history: [...session.history, ...newlyMissed].slice(-25),
      feedbackCounter: counter,
    },
    newlyMissed,
  };
}

/**
 * Computes aggregate live accuracy, error counts, and timing average from the practice session.
 */
export function computePracticeStats(session: PracticeSessionState): PracticeSessionStats {
  const values = Object.values(session.outcomes);
  const totalEvents = values.length;

  let perfectCount = 0;
  let goodCount = 0;
  let timingErrorCount = 0;
  let missedCount = 0;

  for (const o of values) {
    if (o.status === 'perfect') perfectCount++;
    else if (o.status === 'good') goodCount++;
    else if (o.status === 'early' || o.status === 'late') timingErrorCount++;
    else if (o.status === 'missed') missedCount++;
  }

  const judgedEvents = perfectCount + goodCount + timingErrorCount + missedCount;
  const totalAttempts = judgedEvents + session.wrongButtonCount;
  const weightedHits = perfectCount * 1.0 + goodCount * 0.8 + timingErrorCount * 0.35;

  const accuracyPct =
    totalAttempts > 0 ? Math.round((weightedHits / totalAttempts) * 100) : 100;

  const avgDeltaMs =
    session.deltaSamples.length > 0
      ? Math.round(
          session.deltaSamples.reduce((acc, v) => acc + v, 0) / session.deltaSamples.length,
        )
      : null;

  return {
    totalEvents,
    perfectCount,
    goodCount,
    timingErrorCount,
    wrongButtonCount: session.wrongButtonCount,
    missedCount,
    streak: session.streak,
    bestStreak: session.bestStreak,
    accuracyPct,
    avgDeltaMs,
    outcomes: session.outcomes,
    lastFeedback: session.lastFeedback,
    history: session.history,
  };
}
