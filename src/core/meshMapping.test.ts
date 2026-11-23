import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignButtonMesh,
  createEmptyMappings,
  findButtonForMesh,
  loadMappingsFromStorage,
  MAPPING_STORAGE_KEY,
  parseMappingImport,
  resolveTargetMeshName,
  saveMappingsToStorage,
  serializeMappingExport,
  unassignMesh,
} from './meshMapping';

test('assignButtonMesh enforces 1-to-1 binding and unassignMesh clears it', () => {
  let map = assignButtonMesh({}, 'BTN_L1', 'Mesh_Shoulder_01');
  assert.equal(map.BTN_L1, 'Mesh_Shoulder_01');
  assert.equal(findButtonForMesh(map, 'Mesh_Shoulder_01'), 'BTN_L1');

  // Reassigning the same mesh to another button clears the old button binding
  map = assignButtonMesh(map, 'BTN_R1', 'Mesh_Shoulder_01');
  assert.equal(map.BTN_L1, undefined);
  assert.equal(map.BTN_R1, 'Mesh_Shoulder_01');

  assert.equal(resolveTargetMeshName(map, 'BTN_R1'), 'Mesh_Shoulder_01');
  assert.equal(resolveTargetMeshName(map, 'BTN_CROSS'), 'BTN_CROSS');

  map = unassignMesh(map, 'Mesh_Shoulder_01');
  assert.equal(findButtonForMesh(map, 'Mesh_Shoulder_01'), null);
});

test('localStorage persistence round-trips cleanly including unified PC mapping', () => {
  const backing = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
  };

  const all = createEmptyMappings();
  all.ps5 = { BTN_TRIANGLE: 'Tri_Mesh_03' };
  all.pc = { KEY_W: 'KeyCap_W', BTN_LMB: 'LeftPaddle_Mesh' };

  saveMappingsToStorage(all, mockStorage);
  assert.ok(backing.has(MAPPING_STORAGE_KEY));

  const restored = loadMappingsFromStorage(mockStorage);
  assert.equal(restored.ps5.BTN_TRIANGLE, 'Tri_Mesh_03');
  assert.equal(restored.pc.KEY_W, 'KeyCap_W');
  assert.equal(restored.pc.BTN_LMB, 'LeftPaddle_Mesh');
});

test('serializeMappingExport and parseMappingImport round-trip cleanly and map legacy mouse/keyboard to pc', () => {
  const json = serializeMappingExport('pc', { BTN_LMB: 'LeftPaddle_Mesh', KEY_SPACE: 'Space_Cap' });
  const parsed = parseMappingImport(json);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.device, 'pc');
    assert.equal(parsed.mappings.BTN_LMB, 'LeftPaddle_Mesh');
    assert.equal(parsed.mappings.KEY_SPACE, 'Space_Cap');
  }

  const legacyMouse = parseMappingImport(JSON.stringify({ version: 1, device: 'mouse', mappings: { BTN_RMB: 'RightClick' } }));
  assert.equal(legacyMouse.ok, true);
  if (legacyMouse.ok) {
    assert.equal(legacyMouse.device, 'pc');
    assert.equal(legacyMouse.mappings.BTN_RMB, 'RightClick');
  }

  const bad = parseMappingImport('{broken json');
  assert.equal(bad.ok, false);
});
