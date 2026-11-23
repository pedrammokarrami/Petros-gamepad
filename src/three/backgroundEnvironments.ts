import * as THREE from 'three';
import type { DeviceType } from '../types/trainer';

export interface BuiltBackgroundEnvironment {
  root: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
  /** Optional subtle ambient accent ring/elements animated gently in render loop */
  accentGroup?: THREE.Object3D;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const radius = Math.min(r, w / 2, h / 2);
  s.moveTo(x + radius, y);
  s.lineTo(x + w - radius, y);
  s.quadraticCurveTo(x + w, y, x + w, y + radius);
  s.lineTo(x + w, y + h - radius);
  s.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  s.lineTo(x + radius, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - radius);
  s.lineTo(x, y + radius);
  s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

/**
 * 1. PlayStation 5 Hardware Diorama:
 *    - Right: Sculpted PlayStation 5 Console (flared matte-white V-wings, glossy obsidian core, twin blue LED intakes)
 *    - Left: Sculpted PlayStation Geometric Totem (floating Triangle / Circle / Cross / Square studio emblems)
 */
function buildPlayStationBackground(): BuiltBackgroundEnvironment {
  const root = new THREE.Group();
  root.name = 'BG_PlayStation5_Diorama';
  const disposables: Array<{ dispose: () => void }> = [];

  const whiteShellMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf0f8,
    roughness: 0.32,
    metalness: 0.06,
    clearcoat: 0.38,
    clearcoatRoughness: 0.26,
  });
  const glossyCoreMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d111a,
    roughness: 0.14,
    metalness: 0.24,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x161c28,
    roughness: 0.42,
    metalness: 0.52,
  });
  const blueLedMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    emissive: 0x2563eb,
    emissiveIntensity: 1.9,
    roughness: 0.2,
  });
  disposables.push(whiteShellMat, glossyCoreMat, baseMat, blueLedMat);

  // --- RIGHT HERO: Sculpted PlayStation 5 Console ---
  const ps5Group = new THREE.Group();
  ps5Group.position.set(4.15, 0, 0.1);
  ps5Group.rotation.y = -0.48;
  ps5Group.scale.setScalar(0.62);

  const standGeo = new THREE.CylinderGeometry(1.12, 1.24, 0.14, 48);
  disposables.push(standGeo);
  const stand = new THREE.Mesh(standGeo, baseMat);
  stand.position.y = 0.07;
  ps5Group.add(stand);

  const coreShape = roundedRectShape(0.84, 3.82, 0.24);
  const coreGeo = new THREE.ExtrudeGeometry(coreShape, {
    depth: 1.5,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.08,
    bevelSegments: 5,
  });
  coreGeo.center();
  disposables.push(coreGeo);
  const core = new THREE.Mesh(coreGeo, glossyCoreMat);
  core.position.set(0, 2.04, 0);
  ps5Group.add(core);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.08, 0);
  wingShape.lineTo(0.14, 0);
  wingShape.bezierCurveTo(0.18, 1.35, 0.24, 2.75, 0.46, 4.12);
  wingShape.lineTo(0.22, 4.18);
  wingShape.bezierCurveTo(0.02, 2.8, -0.05, 1.4, -0.08, 0);

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 1.82,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 4,
  });
  wingGeo.translate(0, 0, -0.91);
  disposables.push(wingGeo);

  const rightWing = new THREE.Mesh(wingGeo, whiteShellMat);
  rightWing.position.set(0.46, 0.12, 0.02);
  const leftWing = new THREE.Mesh(wingGeo, whiteShellMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.46, 0.12, 0.02);
  ps5Group.add(rightWing, leftWing);

  const discBulgeGeo = new THREE.CapsuleGeometry(0.18, 1.52, 8, 16);
  disposables.push(discBulgeGeo);
  const discBulge = new THREE.Mesh(discBulgeGeo, whiteShellMat);
  discBulge.position.set(0.66, 1.12, 0.16);
  discBulge.rotation.z = -0.04;
  ps5Group.add(discBulge);

  const ledGeo = new THREE.BoxGeometry(0.052, 2.45, 0.1);
  disposables.push(ledGeo);
  const leftLed = new THREE.Mesh(ledGeo, blueLedMat);
  leftLed.position.set(-0.47, 2.68, 0.84);
  leftLed.rotation.z = 0.065;
  const rightLed = new THREE.Mesh(ledGeo, blueLedMat);
  rightLed.position.set(0.47, 2.68, 0.84);
  rightLed.rotation.z = -0.065;
  ps5Group.add(leftLed, rightLed);

  root.add(ps5Group);

  // --- LEFT COMPANION: Sculpted PlayStation Iconic Geometric Emblem Stand ---
  const leftGroup = new THREE.Group();
  leftGroup.position.set(-4.1, 0, -0.05);
  leftGroup.rotation.y = 0.42;
  leftGroup.scale.setScalar(0.86);

  const plinthGeo = new THREE.CylinderGeometry(0.95, 1.06, 0.12, 48);
  const archGeo = new THREE.TorusGeometry(1.18, 0.055, 16, 64, Math.PI);
  disposables.push(plinthGeo, archGeo);

  const plinth = new THREE.Mesh(plinthGeo, baseMat);
  plinth.position.y = 0.06;
  const arch = new THREE.Mesh(archGeo, whiteShellMat);
  arch.position.set(0, 1.32, 0);
  leftGroup.add(plinth, arch);

  // Floating iconic PlayStation symbols (Triangle, Circle, Cross, Square)
  const accentGroup = new THREE.Group();
  accentGroup.position.set(0, 1.48, 0.18);

  const symColors = [0x34d399, 0xf87171, 0x60a5fa, 0xf472b6];
  const symMats = symColors.map((hex) => {
    const m = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.95,
      roughness: 0.25,
      metalness: 0.4,
    });
    disposables.push(m);
    return m;
  });

  // Triangle
  const triGeo = new THREE.TorusGeometry(0.24, 0.04, 10, 3);
  const triMesh = new THREE.Mesh(triGeo, symMats[0]);
  triMesh.position.set(0, 0.56, 0);
  triMesh.rotation.z = Math.PI / 6;

  // Circle
  const cirGeo = new THREE.TorusGeometry(0.22, 0.04, 12, 32);
  const cirMesh = new THREE.Mesh(cirGeo, symMats[1]);
  cirMesh.position.set(0.56, 0, 0);

  // Cross (two intersecting bars)
  const barGeo = new THREE.BoxGeometry(0.44, 0.075, 0.075);
  const crossGroup = new THREE.Group();
  crossGroup.position.set(0, -0.56, 0);
  const bar1 = new THREE.Mesh(barGeo, symMats[2]);
  bar1.rotation.z = Math.PI / 4;
  const bar2 = new THREE.Mesh(barGeo, symMats[2]);
  bar2.rotation.z = -Math.PI / 4;
  crossGroup.add(bar1, bar2);

  // Square
  const sqGeo = new THREE.TorusGeometry(0.24, 0.04, 10, 4);
  const sqMesh = new THREE.Mesh(sqGeo, symMats[3]);
  sqMesh.position.set(-0.56, 0, 0);
  sqMesh.rotation.z = Math.PI / 4;

  disposables.push(triGeo, cirGeo, barGeo, sqGeo);
  accentGroup.add(triMesh, cirMesh, crossGroup, sqMesh);
  leftGroup.add(accentGroup);

  root.add(leftGroup);

  return { root, disposables, accentGroup };
}

