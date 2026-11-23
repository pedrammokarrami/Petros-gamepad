import type { SequenceEvent, TiltVector, TrainingSequence } from '../types/trainer';

export interface ActiveEventEvaluation {
  event: SequenceEvent;
  /** Normalized progress within [0..1] from start_ms to end_ms */
  progress: number;
  /** Physical press depth / glow intensity envelope [0..1] with smooth attack & release */
  intensity: number;
}

export interface ShowcasePose {
  rotX: number;
  rotY: number;
  rotZ: number;
  liftY: number;
}

export interface TimelineFrameEvaluation {
  activeEvents: ActiveEventEvaluation[];
  targetTilt: TiltVector;
  /** Cinematic showcase rotation that angles the controller so active rear triggers (L2/R2) & buttons are clearly visible */
  targetShowcasePose: TiltVector;
  /** Gentle upward clearance lift while pitching forward to reveal rear triggers */
  targetLiftY: number;
  newlyTriggered: SequenceEvent[];
}

export interface SpringState {
  value: number;
  velocity: number;
}

export interface Spring3DState {
  x: SpringState;
  y: SpringState;
  z: SpringState;
}

export function createSpring3DState(): Spring3DState {
  return {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    z: { value: 0, velocity: 0 },
  };
}

/**
 * Computes a snappy mechanical attack/release envelope in [0..1]
 * for a button press over [start_ms, end_ms].
 */
export function computePressEnvelope(
  timeMs: number,
  startMs: number,
  endMs: number,
): number {
  if (timeMs < startMs || timeMs > endMs) return 0;
  const duration = Math.max(1, endMs - startMs);
  const attackMs = Math.min(65, duration * 0.22);
  const releaseMs = Math.min(95, duration * 0.28);

  const elapsed = timeMs - startMs;
  const remaining = endMs - timeMs;

  if (elapsed < attackMs) {
    const t = elapsed / Math.max(1, attackMs);
    return 1 - Math.pow(1 - t, 3); // cubic ease-out attack
  }
  if (remaining < releaseMs) {
    const t = remaining / Math.max(1, releaseMs);
    return t * t * (3 - 2 * t); // smoothstep release
  }
  return 1;
}

/**
 * Computes the optimal Astro Bot / keynote showcase rotation for a given button ID:
 * - Rear adaptive triggers (L2/R2, LT/RT) pitch the top shoulder edge cleanly toward the camera + yaw toward that side
 * - Shoulder bumpers (L1/R1, LB/RB) apply a crisp upper-shoulder angle
 * - Face buttons & D-Pad apply a refined 3/4 hero turn toward their cluster
 */
export function computeButtonShowcasePose(targetMesh: string, override?: TiltVector): ShowcasePose {
  if (override) {
    return {
      rotX: override.x,
      rotY: override.y,
      rotZ: override.z,
      liftY: Math.max(0, Math.min(0.26, Math.abs(override.x) * 0.2)),
    };
  }

  const id = targetMesh.toUpperCase();

  // Rear lower adaptive triggers — rotate top-rear edge clearly into view
  if (id === 'BTN_L2' || id === 'BTN_LT') {
    return { rotX: 1.16, rotY: 0.42, rotZ: -0.06, liftY: 0.22 };
  }
  if (id === 'BTN_R2' || id === 'BTN_RT') {
    return { rotX: 1.16, rotY: -0.42, rotZ: 0.06, liftY: 0.22 };
  }

  // Top shoulder bumpers — upper-rear 3/4 reveal
  if (id === 'BTN_L1' || id === 'BTN_LB') {
    return { rotX: 0.84, rotY: 0.34, rotZ: -0.05, liftY: 0.16 };
  }
  if (id === 'BTN_R1' || id === 'BTN_RB') {
    return { rotX: 0.84, rotY: -0.34, rotZ: 0.05, liftY: 0.16 };
  }

  // Right-side face button clusters (PlayStation symbols & Xbox ABXY)
  if (
    id === 'BTN_TRIANGLE' ||
    id === 'BTN_CIRCLE' ||
    id === 'BTN_CROSS' ||
    id === 'BTN_SQUARE' ||
    id === 'BTN_A' ||
    id === 'BTN_B' ||
    id === 'BTN_X' ||
    id === 'BTN_Y'
  ) {
    return { rotX: 0.1, rotY: -0.2, rotZ: 0.03, liftY: 0.03 };
  }

  // Left-side D-Pad
  if (id.startsWith('BTN_DPAD_')) {
    return { rotX: 0.1, rotY: 0.2, rotZ: -0.03, liftY: 0.03 };
  }

  // Thumbsticks
  if (id === 'BTN_L3' || id === 'BTN_LS') {
    return { rotX: 0.12, rotY: 0.12, rotZ: -0.02, liftY: 0.02 };
  }
  if (id === 'BTN_R3' || id === 'BTN_RS') {
    return { rotX: 0.12, rotY: -0.12, rotZ: 0.02, liftY: 0.02 };
  }

  // Touchpad & center system buttons
  if (id === 'BTN_TOUCHPAD' || id === 'BTN_PS' || id === 'BTN_XBOX') {
    return { rotX: 0.16, rotY: 0, rotZ: 0, liftY: 0.03 };
  }

  return { rotX: 0, rotY: 0, rotZ: 0, liftY: 0 };
}

