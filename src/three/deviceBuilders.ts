import * as THREE from 'three';
import type { DeviceType } from '../types/trainer';
import {
  createBrushedMetalTexture,
  createButtonSymbolTexture,
  createIpadScreenTexture,
  createKeycapLegendTexture,
} from './proceduralTextures';

export interface BuiltDeviceModel {
  root: THREE.Group;
  /** For iPad: the local plane metrics where touch ripples spawn */
  ipadScreenInfo?: {
    width: number;
    height: number;
    surfaceY: number;
    container: THREE.Group;
  };
  disposables: Array<{ dispose: () => void }>;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const radius = Math.min(r, hw, hh);
  s.moveTo(-hw + radius, -hh);
  s.lineTo(hw - radius, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + radius);
  s.lineTo(hw, hh - radius);
  s.quadraticCurveTo(hw, hh, hw - radius, hh);
  s.lineTo(-hw + radius, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - radius);
  s.lineTo(-hw, -hh + radius);
  s.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
  return s;
}

function registerMesh(
  mesh: THREE.Mesh,
  name: string,
  pressAxis: THREE.Vector3 = new THREE.Vector3(0, -1, 0),
  pressDistance = 0.045,
) {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pressAxis = pressAxis;
  mesh.userData.pressDistance = pressDistance;
  return mesh;
}

/**
 * 1. PS5 DualSense Studio Model (Composite multi-part sculpted geometry)
 */
