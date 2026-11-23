import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSequenceEndpointUrl, normalizeBackendPayload } from './apiClient';

test('normalizeBackendPayload accepts both raw TrainingSequence and rich backend envelope', () => {
  const raw = normalizeBackendPayload({
    title: 'API Boss Parry',
    duration_ms: 2500,
    events: [
      {
        id: 'e1',
        target_mesh: 'BTN_L1',
        label: 'Guard',
        start_ms: 200,
        end_ms: 700,
        tilt: { x: 0.1, y: 0, z: 0.1 },
        color: '#38bdf8',
      },
    ],
  });
  assert.equal(raw.ok, true);
  if (raw.ok) {
    assert.equal(raw.data.sequence.title, 'API Boss Parry');
    assert.equal(raw.data.sequence.events.length, 1);
  }

  const envelope = normalizeBackendPayload({
    activePresetId: 'p2',
    sequence: {
      title: 'Trigger Burst',
      duration_ms: 3000,
      events: [
        {
          id: 'e2',
          target_mesh: 'BTN_R2',
          label: 'Fire',
          start_ms: 400,
          end_ms: 1100,
          tilt: { x: 0.1, y: 0, z: -0.1 },
          color: '#f472b6',
        },
      ],
    },
    presets: [
      {
        id: 'p2',
        shortLabel: 'Trigger Burst',
        sequence: {
          title: 'Trigger Burst',
          duration_ms: 3000,
          events: [],
        },
      },
    ],
    meshMapping: { BTN_R2: 'DualSense_R2_Trigger' },
    surfaceAnchors: {
      BTN_R2: { point: [0.8, 0.2, -0.9], normal: [0, 0, -1], meshName: 'DualSense_R2_Trigger' },
    },
  });
  assert.equal(envelope.ok, true);
  if (envelope.ok) {
    assert.equal(envelope.data.activePresetId, 'p2');
    assert.equal(envelope.data.presets?.length, 1);
    assert.equal(envelope.data.meshMapping?.BTN_R2, 'DualSense_R2_Trigger');
    assert.deepEqual(envelope.data.surfaceAnchors?.BTN_R2.point, [0.8, 0.2, -0.9]);
  }
});

test('buildSequenceEndpointUrl supports both template placeholders and query params', () => {
  assert.equal(
    buildSequenceEndpointUrl('https://api.example.com/trainer/{device}', 'ps5'),
    'https://api.example.com/trainer/ps5',
  );
  assert.equal(
    buildSequenceEndpointUrl('https://api.example.com/trainer/{device}', 'ps5', 'combo-1'),
    'https://api.example.com/trainer/ps5?preset=combo-1',
  );
  assert.equal(
    buildSequenceEndpointUrl('/api/sequences', 'xbox', 'aim-swap'),
    '/api/sequences?device=xbox&preset=aim-swap',
  );
});
