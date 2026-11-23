import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeButtonShowcasePose,
  computePressEnvelope,
  createSpring3DState,
  evaluateTimelineFrame,
  formatMilliseconds,
  stepSpring1D,
  stepSpring3D,
  validateAndNormalizeSequence,
} from './sequenceEngine';
import { DEFAULT_SEQUENCES, PS5_DEMO_PRESETS } from '../data/devices';

test('computePressEnvelope produces smooth attack, sustain, and release', () => {
  assert.equal(computePressEnvelope(99, 100, 600), 0);
  assert.equal(computePressEnvelope(601, 100, 600), 0);
  const attackVal = computePressEnvelope(120, 100, 600);
  assert.ok(attackVal > 0 && attackVal < 1, 'attack phase should be strictly between 0 and 1');
  assert.equal(computePressEnvelope(350, 100, 600), 1, 'sustain phase should equal 1');
  const releaseVal = computePressEnvelope(580, 100, 600);
  assert.ok(releaseVal > 0 && releaseVal < 1, 'release phase should be strictly between 0 and 1');
});

test('evaluateTimelineFrame detects newly triggered events and aggregates tilt', () => {
  const seq = DEFAULT_SEQUENCES.ps5;
  const firstEvent = seq.events[0];

  const before = evaluateTimelineFrame(seq, firstEvent.start_ms - 10, 0);
  assert.equal(before.activeEvents.length, 0);
  assert.equal(before.newlyTriggered.length, 0);

  const onEnter = evaluateTimelineFrame(seq, firstEvent.start_ms + 80, firstEvent.start_ms - 10);
  assert.equal(onEnter.activeEvents.length, 1);
  assert.equal(onEnter.newlyTriggered.length, 1);
  assert.equal(onEnter.newlyTriggered[0].id, firstEvent.id);
  assert.ok(Math.abs(onEnter.targetTilt.x) > 0);

  const midHold = evaluateTimelineFrame(seq, firstEvent.start_ms + 150, firstEvent.start_ms + 80);
  assert.equal(midHold.activeEvents.length, 1);
  assert.equal(midHold.newlyTriggered.length, 0, 'holding an already active event must not re-trigger shockwave');
});

test('spring physics converges stably toward target and handles edge dt', () => {
  let spring = createSpring3DState();
  const target = { x: 0.2, y: -0.1, z: 0.15 };

  // Zero / negative dt must be no-op
  const unchanged = stepSpring1D({ value: 0.5, velocity: 0 }, 1, 0);
  assert.equal(unchanged.value, 0.5);

  for (let i = 0; i < 120; i++) {
    spring = stepSpring3D(spring, target, 1 / 60);
  }
  assert.ok(Math.abs(spring.x.value - target.x) < 0.005, 'spring X should settle at target');
  assert.ok(Math.abs(spring.y.value - target.y) < 0.005, 'spring Y should settle at target');
  assert.ok(Math.abs(spring.z.value - target.z) < 0.005, 'spring Z should settle at target');
});

test('validateAndNormalizeSequence validates backend JSON payloads safely', () => {
  const invalid = validateAndNormalizeSequence({ title: 'Bad', duration_ms: -10, events: [] });
  assert.equal(invalid.ok, false);

  const valid = validateAndNormalizeSequence({
    title: '  سناریوی آزمایشی  ',
    duration_ms: 2000,
    events: [
      {
        id: 'e2',
        target_mesh: 'BTN_R1',
        label: 'بامپر راست',
        start_ms: 900,
        end_ms: 1400,
        tilt: { x: 0.1, y: 0, z: -0.1 },
        color: '#22d3ee',
      },
      {
        id: 'e1',
        target_mesh: 'BTN_L1',
        label: 'بامپر چپ',
        start_ms: 100,
        end_ms: 500,
        tilt: { x: 0.1, y: 0, z: 0.1 },
        color: 'invalid-color',
      },
    ],
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.sequence.title, 'سناریوی آزمایشی');
    assert.equal(valid.sequence.events.length, 2);
    assert.equal(valid.sequence.events[0].id, 'e1', 'events should be sorted by start_ms');
    assert.equal(valid.sequence.events[0].color, '#38bdf8', 'invalid hex color falls back safely');
  }
});

test('formatMilliseconds pads to 4 digits', () => {
  assert.equal(formatMilliseconds(0), '0000');
  assert.equal(formatMilliseconds(85), '0085');
  assert.equal(formatMilliseconds(2400), '2400');
});

test('computeButtonShowcasePose angles L2/R2 triggers prominently and centers simultaneous L2+R2', () => {
  const l2 = computeButtonShowcasePose('BTN_L2');
  const r2 = computeButtonShowcasePose('BTN_R2');
  const tri = computeButtonShowcasePose('BTN_TRIANGLE');

  assert.ok(l2.rotX > 1.0, 'L2 should pitch controller forward to reveal rear trigger');
  assert.ok(l2.rotY > 0.25, 'L2 should yaw toward left shoulder');
  assert.ok(r2.rotY < -0.25, 'R2 should yaw toward right shoulder');
  assert.ok(l2.liftY > 0.15, 'L2 should lift controller above pedestal while pitched');
  assert.ok(tri.rotX < 0.25, 'face buttons stay upright toward camera');

  // Demo 2 has simultaneous L2 (300..2480) and R2 (940..1480) -> yaw balances to ~0 while keeping full rear trigger pitch
  const shooterSeq = PS5_DEMO_PRESETS[1].sequence;
  const bothTriggers = evaluateTimelineFrame(shooterSeq, 1200, 1180);
  assert.ok(bothTriggers.targetShowcasePose.x > 1.0, 'simultaneous L2+R2 maintains full rear trigger pitch');
  assert.ok(Math.abs(bothTriggers.targetShowcasePose.y) < 0.05, 'simultaneous L2+R2 centers yaw between both triggers');

  // Look-ahead anticipation begins smoothly before start_ms (L2 starts at 300ms -> already turning at 180ms)
  const anticipate = evaluateTimelineFrame(shooterSeq, 180, 160);
  assert.equal(anticipate.activeEvents.length, 0);
  assert.ok(anticipate.targetShowcasePose.x > 0.2, 'look-ahead anticipation starts turning before trigger press');
});