function buildPs5DualSense(maxAnisotropy: number): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'PS5_DualSense_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  const whiteShellMat = new THREE.MeshPhysicalMaterial({
    color: 0xc2ccd9,
    roughness: 0.48,
    metalness: 0.06,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
  });
  const blackChinMat = new THREE.MeshPhysicalMaterial({
    color: 0x10141e,
    roughness: 0.2,
    metalness: 0.22,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
  });
  const darkMatteMat = new THREE.MeshStandardMaterial({
    color: 0x181d29,
    roughness: 0.64,
    metalness: 0.12,
  });
  const chromeRingMat = new THREE.MeshStandardMaterial({
    color: 0x9aa8bc,
    metalness: 0.9,
    roughness: 0.22,
  });
  const lightbarMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.35,
    roughness: 0.18,
  });
  disposables.push(whiteShellMat, blackChinMat, darkMatteMat, chromeRingMat, lightbarMat);

  // Sculpted DualSense silhouette shape (viewed from top, extruded along Z then laid flat)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.18, 0.72);
  bodyShape.bezierCurveTo(-0.7, 0.86, 0.7, 0.86, 1.18, 0.72);
  bodyShape.bezierCurveTo(1.66, 0.56, 1.88, 0.08, 1.84, -0.52);
  bodyShape.bezierCurveTo(1.81, -0.96, 1.56, -1.26, 1.24, -1.22);
  bodyShape.bezierCurveTo(0.98, -1.19, 0.88, -0.78, 0.66, -0.56);
  bodyShape.bezierCurveTo(0.42, -0.34, -0.42, -0.34, -0.66, -0.56);
  bodyShape.bezierCurveTo(-0.88, -0.78, -0.98, -1.19, -1.24, -1.22);
  bodyShape.bezierCurveTo(-1.56, -1.26, -1.81, -0.96, -1.84, -0.52);
  bodyShape.bezierCurveTo(-1.88, 0.08, -1.66, 0.56, -1.18, 0.72);

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.1,
    bevelSegments: 6,
    curveSegments: 24,
  });
  bodyGeo.center();
  disposables.push(bodyGeo);

  const shellMesh = registerMesh(new THREE.Mesh(bodyGeo, whiteShellMat), 'CHASSIS_WHITE');
  shellMesh.rotation.x = -Math.PI / 2;
  root.add(shellMesh);

  // Glossy black lower chin bridge seated cleanly flush across the lower middle arch
  const chinShape = roundedRectShape(1.48, 0.66, 0.22);
  const chinGeo = new THREE.ExtrudeGeometry(chinShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 4,
  });
  chinGeo.center();
  disposables.push(chinGeo);
  const chinMesh = registerMesh(new THREE.Mesh(chinGeo, blackChinMat), 'CHASSIS_CHIN');
  chinMesh.rotation.x = -Math.PI / 2;
  chinMesh.position.set(0, 0.1, 0.18);
  root.add(chinMesh);

  // Capacitive central touchpad with crisp dark recess frame
  const padRecessGeo = new THREE.BoxGeometry(1.24, 0.025, 0.64);
  disposables.push(padRecessGeo);
  const padRecess = new THREE.Mesh(padRecessGeo, blackChinMat);
  padRecess.position.set(0, 0.3, -0.34);
  root.add(padRecess);

  const padGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.1, 0.54, 0.07), {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 3,
  });
  padGeo.center();
  disposables.push(padGeo);
  const padMat = new THREE.MeshPhysicalMaterial({
    color: 0xd0d9e6,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.26,
  });
  disposables.push(padMat);
  const touchpad = registerMesh(new THREE.Mesh(padGeo, padMat), 'BTN_TOUCHPAD', new THREE.Vector3(0, -1, 0), 0.025);
  touchpad.rotation.x = -Math.PI / 2;
  touchpad.position.set(0, 0.33, -0.34);
  root.add(touchpad);

  // Flanking DualSense LED lightbars clearly visible along touchpad bevel
  const barGeo = new THREE.BoxGeometry(0.042, 0.035, 0.56);
  disposables.push(barGeo);
  const leftBar = new THREE.Mesh(barGeo, lightbarMat);
  leftBar.position.set(-0.59, 0.33, -0.34);
  const rightBar = new THREE.Mesh(barGeo, lightbarMat);
  rightBar.position.set(0.59, 0.33, -0.34);
  root.add(leftBar, rightBar);

  // Dual symmetrical analog thumbsticks (BTN_L3, BTN_R3) cleanly seated atop the chin
  const stickWellGeo = new THREE.TorusGeometry(0.24, 0.024, 14, 32);
  const stickSocketGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 28);
  const stickStemGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.14, 24);
  const stickCapGeo = new THREE.CylinderGeometry(0.21, 0.19, 0.07, 32);
  disposables.push(stickWellGeo, stickSocketGeo, stickStemGeo, stickCapGeo);

  const stickConfigs = [
    { name: 'BTN_L3', x: -0.46, z: 0.22 },
    { name: 'BTN_R3', x: 0.46, z: 0.22 },
  ];
  for (const cfg of stickConfigs) {
    const socket = new THREE.Mesh(stickSocketGeo, blackChinMat);
    socket.position.set(cfg.x, 0.295, cfg.z);
    const well = new THREE.Mesh(stickWellGeo, chromeRingMat);
    well.rotation.x = Math.PI / 2;
    well.position.set(cfg.x, 0.315, cfg.z);
    root.add(socket, well);

    const stickGroup = new THREE.Group();
    stickGroup.position.set(cfg.x, 0.39, cfg.z);
    const stem = new THREE.Mesh(stickStemGeo, darkMatteMat);
    stem.position.y = -0.04;
    const capMat = darkMatteMat.clone();
    capMat.roughness = 0.74;
    disposables.push(capMat);
    const cap = registerMesh(new THREE.Mesh(stickCapGeo, capMat), cfg.name, new THREE.Vector3(0, -1, 0), 0.04);
    cap.position.y = 0.05;
    stickGroup.add(stem, cap);
    root.add(stickGroup);
  }

  // PlayStation Face Buttons with high-contrast crystal glyph caps
  const faceGeo = new THREE.CylinderGeometry(0.125, 0.13, 0.085, 28);
  disposables.push(faceGeo);
  const faceSpecs: Array<{
    name: string;
    symbol: 'triangle' | 'circle' | 'cross' | 'square';
    x: number;
    z: number;
    fg: string;
  }> = [
    { name: 'BTN_TRIANGLE', symbol: 'triangle', x: 1.12, z: -0.46, fg: '#10b981' },
    { name: 'BTN_CIRCLE', symbol: 'circle', x: 1.38, z: -0.2, fg: '#ef4444' },
    { name: 'BTN_CROSS', symbol: 'cross', x: 1.12, z: 0.06, fg: '#3b82f6' },
    { name: 'BTN_SQUARE', symbol: 'square', x: 0.86, z: -0.2, fg: '#ec4899' },
  ];

  for (const btn of faceSpecs) {
    const tex = createButtonSymbolTexture(btn.symbol, '#1f2636', btn.fg, maxAnisotropy);
    const topMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.14,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const sideMat = new THREE.MeshPhysicalMaterial({
      color: 0x262f42,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 0.9,
    });
    disposables.push(tex, topMat, sideMat);

    const mesh = registerMesh(
      new THREE.Mesh(faceGeo, [sideMat, topMat, sideMat]),
      btn.name,
      new THREE.Vector3(0, -1, 0),
      0.048,
    );
    mesh.position.set(btn.x, 0.33, btn.z);
    root.add(mesh);
  }

  // Sculpted 4-way D-Pad buttons in crisp contrast satin graphite
  const dpadGeo = new THREE.BoxGeometry(0.18, 0.085, 0.22);
  disposables.push(dpadGeo);
  const dpadSpecs = [
    { name: 'BTN_DPAD_UP', x: -1.12, z: -0.42, rotY: 0 },
    { name: 'BTN_DPAD_DOWN', x: -1.12, z: 0.02, rotY: 0 },
    { name: 'BTN_DPAD_LEFT', x: -1.34, z: -0.2, rotY: Math.PI / 2 },
    { name: 'BTN_DPAD_RIGHT', x: -0.9, z: -0.2, rotY: Math.PI / 2 },
  ];
  for (const d of dpadSpecs) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      roughness: 0.28,
      metalness: 0.18,
      clearcoat: 0.75,
    });
    disposables.push(mat);
    const mesh = registerMesh(new THREE.Mesh(dpadGeo, mat), d.name, new THREE.Vector3(0, -1, 0), 0.042);
    mesh.position.set(d.x, 0.33, d.z);
    mesh.rotation.y = d.rotY;
    root.add(mesh);
  }

  // Shoulder bumpers (L1 / R1) & curved adaptive triggers (L2 / R2) cleanly proud of top bevel
  const bumperGeo = new THREE.BoxGeometry(0.66, 0.14, 0.18);
  const triggerGeo = new THREE.BoxGeometry(0.62, 0.2, 0.24);
  disposables.push(bumperGeo, triggerGeo);

  const l1 = registerMesh(new THREE.Mesh(bumperGeo, darkMatteMat.clone()), 'BTN_L1', new THREE.Vector3(0, -0.5, 0.86), 0.055);
  l1.position.set(-1.05, 0.2, -0.96);
  l1.rotation.y = 0.14;

  const r1 = registerMesh(new THREE.Mesh(bumperGeo, darkMatteMat.clone()), 'BTN_R1', new THREE.Vector3(0, -0.5, 0.86), 0.055);
  r1.position.set(1.05, 0.2, -0.96);
  r1.rotation.y = -0.14;

  const l2 = registerMesh(new THREE.Mesh(triggerGeo, darkMatteMat.clone()), 'BTN_L2', new THREE.Vector3(0, -0.25, 0.96), 0.08);
  l2.position.set(-1.06, -0.02, -1.06);
  l2.rotation.set(0.32, 0.14, 0);

  const r2 = registerMesh(new THREE.Mesh(triggerGeo, darkMatteMat.clone()), 'BTN_R2', new THREE.Vector3(0, -0.25, 0.96), 0.08);
  r2.position.set(1.06, -0.02, -1.06);
  r2.rotation.set(0.32, -0.14, 0);

  disposables.push(
    l1.material as THREE.Material,
    r1.material as THREE.Material,
    l2.material as THREE.Material,
    r2.material as THREE.Material,
  );
  root.add(l1, r1, l2, r2);

  // Small system buttons: Create, Options, PS logo
  const pillBtnGeo = new THREE.CapsuleGeometry(0.036, 0.09, 6, 12);
  disposables.push(pillBtnGeo);
  const shareBtn = registerMesh(new THREE.Mesh(pillBtnGeo, darkMatteMat.clone()), 'BTN_SHARE', new THREE.Vector3(0, -1, 0), 0.03);
  shareBtn.rotation.x = Math.PI / 2;
  shareBtn.rotation.z = -0.22;
  shareBtn.position.set(-0.74, 0.33, -0.44);

  const optBtn = registerMesh(new THREE.Mesh(pillBtnGeo, darkMatteMat.clone()), 'BTN_OPTIONS', new THREE.Vector3(0, -1, 0), 0.03);
  optBtn.rotation.x = Math.PI / 2;
  optBtn.rotation.z = 0.22;
  optBtn.position.set(0.74, 0.33, -0.44);

  const psTex = createButtonSymbolTexture('PS', '#151924', '#e2e8f0', maxAnisotropy);
  const psGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24);
  const psMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: psTex, roughness: 0.3 });
  disposables.push(psTex, psGeo, psMat, shareBtn.material as THREE.Material, optBtn.material as THREE.Material);
  const psBtn = registerMesh(new THREE.Mesh(psGeo, psMat), 'BTN_PS', new THREE.Vector3(0, -1, 0), 0.025);
  psBtn.position.set(0, 0.31, 0.22);

  root.add(shareBtn, optBtn, psBtn);

  // Present at an iconic Astro Bot hero angle
  root.rotation.x = 0.38;
  return { root, disposables };
}

