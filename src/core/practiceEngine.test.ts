import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectGamepadBrand,
  formatControllerDisplayName,
  mapGamepadButtonIndex,
  readGamepadButtonStates,
} from './gamepadMapper';
import {
  computePracticeStats,
  createPracticeSession,
  evaluatePracticeButtonPress,
  evaluatePracticeMisses,
} from './practiceEngine';
import type { TrainingSequence } from '../types/trainer';

const SAMPLE_SEQ: TrainingSequence = {
  title: 'PS5 Test Combo',
  duration_ms: 3000,
  events: [
    {
      id: 'e1',
      target_mesh: 'BTN_L1',
      label: 'Perfect Guard (L1)',
      start_ms: 500,
      end_ms: 1000,
      tilt: { x: 0, y: 0, z: 0 },
      color: '#38bdf8',
    },
    {
      id: 'e2',
      target_mesh: 'BTN_TRIANGLE',
      label: 'Counter (Triangle)',
      start_ms: 1400,
      end_ms: 1900,
      tilt: { x: 0, y: 0, z: 0 },
      color: '#34d399',
    },
    {
      id: 'e3',
      target_mesh: 'BTN_R2',
      label: 'Trigger Finisher (R2)',
      start_ms: 2200,
      end_ms: 2800,
      tilt: { x: 0, y: 0, z: 0 },
      color: '#f472b6',
    },
  ],
};

test('detectGamepadBrand identifies PlayStation DualSense and Xbox Wireless Bluetooth controllers', () => {
  assert.equal(detectGamepadBrand('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'ps5');
  assert.equal(detectGamepadBrand('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
  assert.equal(formatControllerDisplayName('DualSense Wireless Controller', 'ps5'), 'PS5 DualSense');
  assert.equal(formatControllerDisplayName('Xbox Wireless Controller', 'xbox'), 'Xbox Wireless');
});

test('mapGamepadButtonIndex and readGamepadButtonStates map analog triggers & face buttons accurately', () => {
  assert.equal(mapGamepadButtonIndex(0, 'ps5'), 'BTN_CROSS');
  assert.equal(mapGamepadButtonIndex(7, 'ps5'), 'BTN_R2');
  assert.equal(mapGamepadButtonIndex(0, 'xbox'), 'BTN_A');
  assert.equal(mapGamepadButtonIndex(7, 'xbox'), 'BTN_RT');

  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }));
  buttons[4] = { pressed: true, value: 1 }; // L1
  buttons[7] = { pressed: false, value: 0.45 }; // Partial analog R2 pull above 0.16 threshold

  const activePs5 = readGamepadButtonStates(buttons, 'ps5');
  assert.equal(activePs5.BTN_L1, 1);
  assert.equal(activePs5.BTN_R2, 0.45);
});

test('practiceEngine judges PERFECT, GOOD, TOO EARLY, WRONG BUTTON, and MISSED accurately', () => {
  let session = createPracticeSession(SAMPLE_SEQ);

  // 1. PERFECT press on BTN_L1 (+25ms from 500ms)
  const r1 = evaluatePracticeButtonPress(session, SAMPLE_SEQ, 'BTN_L1', 525);
  session = r1.session;
  assert.equal(r1.feedback.judgement, 'perfect');
  assert.equal(r1.feedback.deltaMs, 25);

  // 2. WRONG BUTTON press (pressed CIRCLE when TRIANGLE is expected next)
  const rWrong = evaluatePracticeButtonPress(session, SAMPLE_SEQ, 'BTN_CIRCLE', 1350);
  session = rWrong.session;
  assert.equal(rWrong.feedback.judgement, 'wrong');
  assert.equal(rWrong.feedback.expectedButtonId, 'BTN_TRIANGLE');
  assert.match(rWrong.feedback.message, /WRONG BUTTON/);

  // 3. TOO EARLY press on BTN_TRIANGLE (-260ms before 1400ms -> 1140ms)
  // Wait: simulate pressing at 1140ms on a fresh copy for early check, and press GOOD at 1540ms here
  const r2 = evaluatePracticeButtonPress(session, SAMPLE_SEQ, 'BTN_TRIANGLE', 1540);
  session = r2.session;
  assert.equal(r2.feedback.judgement, 'good');
  assert.equal(r2.feedback.deltaMs, 140);

  // 4. Advance past BTN_R2 miss window (2200 + 360 = 2560ms) -> MISSED
  const missRes = evaluatePracticeMisses(session, SAMPLE_SEQ, 2650);
  session = missRes.session;
  assert.equal(missRes.newlyMissed.length, 1);
  assert.equal(missRes.newlyMissed[0].judgement, 'missed');
  assert.equal(missRes.newlyMissed[0].expectedButtonId, 'BTN_R2');

  const stats = computePracticeStats(session);
  assert.equal(stats.totalEvents, 3);
  assert.equal(stats.perfectCount, 1);
  assert.equal(stats.goodCount, 1);
  assert.equal(stats.wrongButtonCount, 1);
  assert.equal(stats.missedCount, 1);
  assert.equal(stats.outcomes.e1.status, 'perfect');
  assert.equal(stats.outcomes.e2.status, 'good');
  assert.equal(stats.outcomes.e3.status, 'missed');
  assert.ok(stats.accuracyPct > 0 && stats.accuracyPct < 100);
});
