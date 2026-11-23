import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSurfaceAnchor,
  computeAutoGlbTransform,
  createEmptyAnchorMaps,
  loadAnchorsFromStorage,
  removeSurfaceAnchor,
  saveAnchorsToStorage,
} from './glbPlacement.ts';

test('computeAutoGlbTransform rotates a vertical backwards iPad GLB into landscape facing camera', () => {
  // Portrait iPad standing upright (tall Y, narrow X, thin Z) with rear camera & Apple logo on +Z
  const transform = computeAutoGlbTransform(
    'ipad',
    { x: 2.1, y: 2.8, z: 0.08 },
    [
      { name: 'Rear_Camera_Bump', center: [0.6, 0.9, 0.04] },
      { name: 'Apple_Logo', center: [0, 0, 0.04] },
      { name: 'OLED_Screen', center: [0, 0, -0.04] },
    ],
  );

  // Should flip 180° around Y so screen faces +Z camera, and rotate 90° around Z into landscape
  assert.ok(Math.abs(Math.abs(transform.rotY) - Math.PI) < 0.01);
  assert.ok(Math.abs(transform.rotZ - Math.PI / 2) < 0.01);
  assert.ok(transform.rotX < 0);
});

test('computeAutoGlbTransform tilts flat XZ iPad cleanly toward camera without unnecessary flip', () => {
  const transform = computeAutoGlbTransform(
    'ipad',
    { x: 3.4, y: 0.09, z: 2.3 },
    [{ name: 'Display_Glass', center: [0, 0.045, 0] }],
  );

  assert.equal(transform.rotY, 0);
  assert.equal(transform.rotZ, 0);
  assert.ok(transform.rotX > 0.5);
});

test('surface anchor assignment, removal, and storage round-trip cleanly', () => {
  const backing = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
  };

  let ipadAnchors = {};
  ipadAnchors = assignSurfaceAnchor(ipadAnchors, 'TOUCH_FIRE', {
    point: [1.12345, 0.25, 0.045],
    normal: [0, 0, 1],
    meshName: 'Screen_Mesh',
  });

  const all = createEmptyAnchorMaps();
  all.ipad = ipadAnchors;
  saveAnchorsToStorage(all, mockStorage);

  const restored = loadAnchorsFromStorage(mockStorage);
  assert.deepEqual(restored.ipad.TOUCH_FIRE.point, [1.1235, 0.25, 0.045]);
  assert.deepEqual(restored.ipad.TOUCH_FIRE.normal, [0, 0, 1]);
  assert.equal(restored.ipad.TOUCH_FIRE.meshName, 'Screen_Mesh');

  const cleared = removeSurfaceAnchor(restored.ipad, 'TOUCH_FIRE');
  assert.equal(cleared.TOUCH_FIRE, undefined);
});