/**
 * 2. Xbox Series X Studio Model
 */
function buildXboxSeriesX(maxAnisotropy: number): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'Xbox_SeriesX_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  const obsidianMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c212b,
    roughness: 0.54,
    metalness: 0.14,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
  });
  const satinDarkMat = new THREE.MeshStandardMaterial({
    color: 0x12151d,
    roughness: 0.34,
    metalness: 0.28,
  });
  const metallicDpadMat = new THREE.MeshStandardMaterial({
    color: 0x3b4456,
    roughness: 0.24,
    metalness: 0.72,
  });
  disposables.push(obsidianMat, satinDarkMat, metallicDpadMat);

  // Contoured broader Xbox silhouette
  const shape = new THREE.Shape();
  shape.moveTo(-1.12, 0.78);
  shape.bezierCurveTo(-0.55, 0.9, 0.55, 0.9, 1.12, 0.78);
  shape.bezierCurveTo(1.74, 0.62, 1.92, 0.02, 1.8, -0.62);
  shape.bezierCurveTo(1.72, -1.08, 1.44, -1.24, 1.12, -1.15);
  shape.bezierCurveTo(0.84, -1.06, 0.72, -0.66, 0.5, -0.5);
  shape.bezierCurveTo(0.25, -0.38, -0.25, -0.38, -0.5, -0.5);
  shape.bezierCurveTo(-0.72, -0.66, -0.84, -1.06, -1.12, -1.15);
  shape.bezierCurveTo(-1.44, -1.24, -1.72, -1.08, -1.8, -0.62);
  shape.bezierCurveTo(-1.92, 0.02, -1.74, 0.62, -1.12, 0.78);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.11,
    bevelSegments: 6,
    curveSegments: 24,
  });
  bodyGeo.center();
  disposables.push(bodyGeo);
  const chassis = registerMesh(new THREE.Mesh(bodyGeo, obsidianMat), 'XBOX_CHASSIS');
  chassis.rotation.x = -Math.PI / 2;
  root.add(chassis);

  // Asymmetrical Thumbsticks (BTN_LS upper-left, BTN_RS lower-right)
  const stickStemGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.16, 20);
  const stickCapGeo = new THREE.CylinderGeometry(0.21, 0.18, 0.075, 28);
  const ringGeo = new THREE.TorusGeometry(0.25, 0.018, 10, 28);
  disposables.push(stickStemGeo, stickCapGeo, ringGeo);

  for (const s of [
    { name: 'BTN_LS', x: -0.96, z: -0.22 },
    { name: 'BTN_RS', x: 0.52, z: 0.24 },
  ]) {
    const ring = new THREE.Mesh(ringGeo, satinDarkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(s.x, 0.32, s.z);
    const stem = new THREE.Mesh(stickStemGeo, satinDarkMat);
    stem.position.set(s.x, 0.36, s.z);
    const capMat = satinDarkMat.clone();
    capMat.roughness = 0.72;
    disposables.push(capMat);
    const cap = registerMesh(new THREE.Mesh(stickCapGeo, capMat), s.name, new THREE.Vector3(0, -1, 0), 0.045);
    cap.position.set(s.x, 0.44, s.z);
    root.add(ring, stem, cap);
  }

  // Faceted Hybrid Octagonal D-Pad (lower-left)
  const dishGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.05, 8);
  disposables.push(dishGeo);
  const dish = new THREE.Mesh(dishGeo, metallicDpadMat);
  dish.position.set(-0.52, 0.31, 0.24);
  root.add(dish);

  const armGeo = new THREE.BoxGeometry(0.15, 0.06, 0.2);
  disposables.push(armGeo);
  for (const d of [
    { name: 'BTN_DPAD_UP', x: -0.52, z: 0.08, ry: 0 },
    { name: 'BTN_DPAD_DOWN', x: -0.52, z: 0.4, ry: 0 },
    { name: 'BTN_DPAD_LEFT', x: -0.68, z: 0.24, ry: Math.PI / 2 },
    { name: 'BTN_DPAD_RIGHT', x: -0.36, z: 0.24, ry: Math.PI / 2 },
  ]) {
    const m = metallicDpadMat.clone();
    disposables.push(m);
    const mesh = registerMesh(new THREE.Mesh(armGeo, m), d.name, new THREE.Vector3(0, -1, 0), 0.04);
    mesh.position.set(d.x, 0.34, d.z);
    mesh.rotation.y = d.ry;
    root.add(mesh);
  }

  // Glossy ABXY buttons
  const abxyGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.08, 28);
  disposables.push(abxyGeo);
  const abxySpecs: Array<{ name: string; sym: 'A' | 'B' | 'X' | 'Y'; x: number; z: number; fg: string }> = [
    { name: 'BTN_Y', sym: 'Y', x: 1.06, z: -0.46, fg: '#facc15' },
    { name: 'BTN_B', sym: 'B', x: 1.32, z: -0.2, fg: '#f87171' },
    { name: 'BTN_A', sym: 'A', x: 1.06, z: 0.06, fg: '#4ade80' },
    { name: 'BTN_X', sym: 'X', x: 0.8, z: -0.2, fg: '#60a5fa' },
  ];
  for (const b of abxySpecs) {
    const tex = createButtonSymbolTexture(b.sym, '#0f131b', b.fg, maxAnisotropy);
    const topMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.12,
      metalness: 0.08,
      clearcoat: 1.0,
    });
    const sideMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f131b,
      roughness: 0.14,
      clearcoat: 1.0,
    });
    disposables.push(tex, topMat, sideMat);
    const mesh = registerMesh(new THREE.Mesh(abxyGeo, [sideMat, topMat, sideMat]), b.name, new THREE.Vector3(0, -1, 0), 0.045);
    mesh.position.set(b.x, 0.34, b.z);
    root.add(mesh);
  }

  // Illuminated Xbox Nexus Button
  const nexusTex = createButtonSymbolTexture('XBOX', '#1e2636', '#e2f9ea', maxAnisotropy);
  const nexusGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 28);
  const nexusMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: nexusTex,
    emissive: 0x22c55e,
    emissiveIntensity: 0.55,
    roughness: 0.2,
  });
  disposables.push(nexusTex, nexusGeo, nexusMat);
  const nexusBtn = registerMesh(new THREE.Mesh(nexusGeo, nexusMat), 'BTN_XBOX', new THREE.Vector3(0, -1, 0), 0.03);
  nexusBtn.position.set(0, 0.34, -0.48);
  root.add(nexusBtn);

  // View & Menu micro buttons
  const microGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 20);
  disposables.push(microGeo);
  const viewBtn = registerMesh(new THREE.Mesh(microGeo, satinDarkMat.clone()), 'BTN_VIEW', new THREE.Vector3(0, -1, 0), 0.03);
  viewBtn.position.set(-0.28, 0.33, -0.14);
  const menuBtn = registerMesh(new THREE.Mesh(microGeo, satinDarkMat.clone()), 'BTN_MENU', new THREE.Vector3(0, -1, 0), 0.03);
  menuBtn.position.set(0.28, 0.33, -0.14);
  disposables.push(viewBtn.material as THREE.Material, menuBtn.material as THREE.Material);
  root.add(viewBtn, menuBtn);

  // LB / RB Bumpers & LT / RT Triggers cleanly proud of top bevel
  const bumperGeo = new THREE.BoxGeometry(0.74, 0.14, 0.18);
  const triggerGeo = new THREE.BoxGeometry(0.56, 0.22, 0.24);
  disposables.push(bumperGeo, triggerGeo);

  const lb = registerMesh(new THREE.Mesh(bumperGeo, satinDarkMat.clone()), 'BTN_LB', new THREE.Vector3(0, -0.5, 0.86), 0.055);
  lb.position.set(-1.0, 0.22, -0.98);
  lb.rotation.y = 0.15;

  const rb = registerMesh(new THREE.Mesh(bumperGeo, satinDarkMat.clone()), 'BTN_RB', new THREE.Vector3(0, -0.5, 0.86), 0.055);
  rb.position.set(1.0, 0.22, -0.98);
  rb.rotation.y = -0.15;

  const lt = registerMesh(new THREE.Mesh(triggerGeo, satinDarkMat.clone()), 'BTN_LT', new THREE.Vector3(0, -0.25, 0.96), 0.08);
  lt.position.set(-0.98, -0.02, -1.08);
  lt.rotation.set(0.35, 0.14, 0);

  const rt = registerMesh(new THREE.Mesh(triggerGeo, satinDarkMat.clone()), 'BTN_RT', new THREE.Vector3(0, -0.25, 0.96), 0.08);
  rt.position.set(0.98, -0.02, -1.08);
  rt.rotation.set(0.35, -0.14, 0);

  disposables.push(
    lb.material as THREE.Material,
    rb.material as THREE.Material,
    lt.material as THREE.Material,
    rt.material as THREE.Material,
  );
  root.add(lb, rb, lt, rt);

  root.rotation.x = 0.42;
  return { root, disposables };
}