/**
 * 2. Xbox Ecosystem Hardware Diorama:
 *    - Right: Xbox Series X Vertical Monolith Tower (matte obsidian + glowing concave emerald top exhaust + white LED)
 *    - Left: Xbox Series S Companion Console (matte robot-white monolith + signature circular matte-black vent grille)
 */
function buildXboxBackground(): BuiltBackgroundEnvironment {
  const root = new THREE.Group();
  root.name = 'BG_Xbox_Diorama';
  const disposables: Array<{ dispose: () => void }> = [];

  const obsidianMat = new THREE.MeshPhysicalMaterial({
    color: 0x161b24,
    roughness: 0.54,
    metalness: 0.16,
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
  });
  const robotWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8edf4,
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.22,
  });
  const darkVentMat = new THREE.MeshStandardMaterial({
    color: 0x0d1017,
    roughness: 0.65,
    metalness: 0.25,
  });
  const xboxGreenMat = new THREE.MeshStandardMaterial({
    color: 0x86efac,
    emissive: 0x16a34a,
    emissiveIntensity: 2.1,
    roughness: 0.22,
  });
  const powerLedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe2e8f0,
    emissiveIntensity: 1.5,
    roughness: 0.15,
  });
  disposables.push(obsidianMat, robotWhiteMat, darkVentMat, xboxGreenMat, powerLedMat);

  // --- RIGHT HERO: Xbox Series X Vertical Monolith ---
  const xsxGroup = new THREE.Group();
  xsxGroup.position.set(4.1, 0, 0.1);
  xsxGroup.rotation.y = -0.54;
  xsxGroup.scale.setScalar(0.58);

  const baseGeo = new THREE.CylinderGeometry(1.18, 1.26, 0.12, 48);
  const bodyShape = roundedRectShape(1.92, 1.92, 0.09);
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 3.75,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 4,
  });
  bodyGeo.center();
  disposables.push(baseGeo, bodyGeo);

  const base = new THREE.Mesh(baseGeo, darkVentMat);
  base.position.y = 0.06;
  const body = new THREE.Mesh(bodyGeo, obsidianMat);
  body.rotation.x = -Math.PI / 2;
  body.position.y = 1.98;
  xsxGroup.add(base, body);

  // Iconic concave glowing emerald green top exhaust vent
  const glowDishGeo = new THREE.CylinderGeometry(0.78, 0.64, 0.05, 36);
  const topRimGeo = new THREE.RingGeometry(0.74, 0.96, 40);
  const louver1Geo = new THREE.TorusGeometry(0.56, 0.036, 10, 32);
  const louver2Geo = new THREE.TorusGeometry(0.32, 0.036, 10, 24);
  disposables.push(glowDishGeo, topRimGeo, louver1Geo, louver2Geo);

  const glowDish = new THREE.Mesh(glowDishGeo, xboxGreenMat);
  glowDish.position.y = 3.9;
  const topRim = new THREE.Mesh(topRimGeo, obsidianMat);
  topRim.rotation.x = -Math.PI / 2;
  topRim.position.y = 3.93;
  const louver1 = new THREE.Mesh(louver1Geo, obsidianMat);
  louver1.rotation.x = Math.PI / 2;
  louver1.position.y = 3.93;
  const louver2 = new THREE.Mesh(louver2Geo, obsidianMat);
  louver2.rotation.x = Math.PI / 2;
  louver2.position.y = 3.93;
  xsxGroup.add(glowDish, topRim, louver1, louver2);

  // White Xbox power button + optical disc slot
  const powerGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.025, 24);
  const slotGeo = new THREE.BoxGeometry(0.036, 0.92, 0.025);
  disposables.push(powerGeo, slotGeo);
  const powerBtn = new THREE.Mesh(powerGeo, powerLedMat);
  powerBtn.rotation.x = Math.PI / 2;
  powerBtn.position.set(-0.62, 3.45, 1.01);
  const discSlot = new THREE.Mesh(slotGeo, darkVentMat);
  discSlot.position.set(-0.74, 0.9, 1.01);
  xsxGroup.add(powerBtn, discSlot);

  root.add(xsxGroup);

  // --- LEFT COMPANION: Xbox Series S Compact White Console + Emerald Halo ---
  const xssGroup = new THREE.Group();
  xssGroup.position.set(-4.1, 0, -0.05);
  xssGroup.rotation.y = 0.44;
  xssGroup.scale.setScalar(0.86);

  const xssBodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.42, 2.28, 0.08), {
    depth: 0.54,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 4,
  });
  xssBodyGeo.center();
  const ventCircleGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.03, 40);
  const xssPowerGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20);
  const xssHaloGeo = new THREE.TorusGeometry(1.16, 0.022, 14, 64);
  disposables.push(xssBodyGeo, ventCircleGeo, xssPowerGeo, xssHaloGeo);

  const xssBody = new THREE.Mesh(xssBodyGeo, robotWhiteMat);
  xssBody.position.y = 1.18;
  const ventCircle = new THREE.Mesh(ventCircleGeo, darkVentMat);
  ventCircle.rotation.x = Math.PI / 2;
  ventCircle.position.set(0, 1.62, 0.3);
  const xssPower = new THREE.Mesh(xssPowerGeo, powerLedMat);
  xssPower.rotation.x = Math.PI / 2;
  xssPower.position.set(-0.48, 0.44, 0.3);
  xssGroup.add(xssBody, ventCircle, xssPower);

  const accentGroup = new THREE.Group();
  const xssHalo = new THREE.Mesh(xssHaloGeo, xboxGreenMat);
  xssHalo.position.set(0, 1.45, -0.45);
  accentGroup.add(xssHalo);
  xssGroup.add(accentGroup);

  root.add(xssGroup);

  return { root, disposables, accentGroup };
}

