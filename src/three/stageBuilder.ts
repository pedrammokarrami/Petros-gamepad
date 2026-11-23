import * as THREE from 'three';
import {
  createBrushedMetalTexture,
  createContactShadowTexture,
  createStudioFloorGridTexture,
} from './proceduralTextures';

interface ShockwaveSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  duration: number;
  maxScale: number;
}

export interface StudioStageSystem {
  group: THREE.Group;
  pedestalTopY: number;
  setNeonColor: (hex: string) => void;
  spawnShockwave: (hex: string) => void;
  update: (dt: number) => boolean;
  dispose: () => void;
}

const SHOCKWAVE_POOL_SIZE = 8;

export function createStudioStage(maxAnisotropy: number): StudioStageSystem {
  const group = new THREE.Group();
  group.name = 'StudioStage';

  const brushedTex = createBrushedMetalTexture();
  const floorGridTex = createStudioFloorGridTexture(maxAnisotropy);
  const shadowTex = createContactShadowTexture();

  const pedestalTopY = -0.78;
  const floorY = -1.04;

  // 1. Transparent shadow-catching floor so the 360° studio_small_09 HDRI room remains visible around the pedestal
  const floorGeo = new THREE.PlaneGeometry(42, 42);
  const floorMat = new THREE.ShadowMaterial({
    opacity: 0.42,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = floorY;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 2. Subtle faded studio grid overlay around pedestal (offset + polygonOffset to prevent Z-fighting)
  const gridGeo = new THREE.PlaneGeometry(14, 14);
  const gridMat = new THREE.MeshBasicMaterial({
    map: floorGridTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const gridMesh = new THREE.Mesh(gridGeo, gridMat);
  gridMesh.rotation.x = -Math.PI / 2;
  gridMesh.position.y = floorY + 0.022;
  group.add(gridMesh);

  // 3. Sculpted circular dark-silver studio pedestal via LatheGeometry
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(2.65, 0.0),
    new THREE.Vector2(2.58, 0.06),
    new THREE.Vector2(2.42, 0.09),
    new THREE.Vector2(2.34, 0.22),
    new THREE.Vector2(2.24, 0.26),
    new THREE.Vector2(0.0, 0.26),
  ];
  const pedestalGeo = new THREE.LatheGeometry(profile, 72);
  const pedestalMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d2330,
    metalness: 0.84,
    roughness: 0.22,
    clearcoat: 0.55,
    clearcoatRoughness: 0.16,
    bumpMap: brushedTex,
    bumpScale: 0.004,
  });
  const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestalMesh.position.y = floorY;
  pedestalMesh.receiveShadow = true;
  pedestalMesh.castShadow = true;
  group.add(pedestalMesh);

  // Inner satin obsidian top inlay disc
  const topInlayGeo = new THREE.CylinderGeometry(2.12, 2.12, 0.014, 64);
  const topInlayMat = new THREE.MeshPhysicalMaterial({
    color: 0x121620,
    metalness: 0.42,
    roughness: 0.32,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
  });
  const topInlay = new THREE.Mesh(topInlayGeo, topInlayMat);
  topInlay.position.y = pedestalTopY + 0.004;
  topInlay.receiveShadow = true;
  group.add(topInlay);

  // 4. Subtle neon rim ring seated around the pedestal perimeter
  const neonGeo = new THREE.TorusGeometry(2.36, 0.018, 16, 96);
  const neonColor = new THREE.Color('#3b82f6');
  const neonTargetColor = new THREE.Color('#3b82f6');
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: neonColor.clone(),
    emissiveIntensity: 1.38,
    roughness: 0.22,
    metalness: 0.1,
  });
  const neonRing = new THREE.Mesh(neonGeo, neonMat);
  neonRing.rotation.x = Math.PI / 2;
  neonRing.position.y = floorY + 0.12;
  group.add(neonRing);

  // Secondary recessed hairline chrome accent ring
  const trimRingGeo = new THREE.TorusGeometry(2.14, 0.01, 12, 96);
  const trimRingMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.18,
  });
  const trimRing = new THREE.Mesh(trimRingGeo, trimRingMat);
  trimRing.rotation.x = Math.PI / 2;
  trimRing.position.y = pedestalTopY + 0.012;
  group.add(trimRing);

  // 5. Soft radial contact shadow directly beneath the device on the pedestal
  const contactGeo = new THREE.CircleGeometry(1.75, 48);
  const contactMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });
  const contactMesh = new THREE.Mesh(contactGeo, contactMat);
  contactMesh.rotation.x = -Math.PI / 2;
  contactMesh.position.y = pedestalTopY + 0.018;
  group.add(contactMesh);

  // 6. Pooled floor Shockwave Rings triggered on every button press
  const shockwaveGeo = new THREE.RingGeometry(0.86, 1.0, 64);
  const shockwaves: ShockwaveSlot[] = [];

  for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(shockwaveGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = floorY + 0.036 + i * 0.001;
    mesh.visible = false;
    group.add(mesh);

    shockwaves.push({
      mesh,
      material: mat,
      active: false,
      age: 0,
      duration: 0.95,
      maxScale: 7.4,
    });
  }

  let nextSlot = 0;

  function setNeonColor(hex: string) {
    neonTargetColor.set(hex);
  }

  function spawnShockwave(hex: string) {
    const slot = shockwaves[nextSlot];
    nextSlot = (nextSlot + 1) % SHOCKWAVE_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.95;
    slot.maxScale = 7.6;
    slot.material.color.set(hex);
    slot.material.opacity = 0.85;
    slot.mesh.scale.setScalar(2.35);
    slot.mesh.visible = true;

    // Gently flash the pedestal rim toward the pressed button's accent color
    neonTargetColor.set(hex);
  }

  function update(dt: number): boolean {
    let anyActive = false;

    // Smoothly damp neon rim color
    const colorDelta = Math.abs(neonMat.emissive.r - neonTargetColor.r) +
      Math.abs(neonMat.emissive.g - neonTargetColor.g) +
      Math.abs(neonMat.emissive.b - neonTargetColor.b);

    if (colorDelta > 0.004) {
      const alpha = 1 - Math.exp(-7 * dt);
      neonMat.emissive.lerp(neonTargetColor, alpha);
      anyActive = true;
    }

    for (const slot of shockwaves) {
      if (!slot.active) continue;
      slot.age += dt;
      const t = slot.age / slot.duration;
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.material.opacity = 0;
        continue;
      }
      const easeOut = 1 - Math.pow(1 - t, 3);
      const scale = 2.35 + (slot.maxScale - 2.35) * easeOut;
      slot.mesh.scale.setScalar(scale);
      slot.material.opacity = Math.pow(1 - t, 1.8) * 0.72;
      anyActive = true;
    }

    return anyActive;
  }

  function dispose() {
    brushedTex.dispose();
    floorGridTex.dispose();
    shadowTex.dispose();
    floorGeo.dispose();
    floorMat.dispose();
    gridGeo.dispose();
    gridMat.dispose();
    pedestalGeo.dispose();
    pedestalMat.dispose();
    topInlayGeo.dispose();
    topInlayMat.dispose();
    neonGeo.dispose();
    neonMat.dispose();
    trimRingGeo.dispose();
    trimRingMat.dispose();
    contactGeo.dispose();
    contactMat.dispose();
    shockwaveGeo.dispose();
    for (const s of shockwaves) {
      s.material.dispose();
    }
  }

  return {
    group,
    pedestalTopY,
    setNeonColor,
    spawnShockwave,
    update,
    dispose,
  };
}