/**
 * 3. Compact 65% Machined Aluminum Mechanical Gaming Keyboard
 */
function buildMechanicalKeyboard(maxAnisotropy: number): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'Keyboard_Mechanical_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  const brushedTex = createBrushedMetalTexture();
  const aluMat = new THREE.MeshPhysicalMaterial({
    color: 0x262d3c,
    metalness: 0.85,
    roughness: 0.24,
    bumpMap: brushedTex,
    bumpScale: 0.003,
    clearcoat: 0.35,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x0f131c,
    metalness: 0.5,
    roughness: 0.45,
  });
  const underglowMat = new THREE.MeshStandardMaterial({
    color: 0xd8b4fe,
    emissive: 0x8b5cf6,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  disposables.push(brushedTex, aluMat, plateMat, underglowMat);

  // Sculpted mechanical keycap layout (5 rows, each summing cleanly to 13.8 units)
  const unit = 0.275;
  const gap = 0.03;
  const totalGridW = 13.8 * unit;
  const totalGridD = 5 * (unit + 0.015) - 0.015;
  const startX = -totalGridW / 2;
  const startZ = -totalGridD / 2 + unit / 2;

  // Beveled CNC aluminum unibody frame sized symmetrically around the keycap grid
  const caseW = totalGridW + 0.28;
  const caseD = totalGridD + 0.26;
  const caseGeo = new THREE.ExtrudeGeometry(roundedRectShape(caseW, caseD, 0.12), {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 4,
  });
  caseGeo.center();
  disposables.push(caseGeo);

  const chassis = registerMesh(new THREE.Mesh(caseGeo, aluMat), 'KEYBOARD_CHASSIS');
  chassis.rotation.x = -Math.PI / 2;
  root.add(chassis);

  // Recessed switch plate
  const plateGeo = new THREE.BoxGeometry(totalGridW + 0.08, 0.04, totalGridD + 0.08);
  disposables.push(plateGeo);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.y = 0.155;
  root.add(plate);

  // Subtle front accent LED strip
  const stripGeo = new THREE.BoxGeometry(totalGridW, 0.028, 0.03);
  disposables.push(stripGeo);
  const strip = new THREE.Mesh(stripGeo, underglowMat);
  strip.position.set(0, -0.05, caseD / 2 + 0.03);
  root.add(strip);

  interface KeySpec {
    id: string;
    label: string;
    widthU: number;
    accent?: boolean;
  }

  const rows: KeySpec[][] = [
    [
      { id: 'KEY_ESC', label: 'ESC', widthU: 1, accent: true },
      { id: 'KEY_1', label: '1', widthU: 1 },
      { id: 'KEY_2', label: '2', widthU: 1 },
      { id: 'KEY_3', label: '3', widthU: 1 },
      { id: 'KEY_4', label: '4', widthU: 1 },
      { id: 'KEY_5', label: '5', widthU: 1 },
      { id: 'KEY_6', label: '6', widthU: 1 },
      { id: 'KEY_7', label: '7', widthU: 1 },
      { id: 'KEY_8', label: '8', widthU: 1 },
      { id: 'KEY_9', label: '9', widthU: 1 },
      { id: 'KEY_0', label: '0', widthU: 1 },
      { id: 'KEY_MINUS', label: '-', widthU: 1 },
      { id: 'KEY_BACKSPACE', label: 'BKSP', widthU: 1.8 },
    ],
    [
      { id: 'KEY_TAB', label: 'TAB', widthU: 1.45 },
      { id: 'KEY_Q', label: 'Q', widthU: 1 },
      { id: 'KEY_W', label: 'W', widthU: 1, accent: true },
      { id: 'KEY_E', label: 'E', widthU: 1 },
      { id: 'KEY_R', label: 'R', widthU: 1 },
      { id: 'KEY_T', label: 'T', widthU: 1 },
      { id: 'KEY_Y', label: 'Y', widthU: 1 },
      { id: 'KEY_U', label: 'U', widthU: 1 },
      { id: 'KEY_I', label: 'I', widthU: 1 },
      { id: 'KEY_O', label: 'O', widthU: 1 },
      { id: 'KEY_P', label: 'P', widthU: 1 },
      { id: 'KEY_LBRACKET', label: '[', widthU: 1 },
      { id: 'KEY_RBRACKET', label: ']', widthU: 1.35 },
    ],
    [
      { id: 'KEY_CAPS', label: 'CAPS', widthU: 1.75 },
      { id: 'KEY_A', label: 'A', widthU: 1, accent: true },
      { id: 'KEY_S', label: 'S', widthU: 1, accent: true },
      { id: 'KEY_D', label: 'D', widthU: 1, accent: true },
      { id: 'KEY_F', label: 'F', widthU: 1 },
      { id: 'KEY_G', label: 'G', widthU: 1 },
      { id: 'KEY_H', label: 'H', widthU: 1 },
      { id: 'KEY_J', label: 'J', widthU: 1 },
      { id: 'KEY_K', label: 'K', widthU: 1 },
      { id: 'KEY_L', label: 'L', widthU: 1 },
      { id: 'KEY_SEMI', label: ';', widthU: 1 },
      { id: 'KEY_ENTER', label: 'ENTER', widthU: 2.05 },
    ],
    [
      { id: 'KEY_SHIFT', label: 'SHIFT', widthU: 2.2 },
      { id: 'KEY_Z', label: 'Z', widthU: 1 },
      { id: 'KEY_X', label: 'X', widthU: 1 },
      { id: 'KEY_C', label: 'C', widthU: 1 },
      { id: 'KEY_V', label: 'V', widthU: 1 },
      { id: 'KEY_B', label: 'B', widthU: 1 },
      { id: 'KEY_N', label: 'N', widthU: 1 },
      { id: 'KEY_M', label: 'M', widthU: 1 },
      { id: 'KEY_COMMA', label: ',', widthU: 1 },
      { id: 'KEY_DOT', label: '.', widthU: 1 },
      { id: 'KEY_RSHIFT', label: 'SHIFT', widthU: 2.6 },
    ],
    [
      { id: 'KEY_CTRL', label: 'CTRL', widthU: 1.35 },
      { id: 'KEY_WIN', label: 'CMD', widthU: 1.25 },
      { id: 'KEY_ALT', label: 'ALT', widthU: 1.25 },
      { id: 'KEY_SPACE', label: 'SPACE', widthU: 5.85 },
      { id: 'KEY_RALT', label: 'ALT', widthU: 1.25 },
      { id: 'KEY_FN', label: 'FN', widthU: 1.25 },
      { id: 'KEY_RCTRL', label: 'CTRL', widthU: 1.6 },
    ],
  ];

  const keySideMatBase = new THREE.MeshStandardMaterial({
    color: 0x161b26,
    roughness: 0.62,
    metalness: 0.08,
  });
  disposables.push(keySideMatBase);

  rows.forEach((row, rIdx) => {
    let cursorX = startX;
    const z = startZ + rIdx * (unit + 0.015);
    for (const key of row) {
      const w = key.widthU * unit - gap;
      const d = unit - gap;
      const h = 0.13;
      const geo = new THREE.BoxGeometry(w, h, d);
      disposables.push(geo);

      const bgHex = key.accent ? '#283145' : '#1b2130';
      const fgHex = key.accent ? '#e2e8f0' : '#94a3b8';
      const tex = createKeycapLegendTexture(key.label, bgHex, fgHex, maxAnisotropy, key.widthU);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: 0.56,
        metalness: 0.05,
      });
      const sideMat = keySideMatBase.clone();
      disposables.push(tex, topMat, sideMat);

      const mesh = registerMesh(
        new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]),
        key.id,
        new THREE.Vector3(0, -1, 0),
        0.055,
      );
      mesh.position.set(cursorX + w / 2, 0.22, z);
      root.add(mesh);

      cursorX += key.widthU * unit;
    }
  });

  root.rotation.x = 0.36;
  return { root, disposables };
}