/**
 * Smooth anticipation & settle weight [0..1] for cinematic angle transitions.
 * Begins turning slightly before start_ms so the trigger/button is already in view at impact.
 */
function computeShowcaseWeight(
  timeMs: number,
  startMs: number,
  endMs: number,
  leadMs = 240,
  tailMs = 220,
): number {
  const enterStart = startMs - leadMs;
  const exitEnd = endMs + tailMs;
  if (timeMs < enterStart || timeMs > exitEnd) return 0;
  if (timeMs < startMs) {
    const t = (timeMs - enterStart) / Math.max(1, leadMs);
    return t * t * (3 - 2 * t);
  }
  if (timeMs > endMs) {
    const t = (exitEnd - timeMs) / Math.max(1, tailMs);
    return t * t * (3 - 2 * t);
  }
  return 1;
}

/**
 * Evaluates all active sequence events, aggregated spring tilt target,
 * smart showcase choreography pose (with look-ahead anticipation),
 * and newly triggered events between prevTimeMs and currentTimeMs.
 */
export function evaluateTimelineFrame(
  sequence: TrainingSequence,
  currentTimeMs: number,
  prevTimeMs: number | null,
): TimelineFrameEvaluation {
  const activeEvents: ActiveEventEvaluation[] = [];
  const newlyTriggered: SequenceEvent[] = [];
  let tiltX = 0;
  let tiltY = 0;
  let tiltZ = 0;

  let poseWeightSum = 0;
  let maxPoseWeight = 0;
  let weightedPoseX = 0;
  let weightedPoseY = 0;
  let weightedPoseZ = 0;
  let weightedLiftY = 0;

  for (const event of sequence.events) {
    const isNowActive =
      currentTimeMs >= event.start_ms && currentTimeMs <= event.end_ms;

    if (isNowActive) {
      const duration = Math.max(1, event.end_ms - event.start_ms);
      const progress = Math.min(1, Math.max(0, (currentTimeMs - event.start_ms) / duration));
      const intensity = computePressEnvelope(currentTimeMs, event.start_ms, event.end_ms);

      activeEvents.push({ event, progress, intensity });

      tiltX += event.tilt.x * intensity;
      tiltY += event.tilt.y * intensity;
      tiltZ += event.tilt.z * intensity;

      const wasActive =
        prevTimeMs !== null &&
        prevTimeMs >= event.start_ms &&
        prevTimeMs <= event.end_ms;

      if (!wasActive) {
        newlyTriggered.push(event);
      }
    }

    // Look-ahead showcase angle weight (active smoothly before start_ms & gently after end_ms)
    const w = computeShowcaseWeight(currentTimeMs, event.start_ms, event.end_ms);
    if (w > 0.001) {
      const pose = computeButtonShowcasePose(event.target_mesh, event.showcasePose);
      if (
        Math.abs(pose.rotX) > 1e-4 ||
        Math.abs(pose.rotY) > 1e-4 ||
        Math.abs(pose.rotZ) > 1e-4 ||
        pose.liftY > 1e-4
      ) {
        poseWeightSum += w;
        if (w > maxPoseWeight) maxPoseWeight = w;
        weightedPoseX += pose.rotX * w;
        weightedPoseY += pose.rotY * w;
        weightedPoseZ += pose.rotZ * w;
        weightedLiftY += pose.liftY * w;
      }
    }
  }

  // Clamp combined tilt angles so simultaneous presses remain physically refined
  const clampAngle = (v: number) => Math.max(-0.35, Math.min(0.35, v));

  // Normalize blended showcase pose by weight sum and scale by peak weight for smooth entry/exit
  const norm = poseWeightSum > 0 ? maxPoseWeight / poseWeightSum : 0;

  return {
    activeEvents,
    targetTilt: {
      x: clampAngle(tiltX),
      y: clampAngle(tiltY),
      z: clampAngle(tiltZ),
    },
    targetShowcasePose: {
      x: Math.max(-1.45, Math.min(1.45, weightedPoseX * norm)),
      y: Math.max(-0.85, Math.min(0.85, weightedPoseY * norm)),
      z: Math.max(-0.35, Math.min(0.35, weightedPoseZ * norm)),
    },
    targetLiftY: Math.max(0, Math.min(0.3, weightedLiftY * norm)),
    newlyTriggered,
  };
}

/**
 * Semi-implicit Euler second-order damped harmonic oscillator.
 * Sub-stepped internally for unconditional stability across variable frame rates.
 */