/**
 * 3. Flagship Gaming PC Setup 3D Diorama:
 *    - Left-Center: 34" Curved Ultrawide Studio Monitor on anodized aluminum stand
 *    - Right: Tempered-Glass ATX Gaming PC Tower with triple glowing RGB intake fans & cyan GPU bar
 */
function buildPcBackground(): BuiltBackgroundEnvironment {
  const root = new THREE.Group();
  root.name = 'BG_PC_GamingRig';
  const disposables: Array<{ dispose: () => void }> = [];

  const gunmetalMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b2130,
    roughness: 0.34,
    metalness: 0.78,
    clearcoat: 0.3,
  });
  const screenGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1220,
    emissive: 0x1e1b4b,
    emissiveIntensity: 0.45,
    roughness: 0.1,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const glassSideMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.44,
    clearcoat: 1.0,
  });
  const violetGlowMat = new THREE.MeshStandardMaterial({
    color: 0xc4b5fd,
    emissive: 0x7c3aed,
    emissiveIntensity: 1.75,
    roughness: 0.2,
  });
  const cyanGlowMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  disposables.push(gunmetalMat, screenGlassMat, glassSideMat, violetGlowMat, cyanGlowMat);

  // --- Left-Center: 34" Ultrawide Curved Studio Monitor (proportioned to sit 100% below top HUD) ---
  const monitorGroup = new THREE.Group();
  monitorGroup.position.set(-2.35, 0, -0.45);
  monitorGroup.rotation.y = 0.28;
  monitorGroup.scale.setScalar(0.76);

  const basePlateGeo = new THREE.BoxGeometry(1.75, 0.08, 0.9);
  const neckGeo = new THREE.BoxGeometry(0.24, 1.35, 0.16);
  disposables.push(basePlateGeo, neckGeo);
  const basePlate = new THREE.Mesh(basePlateGeo, gunmetalMat);
  basePlate.position.set(0, 0.04, 0.1);
  const neck = new THREE.Mesh(neckGeo, gunmetalMat);
  neck.position.set(0, 0.72, -0.16);
  neck.rotation.x = 0.12;
  monitorGroup.add(basePlate, neck);

  const centerPanelGeo = new THREE.BoxGeometry(2.25, 1.58, 0.1);
  const centerScreenGeo = new THREE.PlaneGeometry(2.14, 1.46);
  const wingPanelGeo = new THREE.BoxGeometry(1.12, 1.58, 0.1);
  const wingScreenGeo = new THREE.PlaneGeometry(1.06, 1.46);
  disposables.push(centerPanelGeo, centerScreenGeo, wingPanelGeo, wingScreenGeo);

  const centerPanel = new THREE.Mesh(centerPanelGeo, gunmetalMat);
  centerPanel.position.set(0, 2.04, 0);
  const centerScreen = new THREE.Mesh(centerScreenGeo, screenGlassMat);
  centerScreen.position.set(0, 2.04, 0.056);
  monitorGroup.add(centerPanel, centerScreen);

  const leftPanelGroup = new THREE.Group();
  leftPanelGroup.position.set(-1.12, 2.04, 0);
  leftPanelGroup.rotation.y = 0.22;
  const lpBody = new THREE.Mesh(wingPanelGeo, gunmetalMat);
  lpBody.position.x = -0.54;
  const lpScreen = new THREE.Mesh(wingScreenGeo, screenGlassMat);
  lpScreen.position.set(-0.54, 0, 0.056);
  leftPanelGroup.add(lpBody, lpScreen);

  const rightPanelGroup = new THREE.Group();
  rightPanelGroup.position.set(1.12, 2.04, 0);
  rightPanelGroup.rotation.y = -0.22;
  const rpBody = new THREE.Mesh(wingPanelGeo, gunmetalMat);
  rpBody.position.x = 0.54;
  const rpScreen = new THREE.Mesh(wingScreenGeo, screenGlassMat);
  rpScreen.position.set(0.54, 0, 0.056);
  rightPanelGroup.add(rpBody, rpScreen);

  // Subtle glowing dual-accent display bars on monitor face
  const chinGlowGeo = new THREE.BoxGeometry(1.5, 0.035, 0.03);
  const hudLineGeo = new THREE.BoxGeometry(1.2, 0.025, 0.02);
  disposables.push(chinGlowGeo, hudLineGeo);
  const chinGlow = new THREE.Mesh(chinGlowGeo, violetGlowMat);
  chinGlow.position.set(0, 1.32, 0.065);
  const hudLine = new THREE.Mesh(hudLineGeo, cyanGlowMat);
  hudLine.position.set(0, 2.15, 0.065);

  monitorGroup.add(leftPanelGroup, rightPanelGroup, chinGlow, hudLine);
  root.add(monitorGroup);

  // --- Right Side: Flagship Tempered-Glass ATX Gaming PC Tower ---
  const towerGroup = new THREE.Group();
  towerGroup.position.set(4.15, 0, 0.15);
  towerGroup.rotation.y = -0.44;
  towerGroup.scale.setScalar(0.72);

  const towerFrameGeo = new THREE.BoxGeometry(1.38, 3.25, 2.05);
  const glassFrontGeo = new THREE.PlaneGeometry(1.24, 3.06);
  const fanRingGeo = new THREE.TorusGeometry(0.32, 0.038, 12, 32);
  const gpuBarGeo = new THREE.BoxGeometry(0.88, 0.065, 0.14);
  disposables.push(towerFrameGeo, glassFrontGeo, fanRingGeo, gpuBarGeo);

  const towerBody = new THREE.Mesh(towerFrameGeo, gunmetalMat);
  towerBody.position.y = 1.66;
  towerGroup.add(towerBody);

  const frontGlass = new THREE.Mesh(glassFrontGeo, glassSideMat);
  frontGlass.position.set(0, 1.66, 1.04);
  towerGroup.add(frontGlass);

  const accentGroup = new THREE.Group();
  for (const fy of [0.8, 1.66, 2.52]) {
    const fan = new THREE.Mesh(fanRingGeo, violetGlowMat);
    fan.position.set(0, fy, 1.06);
    accentGroup.add(fan);
  }
  const gpuBar = new THREE.Mesh(gpuBarGeo, cyanGlowMat);
  gpuBar.position.set(-0.7, 1.5, 0.25);
  gpuBar.rotation.y = Math.PI / 2;
  accentGroup.add(gpuBar);

  towerGroup.add(accentGroup);
  root.add(towerGroup);

  return { root, disposables, accentGroup };
}