/**
 * 4. Aerodynamic Sculpted Gaming Mouse
 */
function buildGamingMouse(): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'Mouse_Gaming_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x202634,
    roughness: 0.34,
    metalness: 0.16,
    clearcoat: 0.52,
    clearcoatRoughness: 0.22,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x10131b,
    roughness: 0.6,
    metalness: 0.25,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.24,
  });
  const accentGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfed7aa,
    emissive: 0xf97316,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  disposables.push(shellMat, baseMat, wheelMat, accentGlowMat);

  // Lower base silhouette
  const footprint = new THREE.Shape();
  footprint.moveTo(0, 1.38);
  footprint.bezierCurveTo(0.72, 1.38, 0.88, 0.62, 0.8, -0.32);
  footprint.bezierCurveTo(0.76, -1.04, 0.56, -1.36, 0, -1.38);
  footprint.bezierCurveTo(-0.56, -1.36, -0.76, -1.04, -0.8, -0.32);
  footprint.bezierCurveTo(-0.88, 0.62, -0.72, 1.38, 0, 1.38);

  const baseGeo = new THREE.ExtrudeGeometry(footprint, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 5,
    curveSegments: 24,
  });
  baseGeo.center();
  disposables.push(baseGeo);
  const baseMesh = registerMesh(new THREE.Mesh(baseGeo, baseMat), 'MOUSE_BASE');
  baseMesh.rotation.x = -Math.PI / 2;
  baseMesh.position.y = -0.1;
  root.add(baseMesh);

  // Sculpted dorsal palm hump (ellipsoid dome)
  const humpGeo = new THREE.SphereGeometry(0.78, 36, 24);
  disposables.push(humpGeo);
  const hump = registerMesh(new THREE.Mesh(humpGeo, shellMat), 'MOUSE_PALM_SHELL');
  hump.scale.set(1.02, 0.68, 1.32);
  hump.position.set(0, 0.08, 0.34);
  root.add(hump);

  // Split cantilevered Left & Right Click Paddles (BTN_LMB, BTN_RMB)
  const paddleShape = roundedRectShape(0.62, 1.18, 0.14);
  const paddleGeo = new THREE.ExtrudeGeometry(paddleShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 4,
  });
  paddleGeo.center();
  disposables.push(paddleGeo);

  const lmbMat = shellMat.clone();
  const rmbMat = shellMat.clone();
  disposables.push(lmbMat, rmbMat);

  const lmb = registerMesh(new THREE.Mesh(paddleGeo, lmbMat), 'BTN_LMB', new THREE.Vector3(0, -1, 0), 0.048);
  lmb.rotation.set(-Math.PI / 2 + 0.18, 0, 0.04);
  lmb.position.set(-0.37, 0.34, -0.64);

  const rmb = registerMesh(new THREE.Mesh(paddleGeo, rmbMat), 'BTN_RMB', new THREE.Vector3(0, -1, 0), 0.048);
  rmb.rotation.set(-Math.PI / 2 + 0.18, 0, -0.04);
  rmb.position.set(0.37, 0.34, -0.64);
  root.add(lmb, rmb);

  // Knurled metallic scroll wheel (BTN_MMB)
  const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.11, 28);
  disposables.push(wheelGeo);
  const wheel = registerMesh(new THREE.Mesh(wheelGeo, wheelMat.clone()), 'BTN_MMB', new THREE.Vector3(0, -1, 0), 0.04);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, 0.38, -0.78);
  disposables.push(wheel.material as THREE.Material);
  root.add(wheel);

  // DPI cycle button
  const dpiGeo = new THREE.BoxGeometry(0.11, 0.06, 0.2);
  disposables.push(dpiGeo);
  const dpiBtn = registerMesh(new THREE.Mesh(dpiGeo, baseMat.clone()), 'BTN_DPI', new THREE.Vector3(0, -1, 0), 0.03);
  dpiBtn.position.set(0, 0.44, -0.4);
  disposables.push(dpiBtn.material as THREE.Material);
  root.add(dpiBtn);

  // Dual ergonomic thumb side buttons (BTN_SIDE_1, BTN_SIDE_2)
  const sideBtnGeo = new THREE.BoxGeometry(0.08, 0.11, 0.34);
  disposables.push(sideBtnGeo);

  const side1 = registerMesh(new THREE.Mesh(sideBtnGeo, wheelMat.clone()), 'BTN_SIDE_1', new THREE.Vector3(1, 0, 0), 0.04);
  side1.position.set(-0.82, 0.14, -0.26);
  side1.rotation.z = -0.15;

  const side2 = registerMesh(new THREE.Mesh(sideBtnGeo, wheelMat.clone()), 'BTN_SIDE_2', new THREE.Vector3(1, 0, 0), 0.04);
  side2.position.set(-0.82, 0.14, 0.16);
  side2.rotation.z = -0.15;

  disposables.push(side1.material as THREE.Material, side2.material as THREE.Material);
  root.add(side1, side2);

  // Rear subtle glowing tail light diffuser
  const arcGeo = new THREE.TorusGeometry(0.62, 0.02, 10, 32, Math.PI * 0.72);
  disposables.push(arcGeo);
  const rearGlow = new THREE.Mesh(arcGeo, accentGlowMat);
  rearGlow.rotation.x = Math.PI / 2;
  rearGlow.rotation.z = Math.PI * 0.14;
  rearGlow.position.set(0, -0.16, 0.8);
  root.add(rearGlow);

  root.rotation.set(0.18, -0.35, 0);
  return { root, disposables };
}