export function stepSpring1D(
  state: SpringState,
  target: number,
  dtSeconds: number,
  stiffness = 190,
  damping = 17,
): SpringState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return state;
  }
  const clampedDt = Math.min(dtSeconds, 0.1);
  const substeps = Math.max(1, Math.ceil(clampedDt / 0.016));
  const stepDt = clampedDt / substeps;

  let value = state.value;
  let velocity = state.velocity;

  for (let i = 0; i < substeps; i++) {
    const force = (target - value) * stiffness;
    const dampForce = velocity * damping;
    const accel = force - dampForce;
    velocity += accel * stepDt;
    value += velocity * stepDt;
  }

  if (Math.abs(target - value) < 0.0001 && Math.abs(velocity) < 0.0001) {
    value = target;
    velocity = 0;
  }

  return { value, velocity };
}

export function stepSpring3D(
  state: Spring3DState,
  target: TiltVector,
  dtSeconds: number,
  stiffness = 190,
  damping = 17,
): Spring3DState {
  return {
    x: stepSpring1D(state.x, target.x, dtSeconds, stiffness, damping),
    y: stepSpring1D(state.y, target.y, dtSeconds, stiffness, damping),
    z: stepSpring1D(state.z, target.z, dtSeconds, stiffness, damping),
  };
}

/**
 * Validates and normalizes an incoming sequence JSON payload
 * (e.g. from window.AstroTrainerAPI.loadSequence).
 */
export function validateAndNormalizeSequence(
  input: unknown,
): { ok: true; sequence: TrainingSequence } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Sequence payload must be a valid JSON object.' };
  }

  const raw = input as Record<string, unknown>;
  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim()
      : 'Custom Sequence';

  const durationMs =
    typeof raw.duration_ms === 'number' && Number.isFinite(raw.duration_ms) && raw.duration_ms > 0
      ? Math.round(raw.duration_ms)
      : 0;

  if (durationMs <= 0) {
    return { ok: false, error: 'duration_ms must be a positive number.' };
  }

  if (!Array.isArray(raw.events)) {
    return { ok: false, error: 'Missing events array in sequence JSON.' };
  }

  const normalizedEvents: SequenceEvent[] = [];

  for (let i = 0; i < raw.events.length; i++) {
    const item = raw.events[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') continue;

    const targetMesh =
      typeof item.target_mesh === 'string' ? item.target_mesh.trim() : '';
    if (!targetMesh) continue;

    const rawStart = typeof item.start_ms === 'number' ? item.start_ms : 0;
    const rawEnd = typeof item.end_ms === 'number' ? item.end_ms : rawStart + 400;
    const startMs = Math.max(0, Math.min(durationMs, Math.round(rawStart)));
    const endMs = Math.max(startMs + 20, Math.min(durationMs, Math.round(rawEnd)));

    const rawTilt = (item.tilt && typeof item.tilt === 'object'
      ? item.tilt
      : {}) as Record<string, unknown>;

    const tilt: TiltVector = {
      x: typeof rawTilt.x === 'number' && Number.isFinite(rawTilt.x) ? rawTilt.x : 0.1,
      y: typeof rawTilt.y === 'number' && Number.isFinite(rawTilt.y) ? rawTilt.y : 0,
      z: typeof rawTilt.z === 'number' && Number.isFinite(rawTilt.z) ? rawTilt.z : 0,
    };

    const rawTouch =
      item.touch && typeof item.touch === 'object'
        ? (item.touch as Record<string, unknown>)
        : null;

    const touch =
      rawTouch &&
      typeof rawTouch.x === 'number' &&
      typeof rawTouch.y === 'number' &&
      Number.isFinite(rawTouch.x) &&
      Number.isFinite(rawTouch.y)
        ? {
            x: Math.max(0.05, Math.min(0.95, rawTouch.x)),
            y: Math.max(0.05, Math.min(0.95, rawTouch.y)),
          }
        : undefined;

    const rawShowcase =
      item.showcasePose && typeof item.showcasePose === 'object'
        ? (item.showcasePose as Record<string, unknown>)
        : null;

    const showcasePose: TiltVector | undefined =
      rawShowcase &&
      typeof rawShowcase.x === 'number' &&
      typeof rawShowcase.y === 'number' &&
      typeof rawShowcase.z === 'number'
        ? {
            x: Number.isFinite(rawShowcase.x) ? rawShowcase.x : 0,
            y: Number.isFinite(rawShowcase.y) ? rawShowcase.y : 0,
            z: Number.isFinite(rawShowcase.z) ? rawShowcase.z : 0,
          }
        : undefined;

    normalizedEvents.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `evt-${i + 1}`,
      target_mesh: targetMesh,
      label:
        typeof item.label === 'string' && item.label.trim()
          ? item.label.trim()
          : targetMesh,
      description:
        typeof item.description === 'string' && item.description.trim()
          ? item.description.trim()
          : undefined,
      start_ms: startMs,
      end_ms: endMs,
      tilt,
      showcasePose,
      color:
        typeof item.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(item.color.trim())
          ? item.color.trim()
          : '#38bdf8',
      touch,
    });
  }

  normalizedEvents.sort((a, b) => a.start_ms - b.start_ms);

  return {
    ok: true,
    sequence: {
      title,
      duration_ms: durationMs,
      events: normalizedEvents,
    },
  };
}

export function formatMilliseconds(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  return String(clamped).padStart(4, '0');
}