/**
 * 4. iOS Ecosystem 3D Diorama:
 *    - Right: Natural Titanium iPhone Pro showcasing the precision-milled Triple-Lens Sapphire Camera Plateau
 *    - Left: Sculpted Brushed-Titanium Spatial Audio / VisionOS Arch + Dual Glowing Cyan Halo Rings
 */
function buildIosBackground(): BuiltBackgroundEnvironment {
  const root = new THREE.Group();
  root.name = 'BG_iOS_Diorama';
  const disposables: Array<{ dispose: () => void }> = [];

  const titaniumMat = new THREE.MeshPhysicalMaterial({
    color: 0xb2bac6,
    roughness: 0.24,
    metalness: 0.88,
    clearcoat: 0.35,
  });
  const frostedBackMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b4252,
    roughness: 0.38,
    metalness: 0.28,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
  });
  const cameraIslandMat = new THREE.MeshPhysicalMaterial({
    color: 0x262c38,
    roughness: 0.16,
    metalness: 0.32,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06,
  });
  const lensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x050914,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.55,
    roughness: 0.04,
    metalness: 0.2,
    clearcoat: 1.0,
  });
  const chromeLensRingMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.94,
  });
  const flashMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1c2230,
    roughness: 0.4,
    metalness: 0.65,
  });
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.55,
  });
  disposables.push(
    titaniumMat,
    frostedBackMat,
    cameraIslandMat,
    lensGlassMat,
    chromeLensRingMat,
    flashMat,
    baseMat,
    haloMat,
  );

  // --- RIGHT HERO: Natural Titanium iPhone Pro ---
  const phoneStandGroup = new THREE.Group();
  phoneStandGroup.position.set(4.2, 0, 0.1);
  phoneStandGroup.rotation.y = -0.46;
  phoneStandGroup.scale.setScalar(0.58);

  const baseGeo = new THREE.CylinderGeometry(1.15, 1.25, 0.1, 48);
  disposables.push(baseGeo);
  const stand = new THREE.Mesh(baseGeo, baseMat);
  stand.position.y = 0.05;
  phoneStandGroup.add(stand);

  const phoneGroup = new THREE.Group();
  phoneGroup.position.set(0, 2.26, 0);
  phoneGroup.rotation.set(0.05, 0, 0.04);

  const frameGeo = new THREE.ExtrudeGeometry(roundedRectShape(2.06, 4.12, 0.34), {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 5,
  });
  frameGeo.center();
  const backPanelGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.94, 4.0, 0.3), {
    depth: 0.04,
    bevelEnabled: false,
  });
  backPanelGeo.center();
  disposables.push(frameGeo, backPanelGeo);

  const frameMesh = new THREE.Mesh(frameGeo, titaniumMat);
  const backMesh = new THREE.Mesh(backPanelGeo, frostedBackMat);
  backMesh.position.z = 0.125;
  phoneGroup.add(frameMesh, backMesh);

  // Iconic Triple-Lens Pro Camera Plateau (100% unobstructed!)
  const islandGeo = new THREE.ExtrudeGeometry(roundedRectShape(0.96, 0.98, 0.22), {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 4,
  });
  islandGeo.center();
  const ringGeo = new THREE.CylinderGeometry(0.21, 0.22, 0.07, 32);
  const glassGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 28);
  const sensorGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 24);
  disposables.push(islandGeo, ringGeo, glassGeo, sensorGeo);

  const island = new THREE.Mesh(islandGeo, cameraIslandMat);
  island.position.set(-0.44, 1.4, 0.18);
  phoneGroup.add(island);

  const lensCoords: Array<[number, number]> = [
    [-0.66, 1.62],
    [-0.66, 1.18],
    [-0.22, 1.4],
  ];
  for (const [lx, ly] of lensCoords) {
    const ring = new THREE.Mesh(ringGeo, chromeLensRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(lx, ly, 0.23);
    const glass = new THREE.Mesh(glassGeo, lensGlassMat);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(lx, ly, 0.235);
    phoneGroup.add(ring, glass);
  }

  const flash = new THREE.Mesh(sensorGeo, flashMat);
  flash.rotation.x = Math.PI / 2;
  flash.position.set(-0.22, 1.7, 0.22);
  const lidar = new THREE.Mesh(sensorGeo, lensGlassMat);
  lidar.rotation.x = Math.PI / 2;
  lidar.position.set(-0.22, 1.1, 0.22);
  phoneGroup.add(flash, lidar);

  phoneStandGroup.add(phoneGroup);
  root.add(phoneStandGroup);

  // --- LEFT COMPANION: Sculpted Titanium VisionOS / Spatial Glass Monument ---
  const leftGroup = new THREE.Group();
  leftGroup.position.set(-4.15, 0, -0.05);
  leftGroup.rotation.y = 0.42;
  leftGroup.scale.setScalar(0.88);

  const leftPlinthGeo = new THREE.CylinderGeometry(0.88, 0.98, 0.1, 48);
  const visorGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.52, 0.74, 0.34), {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 5,
  });
  visorGeo.center();
  const outerHaloGeo = new THREE.TorusGeometry(1.18, 0.026, 16, 72);
  const innerHaloGeo = new THREE.TorusGeometry(0.92, 0.016, 14, 60);
  disposables.push(leftPlinthGeo, visorGeo, outerHaloGeo, innerHaloGeo);

  const leftPlinth = new THREE.Mesh(leftPlinthGeo, baseMat);
  leftPlinth.position.y = 0.05;
  const visor = new THREE.Mesh(visorGeo, cameraIslandMat);
  visor.position.set(0, 1.48, 0.06);
  const visorFrame = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.04, 12, 48),
    titaniumMat,
  );
  disposables.push(visorFrame.geometry);
  visorFrame.scale.set(1.22, 0.68, 1);
  visorFrame.position.set(0, 1.48, 0.14);
  leftGroup.add(leftPlinth, visor, visorFrame);

  const accentGroup = new THREE.Group();
  accentGroup.position.set(0, 1.48, -0.25);
  const outerHalo = new THREE.Mesh(outerHaloGeo, haloMat);
  const innerHalo = new THREE.Mesh(innerHaloGeo, haloMat);
  innerHalo.rotation.x = 0.35;
  accentGroup.add(outerHalo, innerHalo);
  leftGroup.add(accentGroup);

  root.add(leftGroup);

  return { root, disposables, accentGroup };
}

export function buildBackgroundEnvironment(device: DeviceType): BuiltBackgroundEnvironment {
  switch (device) {
    case 'ps5':
      return buildPlayStationBackground();
    case 'xbox':
      return buildXboxBackground();
    case 'pc':
      return buildPcBackground();
    case 'ipad':
      return buildIosBackground();
  }
}