/**
 * 5. iPad Pro Space-Black Landscape Touch Gaming Studio Model
 */
function buildIpadPro(maxAnisotropy: number): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'iPad_Pro_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  const brushedTex = createBrushedMetalTexture();
  const screenTex = createIpadScreenTexture(maxAnisotropy);

  const spaceBlackAlu = new THREE.MeshPhysicalMaterial({
    color: 0x1e2430,
    metalness: 0.88,
    roughness: 0.22,
    bumpMap: brushedTex,
    bumpScale: 0.002,
    clearcoat: 0.4,
  });
  const bezelGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x070a10,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const screenMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: screenTex,
    roughness: 0.09,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    emissive: 0x0f1b2d,
    emissiveIntensity: 0.45,
  });
  disposables.push(brushedTex, screenTex, spaceBlackAlu, bezelGlassMat, screenMat);

  // Unibody aluminum enclosure
  const width = 4.1;
  const height = 2.86;
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(width, height, 0.22), {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 4,
  });
  bodyGeo.center();
  disposables.push(bodyGeo);
  const body = registerMesh(new THREE.Mesh(bodyGeo, spaceBlackAlu), 'IPAD_CHASSIS');
  body.rotation.x = -Math.PI / 2;
  root.add(body);

  // Front glass bezel layer
  const bezelGeo = new THREE.ExtrudeGeometry(roundedRectShape(width - 0.08, height - 0.08, 0.18), {
    depth: 0.015,
    bevelEnabled: false,
  });
  bezelGeo.center();
  disposables.push(bezelGeo);
  const bezel = new THREE.Mesh(bezelGeo, bezelGlassMat);
  bezel.rotation.x = -Math.PI / 2;
  bezel.position.y = 0.072;
  root.add(bezel);

  // Active OLED glass display surface
  const screenW = width - 0.34;
  const screenH = height - 0.34;
  const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
  disposables.push(screenGeo);
  const screenMesh = registerMesh(new THREE.Mesh(screenGeo, screenMat), 'IPAD_SCREEN', new THREE.Vector3(0, -1, 0), 0);
  screenMesh.rotation.x = -Math.PI / 2;
  screenMesh.position.y = 0.085;
  root.add(screenMesh);

  // Landscape front camera dot & side aluminum buttons
  const camGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.005, 16);
  const camMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.1, metalness: 0.6 });
  const sideBtnGeo = new THREE.BoxGeometry(0.24, 0.036, 0.03);
  disposables.push(camGeo, camMat, sideBtnGeo);

  const camDot = new THREE.Mesh(camGeo, camMat);
  camDot.position.set(0, 0.084, -height / 2 + 0.09);
  root.add(camDot);

  const volUp = new THREE.Mesh(sideBtnGeo, spaceBlackAlu);
  volUp.position.set(1.25, 0.01, -height / 2 - 0.03);
  const volDown = new THREE.Mesh(sideBtnGeo, spaceBlackAlu);
  volDown.position.set(0.92, 0.01, -height / 2 - 0.03);
  root.add(volUp, volDown);

  // Container anchored right above the OLED surface for 3D Touch Ripples
  const rippleContainer = new THREE.Group();
  rippleContainer.name = 'IPAD_RIPPLE_CONTAINER';
  rippleContainer.position.y = 0.095;
  root.add(rippleContainer);

  // Sleek Apple keynote display tilt
  root.rotation.x = 0.68;

  return {
    root,
    ipadScreenInfo: {
      width: screenW,
      height: screenH,
      surfaceY: 0.095,
      container: rippleContainer,
    },
    disposables,
  };
}

/**
 * 3. Unified PC Gaming Desk Setup (Mechanical Keyboard + Ergonomic Gaming Mouse side-by-side)
 */
export function buildPcKeyboardMouse(
  maxAnisotropy: number,
  customKeyboard?: THREE.Group,
  customMouse?: THREE.Group,
): BuiltDeviceModel {
  const root = new THREE.Group();
  root.name = 'PC_Keyboard_Mouse_Studio';
  const disposables: Array<{ dispose: () => void }> = [];

  // Sleek stitched dark-slate studio desk-mat unifying keyboard & mouse on one stage
  const matW = 5.45;
  const matD = 2.04;
  const matGeo = new THREE.ExtrudeGeometry(roundedRectShape(matW, matD, 0.16), {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 3,
  });
  matGeo.center();
  const deskMatMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x141925,
    roughness: 0.84,
    metalness: 0.08,
    clearcoat: 0.08,
  });
  const trimGeo = new THREE.ExtrudeGeometry(roundedRectShape(matW + 0.04, matD + 0.04, 0.17), {
    depth: 0.02,
    bevelEnabled: false,
  });
  trimGeo.center();
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x6366f1,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.65,
  });
  disposables.push(matGeo, deskMatMaterial, trimGeo, trimMat);

  const deskMat = registerMesh(new THREE.Mesh(matGeo, deskMatMaterial), 'PC_DESKMAT', new THREE.Vector3(0, -1, 0), 0);
  deskMat.rotation.x = -Math.PI / 2;
  deskMat.position.set(0, -0.055, 0);
  root.add(deskMat);

  const deskTrim = new THREE.Mesh(trimGeo, trimMat);
  deskTrim.rotation.x = -Math.PI / 2;
  deskTrim.position.set(0, -0.068, 0);
  root.add(deskTrim);

  // Left side: Mechanical Gaming Keyboard (procedural or custom GLB)
  if (customKeyboard) {
    customKeyboard.position.set(-0.76, -0.02, 0.02);
    root.add(customKeyboard);
  } else {
    const kb = buildMechanicalKeyboard(maxAnisotropy);
    kb.root.rotation.set(0, 0, 0);
    kb.root.scale.setScalar(0.86);
    kb.root.position.set(-0.76, 0.13, 0.02);
    root.add(kb.root);
    disposables.push(...kb.disposables);
  }

  // Right side: Sculpted Gaming Mouse (procedural or custom GLB)
  if (customMouse) {
    customMouse.position.set(1.88, -0.02, 0.04);
    root.add(customMouse);
  } else {
    const mouse = buildGamingMouse();
    mouse.root.rotation.set(0, -0.08, 0);
    mouse.root.scale.setScalar(0.56);
    mouse.root.position.set(1.88, 0.13, 0.04);
    root.add(mouse.root);
    disposables.push(...mouse.disposables);
  }

  // Unified studio hero tilt so both keycaps and mouse paddles face the camera cleanly
  root.rotation.x = 0.36;
  return { root, disposables };
}

export function buildProceduralDevice(
  deviceType: DeviceType,
  maxAnisotropy: number,
): BuiltDeviceModel {
  switch (deviceType) {
    case 'ps5':
      return buildPs5DualSense(maxAnisotropy);
    case 'xbox':
      return buildXboxSeriesX(maxAnisotropy);
    case 'pc':
      return buildPcKeyboardMouse(maxAnisotropy);
    case 'ipad':
      return buildIpadPro(maxAnisotropy);
  }
}
