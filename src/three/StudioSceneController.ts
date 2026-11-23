import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  DeviceAnchorMap,
  DeviceMeshMapping,
  DeviceType,
  GlbTransform,
  PcGlbSlot,
  SelectedMeshInfo,
  SequenceEvent,
  SurfaceAnchor,
  TrainingSequence,
} from '../types/trainer';
import { DEVICE_BUTTONS, DEVICE_PLATFORMS } from '../data/devices';
import {
  createSpring3DState,
  evaluateTimelineFrame,
  type Spring3DState,
  type SpringState,
  stepSpring1D,
  stepSpring3D,
} from '../core/sequenceEngine';
import { findButtonForMesh, resolveTargetMeshName } from '../core/meshMapping';
import {
  computeAutoGlbTransform,
  createDefaultGlbTransform,
  type GlbMeshHint,
} from '../core/glbPlacement';
import { buildPcKeyboardMouse, buildProceduralDevice } from './deviceBuilders';
import { createStudioStage, type StudioStageSystem } from './stageBuilder';

interface AnimatedMeshState {
  mesh: THREE.Mesh;
  basePosition: THREE.Vector3;
  pressAxis: THREE.Vector3;
  pressDistance: number;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
  baseEmissiveIntensity: number[];
  currentPress: number;
}

interface TouchRippleSlot {
  group: THREE.Group;
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  coreDot: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  innerMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  duration: number;
}

interface AnchorPinVisual {
  group: THREE.Group;
  backingDisc: THREE.Mesh;
  outerRing: THREE.Mesh;
  coreDot: THREE.Mesh;
  pulseRing: THREE.Mesh;
  backingMat: THREE.MeshBasicMaterial;
  outerMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  pulseMat: THREE.MeshBasicMaterial;
  pulsePhase: number;
}

export interface SceneControllerCallbacks {
  onTimeUpdate: (timeMs: number, activeEvents: SequenceEvent[]) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onMeshSelected: (info: SelectedMeshInfo | null) => void;
  onMeshHovered: (meshName: string | null) => void;
  onModelLoaded: (
    device: DeviceType,
    fileName: string,
    meshCount: number,
    autoTransform?: GlbTransform,
    isRestore?: boolean,
  ) => void;
  onModelError: (message: string) => void;
}

// Reusable scratch math objects (zero allocations inside render loop)
const _vec2 = new THREE.Vector2();
const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _normalMat = new THREE.Matrix3();
const _quat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _color = new THREE.Color();
const _hoverEmissive = new THREE.Color('#60a5fa');
const _selectedEmissive = new THREE.Color('#34d399');

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class StudioSceneController {
  private container: HTMLElement;
  private callbacks: SceneControllerCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private stage: StudioStageSystem;
  private devicePivot: THREE.Group;
  private currentDeviceRoot: THREE.Group | null = null;
  private currentDisposables: Array<{ dispose: () => void }> = [];
  private currentCustomModels: Partial<Record<DeviceType, { scene: THREE.Group; fileName: string }>> = {};
  private customPcSlots: {
    keyboard?: { scene: THREE.Group; fileName: string };
    mouse?: { scene: THREE.Group; fileName: string };
  } = {};

  private deviceType: DeviceType = 'ps5';
  private sequence: TrainingSequence;
  private meshMapping: DeviceMeshMapping = {};
  private surfaceAnchors: DeviceAnchorMap = {};
  private glbTransform: GlbTransform = createDefaultGlbTransform();
  private autoGlbTransforms: Partial<Record<DeviceType, GlbTransform>> = {};
  private isMappingMode = false;

  private meshMap = new Map<string, AnimatedMeshState>();
  private pickableMeshes: THREE.Mesh[] = [];
  private hoveredMesh: THREE.Mesh | null = null;
  private selectedMeshName: string | null = null;

  // Exact 3D surface anchor pin overlay attached inside currentDeviceRoot
  private anchorOverlayGroup: THREE.Group | null = null;
  private anchorVisuals = new Map<string, AnchorPinVisual>();
  private pendingPickMarker: THREE.Group | null = null;
  private pendingPickMats: THREE.MeshBasicMaterial[] = [];

  // iPad 3D Touch Ripples
  private ipadRippleContainer: THREE.Group | null = null;
  private ipadScreenW = 3.76;
  private ipadScreenH = 2.52;
  private ipadRipplesOnXYPlane = false;
  private touchRipples: TouchRippleSlot[] = [];
  private nextRippleIdx = 0;

  // Playback & Physics state
  private isPlaying = false;
  private loopEnabled = true;
  private currentTimeMs = 0;
  private prevEvaluatedMs: number | null = null;
  private springTilt: Spring3DState = createSpring3DState();
  private showcaseSpring: Spring3DState = createSpring3DState();
  private liftSpring: SpringState = { value: 0, velocity: 0 };
  private basePivotY = 0.24;
  private floatClock = 0;
  private lastHudPushMs = 0;
  private lastActiveKey = '';

  // Camera smooth framing target
  private cameraTargetPos: THREE.Vector3 | null = null;
  private cameraTargetLook: THREE.Vector3 | null = null;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private lastHoverCheck = 0;
  private pointerDownPos = { x: 0, y: 0 };

  // Render loop lifecycle (supports both GPU rAF & Software WebGL afterDraw pacing)
  private rafId = 0;
  private timerId = 0;
  private destroyed = false;
  private renderBusy = false;
  private renderDirty = false;
  private continuousActive = false;
  private lastFrameTimestamp = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Shared ripple & pin geometries
  private rippleOuterGeo = new THREE.RingGeometry(0.18, 0.24, 36);
  private rippleInnerGeo = new THREE.RingGeometry(0.08, 0.13, 32);
  private rippleDotGeo = new THREE.CircleGeometry(0.065, 24);
  private pinBackingGeo = new THREE.CircleGeometry(0.175, 32);
  private pinOuterGeo = new THREE.RingGeometry(0.112, 0.165, 32);
  private pinCoreGeo = new THREE.CircleGeometry(0.062, 24);
  private pinPulseGeo = new THREE.RingGeometry(0.168, 0.232, 32);

  constructor(
    container: HTMLElement,
    initialSequence: TrainingSequence,
    callbacks: SceneControllerCallbacks,
  ) {
    this.container = container;
    this.sequence = initialSequence;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // 1. Renderer setup with ACESFilmicToneMapping & SRGBColorSpace
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Seamless Satin Silver Studio Background + Poly Haven studio_small_09 IBL
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c8cfd9');
    this.scene.fog = new THREE.FogExp2('#c8cfd9', 0.032);
    this.scene.environmentIntensity = 0.82;
    this.loadStudioHdri();

    // 4. Telephoto Studio Camera (FOV 34)
    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    this.applyResponsiveCameraPreset(this.deviceType, true);

    // 5. Smooth OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 18.5;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.target.set(0, -0.05, 0);
    this.controls.update();

    this.controls.addEventListener('start', () => {
      // Cancel scripted camera glide immediately when user drags
      this.cameraTargetPos = null;
      this.cameraTargetLook = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // 6. 3-Point Warm/Cool Studio Lighting + Softboxes
    this.setupStudioLighting();

    // 7. Post-processing UnrealBloomPass (GPU only; Software WebGL renders direct to stay crisp & fast)
    if (!this.isSoftwareGl) {
      try {
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.setSize(width, height);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          0.16,
          0.28,
          1.25,
        );
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(new OutputPass());
      } catch {
        this.composer = null;
        this.bloomPass = null;
      }
    }

    // 8. Studio Stage Pedestal & Shockwave Ring System
    this.stage = createStudioStage(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.stage.group);

    // 9. Device Spring-Tilt & Showcase Gimbal Pivot centered above pedestal
    this.devicePivot = new THREE.Group();
    this.devicePivot.name = 'DeviceSpringPivot';
    this.devicePivot.rotation.order = 'YXZ';
    this.devicePivot.position.set(0, 0.24, 0);
    this.scene.add(this.devicePivot);

    // Mount initial PS5 DualSense studio model
    this.mountDeviceModel('ps5');

    if (!this.isSoftwareGl) {
      try {
        this.renderer.compile(this.scene, this.camera);
      } catch {
        // Non-fatal pre-warm failure
      }
    }

    // Event Listeners (including ResizeObserver for iframe/flex layout changes)
    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    // Initial render
    this.requestRender();
  }

  private loadStudioHdri() {
    const loader = new HDRLoader();
    loader.load(
      '/hdri/studio_small_09_2k.hdr',
      (hdrTexture) => {
        if (this.destroyed) {
          hdrTexture.dispose();
          return;
        }
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();
        const nextEnvRT = pmrem.fromEquirectangular(hdrTexture);
        hdrTexture.dispose();
        pmrem.dispose();

        this.envRT?.dispose();
        this.envRT = nextEnvRT;
        this.scene.environment = nextEnvRT.texture;
        this.requestRender();
      },
      undefined,
      () => {
        if (this.destroyed) return;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const roomEnv = new RoomEnvironment();
        const fallbackRT = pmrem.fromScene(roomEnv, 0.04);
        roomEnv.dispose();
        pmrem.dispose();
        this.envRT?.dispose();
        this.envRT = fallbackRT;
        this.scene.environment = fallbackRT.texture;
        this.requestRender();
      },
    );
  }

  private setupStudioLighting() {
    // Subtle directional accents balanced for Poly Haven studio_small_09 HDRI IBL
    const hemi = new THREE.HemisphereLight(0xcbdcff, 0x161b29, 0.22);
    this.scene.add(hemi);

    // Warm key light for crisp contact shadows and subtle 3D form modeling
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 0.88);
    keyLight.position.set(4.5, 7.2, 5.4);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -3.8;
      keyLight.shadow.camera.right = 3.8;
      keyLight.shadow.camera.top = 3.8;
      keyLight.shadow.camera.bottom = -3.8;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 20;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    // Cool rim backlight for dramatic hardware silhouette separation
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rimLight.position.set(-5.2, 4.4, -5.8);
    this.scene.add(rimLight);

    // Gentle side fill
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.18);
    fillLight.position.set(-4, 2.2, 4.5);
    this.scene.add(fillLight);
  }

  private getCameraDistanceForDevice(device: DeviceType): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const aspect = this.camera.aspect || 16 / 9;
    const isNarrowMobile = aspect < 0.7;
    const isPortrait = aspect < 1.05;
    const scaleBoost = isNarrowMobile ? 1.88 : isPortrait ? 1.52 : aspect < 1.35 ? 1.2 : 1.0;

    switch (device) {
      case 'pc':
        return {
          pos: new THREE.Vector3(0, 4.95 * scaleBoost, 9.2 * scaleBoost),
          look: new THREE.Vector3(0, -0.04, 0),
        };
      case 'ipad':
        return {
          pos: new THREE.Vector3(0, 3.95 * scaleBoost, 8.15 * scaleBoost),
          look: new THREE.Vector3(0, 0.25, 0),
        };
      case 'xbox':
      case 'ps5':
      default:
        return {
          pos: new THREE.Vector3(0, 3.85 * scaleBoost, 7.1 * scaleBoost),
          look: new THREE.Vector3(0, -0.02, 0),
        };
    }
  }

  private applyResponsiveCameraPreset(device: DeviceType, instant: boolean) {
    const preset = this.getCameraDistanceForDevice(device);
    if (instant || this.isSoftwareGl) {
      this.camera.position.copy(preset.pos);
      if (this.controls) {
        this.controls.target.copy(preset.look);
        this.controls.update();
      } else {
        this.camera.lookAt(preset.look);
      }
      this.cameraTargetPos = null;
      this.cameraTargetLook = null;
    } else {
      this.cameraTargetPos = preset.pos;
      this.cameraTargetLook = preset.look;
      this.ensureLoopRunning();
    }
  }

  public resetCamera() {
    this.applyResponsiveCameraPreset(this.deviceType, false);
    this.requestRender();
  }

  private clearAnchorVisuals() {
    for (const v of this.anchorVisuals.values()) {
      v.backingMat.dispose();
      v.outerMat.dispose();
      v.coreMat.dispose();
      v.pulseMat.dispose();
    }
    this.anchorVisuals.clear();
    for (const m of this.pendingPickMats) {
      m.dispose();
    }
    this.pendingPickMats = [];
    this.pendingPickMarker = null;
    if (this.anchorOverlayGroup && this.anchorOverlayGroup.parent) {
      this.anchorOverlayGroup.parent.remove(this.anchorOverlayGroup);
    }
    this.anchorOverlayGroup = null;
  }

  private clearCurrentDevice() {
    this.clearAnchorVisuals();
    if (this.currentDeviceRoot) {
      this.devicePivot.remove(this.currentDeviceRoot);
      this.currentDeviceRoot = null;
    }
    this.meshMap.clear();
    this.pickableMeshes = [];
    this.hoveredMesh = null;
    this.selectedMeshName = null;
    if (this.ipadRippleContainer && this.ipadRippleContainer.parent) {
      this.ipadRippleContainer.parent.remove(this.ipadRippleContainer);
    }
    this.ipadRippleContainer = null;
    this.ipadRipplesOnXYPlane = false;
    this.touchRipples.forEach((r) => {
      r.outerMat.dispose();
      r.innerMat.dispose();
      r.coreMat.dispose();
    });
    this.touchRipples = [];

    for (const d of this.currentDisposables) {
      d.dispose();
    }
    this.currentDisposables = [];
  }

  private createAnchorPinVisual(anchor: SurfaceAnchor, initialHex: string): AnchorPinVisual {
    const group = new THREE.Group();
    const normal = new THREE.Vector3(anchor.normal[0], anchor.normal[1], anchor.normal[2]);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();

    group.position.set(
      anchor.point[0] + normal.x * 0.026,
      anchor.point[1] + normal.y * 0.026,
      anchor.point[2] + normal.z * 0.026,
    );
    group.quaternion.setFromUnitVectors(_zAxis, normal);
    if (this.currentCustomModels[this.deviceType]) {
      const invScale = 1 / Math.max(0.35, this.glbTransform.scale);
      group.scale.setScalar(invScale);
    }

    const backingMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const outerMat = new THREE.MeshBasicMaterial({
      color: initialHex,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const pulseMat = new THREE.MeshBasicMaterial({
      color: initialHex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });

    const backingDisc = new THREE.Mesh(this.pinBackingGeo, backingMat);
    backingDisc.renderOrder = 24;
    const outerRing = new THREE.Mesh(this.pinOuterGeo, outerMat);
    outerRing.position.z = 0.004;
    outerRing.renderOrder = 25;
    const coreDot = new THREE.Mesh(this.pinCoreGeo, coreMat);
    coreDot.position.z = 0.008;
    coreDot.renderOrder = 26;
    const pulseRing = new THREE.Mesh(this.pinPulseGeo, pulseMat);
    pulseRing.position.z = 0.005;
    pulseRing.renderOrder = 25;

    group.add(backingDisc, outerRing, coreDot, pulseRing);
    group.visible = false;

    return {
      group,
      backingDisc,
      outerRing,
      coreDot,
      pulseRing,
      backingMat,
      outerMat,
      coreMat,
      pulseMat,
      pulsePhase: 0,
    };
  }

  private rebuildAnchorOverlay() {
    this.clearAnchorVisuals();
    if (!this.currentDeviceRoot) return;

    const overlay = new THREE.Group();
    overlay.name = 'SurfaceAnchorOverlay';
    this.currentDeviceRoot.add(overlay);
    this.anchorOverlayGroup = overlay;

    for (const [btnId, anchor] of Object.entries(this.surfaceAnchors)) {
      const evtMatch = this.sequence.events.find((e) => e.target_mesh === btnId);
      const pin = this.createAnchorPinVisual(anchor, evtMatch?.color ?? '#10b981');
      overlay.add(pin.group);
      this.anchorVisuals.set(btnId, pin);
    }

    // Pending click preview marker (shown right where the user clicks in calibration mode)
    const pendingGroup = new THREE.Group();
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(this.pinBackingGeo, bgMat);
    const ring = new THREE.Mesh(this.pinOuterGeo, ringMat);
    ring.position.z = 0.004;
    const dot = new THREE.Mesh(this.pinCoreGeo, dotMat);
    dot.position.z = 0.008;
    pendingGroup.add(bg, ring, dot);
    pendingGroup.visible = false;
    overlay.add(pendingGroup);

    this.pendingPickMarker = pendingGroup;
    this.pendingPickMats = [bgMat, ringMat, dotMat];
  }

  private indexDeviceMeshes(root: THREE.Object3D) {
    let autoCounter = 1;
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name || obj.name.trim() === '') {
        obj.name = `Mesh_${String(autoCounter++).padStart(3, '0')}`;
      }

      // Clone materials per mesh so emissive highlight on one button never bleeds into sibling meshes
      const rawMats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const clonedMats = rawMats.map((m) => (m ? m.clone() : m));
      obj.material = Array.isArray(obj.material) ? clonedMats : clonedMats[0];

      const stdMats: THREE.MeshStandardMaterial[] = [];
      const baseEmissive: THREE.Color[] = [];
      const baseEmissiveIntensity: number[] = [];

      for (const mat of clonedMats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          stdMats.push(mat);
          baseEmissive.push(mat.emissive.clone());
          baseEmissiveIntensity.push(mat.emissiveIntensity);
        }
      }

      const pressAxis =
        obj.userData.pressAxis instanceof THREE.Vector3
          ? obj.userData.pressAxis.clone().normalize()
          : new THREE.Vector3(0, -1, 0);
      const pressDistance =
        typeof obj.userData.pressDistance === 'number' ? obj.userData.pressDistance : 0.045;

      this.meshMap.set(obj.name, {
        mesh: obj,
        basePosition: obj.position.clone(),
        pressAxis,
        pressDistance,
        materials: stdMats,
        baseEmissive,
        baseEmissiveIntensity,
        currentPress: 0,
      });

      this.pickableMeshes.push(obj);
    });
  }

  private setupIpadRipples(
    container: THREE.Group,
    width: number,
    height: number,
    onXYPlane = false,
  ) {
    // Dispose any previous touch ripple materials
    this.touchRipples.forEach((r) => {
      r.outerMat.dispose();
      r.innerMat.dispose();
      r.coreMat.dispose();
    });
    if (this.ipadRippleContainer && this.ipadRippleContainer !== container && this.ipadRippleContainer.parent) {
      this.ipadRippleContainer.parent.remove(this.ipadRippleContainer);
    }

    this.ipadRippleContainer = container;
    this.ipadScreenW = width;
    this.ipadScreenH = height;
    this.ipadRipplesOnXYPlane = onXYPlane;
    this.touchRipples = [];

    for (let i = 0; i < 8; i++) {
      const slotGroup = new THREE.Group();
      slotGroup.visible = false;

      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const outerRing = new THREE.Mesh(this.rippleOuterGeo, outerMat);
      const innerRing = new THREE.Mesh(this.rippleInnerGeo, innerMat);
      const coreDot = new THREE.Mesh(this.rippleDotGeo, coreMat);

      if (!onXYPlane) {
        outerRing.rotation.x = -Math.PI / 2;
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.004;
        coreDot.rotation.x = -Math.PI / 2;
        coreDot.position.y = 0.008;
      } else {
        innerRing.position.z = 0.004;
        coreDot.position.z = 0.008;
      }

      slotGroup.add(outerRing, innerRing, coreDot);
      container.add(slotGroup);

      this.touchRipples.push({
        group: slotGroup,
        outerRing,
        innerRing,
        coreDot,
        outerMat,
        innerMat,
        coreMat,
        active: false,
        age: 0,
        duration: 0.9,
      });
    }
  }

  private spawnIpadTouchRipple(normX: number, normY: number, hexColor: string) {
    if (!this.ipadRippleContainer || this.touchRipples.length === 0) return;

    const slot = this.touchRipples[this.nextRippleIdx];
    this.nextRippleIdx = (this.nextRippleIdx + 1) % this.touchRipples.length;

    const localX = (normX - 0.5) * this.ipadScreenW;
    if (this.ipadRipplesOnXYPlane) {
      // +Y is up, normY=0 is top edge -> invert Y
      const localY = (0.5 - normY) * this.ipadScreenH;
      slot.group.position.set(localX, localY, 0.012 + this.nextRippleIdx * 0.001);
    } else {
      const localZ = (normY - 0.5) * this.ipadScreenH;
      slot.group.position.set(localX, 0.012 + this.nextRippleIdx * 0.001, localZ);
    }

    slot.outerMat.color.set(hexColor);
    slot.innerMat.color.set(hexColor);
    slot.coreMat.color.set('#ffffff');
    slot.outerRing.scale.setScalar(0.5);
    slot.innerRing.scale.setScalar(0.35);
    slot.coreDot.scale.setScalar(1.0);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.85;
    slot.group.visible = true;
  }

  /**
   * Applies GlbTransform to a mounted custom GLB root, grounds it cleanly above the circular pedestal
   * (zero clipping regardless of rotation/scale), and aligns the custom iPad front-screen ripple plane.
   */
  private applyGlbTransformToCurrentRoot() {
    if (!this.currentDeviceRoot || !this.currentCustomModels[this.deviceType]) return;

    const root = this.currentDeviceRoot;
    const t = this.glbTransform;

    root.position.set(0, 0, 0);
    root.rotation.set(t.rotX, t.rotY, t.rotZ);
    root.scale.setScalar(t.scale);

    // Measure oriented bounding box in devicePivot space (temporarily zero spring tilt for stable grounding)
    const savedPivotRot = this.devicePivot.rotation.clone();
    this.devicePivot.rotation.set(0, 0, 0);
    this.devicePivot.updateMatrixWorld(true);

    // Compute bounds excluding overlay & ripple helper groups
    const box = new THREE.Box3();
    for (const mesh of this.pickableMeshes) {
      box.expandByObject(mesh);
    }

    if (!box.isEmpty()) {
      const desiredMinWorldY = this.stage.pedestalTopY + 0.12 + t.offsetY;
      const deltaY = desiredMinWorldY - box.min.y;
      root.position.y += deltaY;
      this.devicePivot.updateMatrixWorld(true);

      // Keep 3D anchor pin size visually constant even if user scales GLB up or down
      const invScale = 1 / Math.max(0.35, t.scale);
      for (const pin of this.anchorVisuals.values()) {
        pin.group.scale.setScalar(invScale);
      }
      if (this.pendingPickMarker) {
        this.pendingPickMarker.scale.setScalar(invScale);
      }

      // Recompute front-facing screen plane for custom iPad GLBs (facing +Z toward the camera)
      if (this.deviceType === 'ipad') {
        const finalBox = new THREE.Box3();
        for (const mesh of this.pickableMeshes) {
          finalBox.expandByObject(mesh);
        }
        const fSize = finalBox.getSize(new THREE.Vector3());
        const fCenter = finalBox.getCenter(new THREE.Vector3());

        // Attach a clean XY ripple host directly onto the front face facing +Z toward the camera
        const host = new THREE.Group();
        host.name = 'CustomIpadFrontScreenHost';
        const frontWorldPos = new THREE.Vector3(fCenter.x, fCenter.y, finalBox.max.z + 0.02);
        host.position.copy(this.devicePivot.worldToLocal(frontWorldPos));
        this.devicePivot.add(host);
        this.setupIpadRipples(host, Math.max(1.2, fSize.x * 0.84), Math.max(0.9, fSize.y * 0.84), true);
      }
    }

    this.devicePivot.rotation.copy(savedPivotRot);
    this.scene.updateMatrixWorld(true);
  }

  private mountDeviceModel(device: DeviceType) {
    this.clearCurrentDevice();
    this.deviceType = device;
    this.springTilt = createSpring3DState();
    this.showcaseSpring = createSpring3DState();
    this.liftSpring = { value: 0, velocity: 0 };
    this.devicePivot.rotation.set(0, 0, 0);
    // Elevate tilted iPad cleanly above pedestal top inlay so corners never clip even during spring recoil
    this.basePivotY = device === 'ipad' ? 0.56 : 0.24;
    this.devicePivot.position.y = this.basePivotY;

    const platformMeta = DEVICE_PLATFORMS.find((p) => p.id === device);
    if (platformMeta) {
      this.stage.setNeonColor(platformMeta.pedestalGlowHex);
    }

    const cachedCustom = this.currentCustomModels[device];
    if (cachedCustom) {
      const cloned = cachedCustom.scene.clone(true);
      this.currentDeviceRoot = cloned;
      this.devicePivot.add(cloned);
      this.indexDeviceMeshes(cloned);
      this.applyGlbTransformToCurrentRoot();
    } else if (device === 'pc' && (this.customPcSlots.keyboard || this.customPcSlots.mouse)) {
      const built = buildPcKeyboardMouse(
        this.renderer.capabilities.getMaxAnisotropy(),
        this.customPcSlots.keyboard?.scene.clone(true),
        this.customPcSlots.mouse?.scene.clone(true),
      );
      this.currentDeviceRoot = built.root;
      this.currentDisposables = built.disposables;
      this.devicePivot.add(built.root);
      this.indexDeviceMeshes(built.root);
    } else {
      const built = buildProceduralDevice(device, this.renderer.capabilities.getMaxAnisotropy());
      this.currentDeviceRoot = built.root;
      this.currentDisposables = built.disposables;
      this.devicePivot.add(built.root);
      this.indexDeviceMeshes(built.root);

      if (built.ipadScreenInfo) {
        this.setupIpadRipples(
          built.ipadScreenInfo.container,
          built.ipadScreenInfo.width,
          built.ipadScreenInfo.height,
          false,
        );
      }
    }

    this.rebuildAnchorOverlay();
    this.applyResponsiveCameraPreset(device, false);
    this.prevEvaluatedMs = null;
    this.evaluateAndApplyFrame(0.016, false);
    this.scene.updateMatrixWorld(true);
    this.requestRender();
  }

  public setDevice(
    device: DeviceType,
    sequence: TrainingSequence,
    mapping: DeviceMeshMapping,
    anchors?: DeviceAnchorMap,
    glbTransform?: GlbTransform,
  ) {
    this.sequence = sequence;
    this.meshMapping = mapping;
    if (anchors) this.surfaceAnchors = anchors;
    if (glbTransform) this.glbTransform = glbTransform;
    this.currentTimeMs = 0;
    this.prevEvaluatedMs = null;
    this.mountDeviceModel(device);
    this.pushHudState(true);
  }

  public setSequence(sequence: TrainingSequence, resetTime = true) {
    this.sequence = sequence;
    if (resetTime) {
      this.currentTimeMs = 0;
      this.prevEvaluatedMs = null;
    }
    this.rebuildAnchorOverlay();
    this.evaluateAndApplyFrame(0.016, false);
    this.pushHudState(true);
    this.requestRender();
  }

  public setMeshMapping(mapping: DeviceMeshMapping) {
    this.meshMapping = mapping;
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  }

  public setSurfaceAnchors(anchors: DeviceAnchorMap) {
    this.surfaceAnchors = anchors;
    this.rebuildAnchorOverlay();
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  }

  public setGlbTransform(transform: GlbTransform) {
    this.glbTransform = { ...transform };
    this.applyGlbTransformToCurrentRoot();
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  }

  public getAutoGlbTransform(device: DeviceType): GlbTransform {
    return this.autoGlbTransforms[device]
      ? { ...this.autoGlbTransforms[device]! }
      : createDefaultGlbTransform();
  }

  public setMappingMode(enabled: boolean) {
    this.isMappingMode = enabled;
    if (!enabled) {
      this.hoveredMesh = null;
      this.selectedMeshName = null;
      if (this.pendingPickMarker) this.pendingPickMarker.visible = false;
      this.renderer.domElement.style.cursor = 'grab';
      this.callbacks.onMeshSelected(null);
      this.callbacks.onMeshHovered(null);
    } else {
      this.renderer.domElement.style.cursor = 'crosshair';
    }
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  }

  public setSelectedMeshName(name: string | null) {
    this.selectedMeshName = name;
    if (!name && this.pendingPickMarker) {
      this.pendingPickMarker.visible = false;
    }
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  }

  public setLoopEnabled(loop: boolean) {
    this.loopEnabled = loop;
  }

  public setPlaying(playing: boolean) {
    if (this.isPlaying === playing) return;
    this.isPlaying = playing;
    if (playing && this.currentTimeMs >= this.sequence.duration_ms) {
      this.currentTimeMs = 0;
      this.prevEvaluatedMs = null;
    }
    this.callbacks.onPlayStateChange(playing);
    if (playing) {
      this.lastFrameTimestamp = performance.now();
      this.ensureLoopRunning();
    }
  }

  public seek(ms: number) {
    const clamped = Math.max(0, Math.min(this.sequence.duration_ms, ms));
    this.currentTimeMs = clamped;
    this.prevEvaluatedMs = null;
    this.evaluateAndApplyFrame(0.032, true, !this.isPlaying);
    this.pushHudState(true);
    this.ensureLoopRunning();
  }

  public getAvailableMeshNames(): string[] {
    return Array.from(this.meshMap.keys());
  }

  public async loadGlbFile(
    file: File,
    slot: PcGlbSlot = 'combined',
    savedTransform?: GlbTransform,
  ): Promise<ArrayBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    await this.loadGlbBuffer(this.deviceType, arrayBuffer, file.name, slot, {
      silentRestore: false,
      savedTransform,
    });
    return arrayBuffer;
  }

  public async loadGlbBuffer(
    targetDevice: DeviceType,
    arrayBuffer: ArrayBuffer,
    fileName: string,
    slot: PcGlbSlot = 'combined',
    options?: {
      silentRestore?: boolean;
      savedTransform?: GlbTransform;
    },
  ): Promise<void> {
    const loader = new GLTFLoader();
    const isRestore = Boolean(options?.silentRestore);

    return new Promise((resolve, reject) => {
      loader.parse(
        arrayBuffer.slice(0),
        '',
        (gltf) => {
          const model = gltf.scene;
          const wrapper = new THREE.Group();
          wrapper.name = `CustomGLB_${slot}_${fileName}`;

          // Collect mesh name & spatial hints BEFORE normalization so auto-orientation detects front/back & portrait/landscape
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);

          const hints: GlbMeshHint[] = [];
          let meshCount = 0;
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshCount++;
              child.castShadow = true;
              child.receiveShadow = true;
              const childBox = new THREE.Box3().setFromObject(child);
              const childCenter = childBox.getCenter(new THREE.Vector3()).sub(center);
              const mat = Array.isArray(child.material) ? child.material[0] : child.material;
              hints.push({
                name: child.name || '',
                materialName: mat && 'name' in mat ? String(mat.name || '') : '',
                center: [childCenter.x, childCenter.y, childCenter.z],
              });
            }
          });

          const isPcSubSlot = targetDevice === 'pc' && (slot === 'keyboard' || slot === 'mouse');
          const targetSize = isPcSubSlot
            ? slot === 'mouse'
              ? 1.55
              : 3.55
            : targetDevice === 'pc'
              ? 4.55
              : 3.45;
          const scale = targetSize / maxDim;

          model.scale.setScalar(scale);
          if (isPcSubSlot) {
            // Sit flush on top of the studio desk-mat surface (y = 0)
            model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
          } else {
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
          }

          wrapper.add(model);

          if (isPcSubSlot) {
            delete this.currentCustomModels.pc;
            this.customPcSlots[slot] = { scene: wrapper, fileName };
            const loadedParts = [
              this.customPcSlots.keyboard?.fileName,
              this.customPcSlots.mouse?.fileName,
            ].filter(Boolean);
            const displayName = loadedParts.join(' + ');
            if (this.deviceType === 'pc') {
              this.mountDeviceModel('pc');
            }
            this.callbacks.onModelLoaded('pc', displayName, meshCount, undefined, isRestore);
          } else {
            if (targetDevice === 'pc') {
              this.customPcSlots = {};
            }
            const autoTransform = computeAutoGlbTransform(
              targetDevice,
              { x: size.x, y: size.y, z: size.z },
              hints,
            );
            this.autoGlbTransforms[targetDevice] = autoTransform;

            const chosenTransform = options?.savedTransform
              ? { ...options.savedTransform }
              : { ...autoTransform };

            this.currentCustomModels[targetDevice] = {
              scene: wrapper,
              fileName,
            };

            if (this.deviceType === targetDevice) {
              this.glbTransform = chosenTransform;
              this.mountDeviceModel(targetDevice);
            }
            this.callbacks.onModelLoaded(
              targetDevice,
              fileName,
              meshCount,
              options?.savedTransform ? undefined : autoTransform,
              isRestore,
            );
          }
          resolve();
        },
        (err) => {
          if (!isRestore) {
            const msg = 'خطا در خواندن فایل سه‌بعدی. لطفاً یک فایل معتبر .glb یا .gltf انتخاب کنید.';
            this.callbacks.onModelError(msg);
          }
          reject(err);
        },
      );
    });
  }

  public restoreDefaultModel() {
    delete this.currentCustomModels[this.deviceType];
    if (this.deviceType === 'pc') {
      this.customPcSlots = {};
    }
    this.mountDeviceModel(this.deviceType);
  }

  public hasCustomModel(device: DeviceType): boolean {
    if (device === 'pc') {
      return Boolean(
        this.currentCustomModels.pc ||
          this.customPcSlots.keyboard ||
          this.customPcSlots.mouse,
      );
    }
    return Boolean(this.currentCustomModels[device]);
  }

  private resolveTouchCoordinate(event: SequenceEvent): { x: number; y: number } {
    if (event.touch) return event.touch;
    const spec = DEVICE_BUTTONS.ipad.find((b) => b.id === event.target_mesh);
    if (spec?.defaultTouch) return spec.defaultTouch;
    return { x: 0.5, y: 0.5 };
  }

  private evaluateAndApplyFrame(dt: number, triggerEffects: boolean, snapShowcase = false): boolean {
    let needsMoreFrames = false;

    const frame = evaluateTimelineFrame(
      this.sequence,
      this.currentTimeMs,
      this.prevEvaluatedMs,
    );
    this.prevEvaluatedMs = this.currentTimeMs;

    // Trigger shockwaves & iPad touch ripples on newly entered button presses
    if (triggerEffects && frame.newlyTriggered.length > 0) {
      for (const evt of frame.newlyTriggered) {
        this.stage.spawnShockwave(evt.color);
        // If iPad has no exact manual surface anchor for this touch target, spawn ripple on detected front screen plane
        if (this.deviceType === 'ipad' && !this.surfaceAnchors[evt.target_mesh]) {
          const coord = this.resolveTouchCoordinate(evt);
          this.spawnIpadTouchRipple(coord.x, coord.y, evt.color);
        }
      }
    }

    // Build lookup of active mesh intensities & active button IDs
    const activeMeshLookup = new Map<string, { intensity: number; color: string }>();
    const activeButtonLookup = new Map<string, { intensity: number; color: string }>();
    for (const item of frame.activeEvents) {
      const btnId = item.event.target_mesh;
      const existingBtn = activeButtonLookup.get(btnId);
      if (!existingBtn || item.intensity > existingBtn.intensity) {
        activeButtonLookup.set(btnId, {
          intensity: item.intensity,
          color: item.event.color,
        });
      }

      const concreteMesh = resolveTargetMeshName(this.meshMapping, btnId);
      // On single-mesh or iPad models where an exact surface anchor is pinned, avoid depressing/glowing the whole chassis
      const skipWholeMeshGlow =
        this.deviceType === 'ipad' ||
        (Boolean(this.surfaceAnchors[btnId]) && this.pickableMeshes.length <= 2);

      if (!skipWholeMeshGlow) {
        const existing = activeMeshLookup.get(concreteMesh);
        if (!existing || item.intensity > existing.intensity) {
          activeMeshLookup.set(concreteMesh, {
            intensity: item.intensity,
            color: item.event.color,
          });
        }
      }
    }

    // Animate exact 3D Surface Anchor Pins (flush on exact clicked spots of any GLB or procedural model)
    for (const [btnId, pin] of this.anchorVisuals.entries()) {
      const active = activeButtonLookup.get(btnId);
      if (active && active.intensity > 0.01 && !this.isMappingMode) {
        pin.group.visible = true;
        pin.outerMat.color.set(active.color);
        pin.pulseMat.color.set(active.color);
        pin.backingMat.opacity = 0.78 * active.intensity;
        pin.outerMat.opacity = 0.96 * active.intensity;
        pin.coreMat.opacity = 1.0 * active.intensity;
        const ringScale = 0.92 + active.intensity * 0.28;
        pin.outerRing.scale.setScalar(ringScale);
        pin.backingDisc.scale.setScalar(ringScale);
        pin.coreDot.scale.setScalar(0.85 + active.intensity * 0.35);

        pin.pulsePhase = (pin.pulsePhase + dt * 1.65) % 1;
        const easeOut = 1 - Math.pow(1 - pin.pulsePhase, 3);
        pin.pulseRing.scale.setScalar(0.9 + easeOut * 1.9);
        pin.pulseMat.opacity = Math.pow(1 - pin.pulsePhase, 1.5) * 0.85 * active.intensity;
        needsMoreFrames = true;
      } else if (this.isMappingMode) {
        // Show all pinned spots cleanly during calibration mode so user can verify every coordinate
        pin.group.visible = true;
        pin.backingMat.opacity = 0.68;
        pin.outerMat.opacity = 0.9;
        pin.coreMat.opacity = 0.92;
        pin.outerRing.scale.setScalar(0.85);
        pin.backingDisc.scale.setScalar(0.85);
        pin.coreDot.scale.setScalar(0.8);
        pin.pulseMat.opacity = 0;
        pin.pulsePhase = 0;
      } else {
        pin.group.visible = false;
        pin.pulseMat.opacity = 0;
        pin.pulsePhase = 0;
      }
    }

    // Apply physical depression & emissive glow to each mesh
    const pressLerp = 1 - Math.exp(-26 * dt);
    for (const [meshName, state] of this.meshMap.entries()) {
      const active = activeMeshLookup.get(meshName);
      const targetPress = active && this.deviceType !== 'ipad' ? active.intensity : 0;

      if (Math.abs(state.currentPress - targetPress) > 0.002) {
        state.currentPress += (targetPress - state.currentPress) * pressLerp;
        needsMoreFrames = true;
      } else {
        state.currentPress = targetPress;
      }

      // Physical press translation
      _vec3
        .copy(state.pressAxis)
        .multiplyScalar(state.pressDistance * state.currentPress);
      state.mesh.position.copy(state.basePosition).add(_vec3);

      // Material emissive highlight (active event > selected in mapper > hovered in mapper)
      const isSelected = this.isMappingMode && this.selectedMeshName === meshName;
      const isHovered = this.isMappingMode && this.hoveredMesh === state.mesh;

      for (let i = 0; i < state.materials.length; i++) {
        const mat = state.materials[i];
        if (active && active.intensity > 0.01) {
          _color.set(active.color);
          mat.emissive.copy(_color);
          mat.emissiveIntensity = 0.25 + active.intensity * 1.25;
        } else if (isSelected) {
          mat.emissive.copy(_selectedEmissive);
          mat.emissiveIntensity = 1.45;
        } else if (isHovered) {
          mat.emissive.copy(_hoverEmissive);
          mat.emissiveIntensity = 0.95;
        } else {
          mat.emissive.copy(state.baseEmissive[i]);
          mat.emissiveIntensity = state.baseEmissiveIntensity[i];
        }
      }
    }

    // Step second-order spring physics for tactile button recoil tilt + cinematic best-angle showcase rotation
    const tiltTarget = this.isMappingMode ? { x: 0, y: 0, z: 0 } : frame.targetTilt;
    const showcaseTarget = this.isMappingMode
      ? { x: 0, y: 0, z: 0 }
      : frame.targetShowcasePose;
    const liftTarget = this.isMappingMode ? 0 : frame.targetLiftY;

    if (snapShowcase) {
      this.showcaseSpring = {
        x: { value: showcaseTarget.x, velocity: 0 },
        y: { value: showcaseTarget.y, velocity: 0 },
        z: { value: showcaseTarget.z, velocity: 0 },
      };
      this.liftSpring = { value: liftTarget, velocity: 0 };
    } else {
      this.showcaseSpring = stepSpring3D(this.showcaseSpring, showcaseTarget, dt, 62, 15);
      this.liftSpring = stepSpring1D(this.liftSpring, liftTarget, dt, 62, 15);
    }

    this.springTilt = stepSpring3D(this.springTilt, tiltTarget, dt, 185, 16);

    if (this.isPlaying && !this.isMappingMode) {
      this.floatClock += dt;
    }
    const floatOffsetY =
      this.isPlaying && !this.isMappingMode ? Math.sin(this.floatClock * 2.2) * 0.032 : 0;

    this.devicePivot.rotation.set(
      this.showcaseSpring.x.value + this.springTilt.x.value,
      this.showcaseSpring.y.value + this.springTilt.y.value,
      this.showcaseSpring.z.value + this.springTilt.z.value,
    );
    this.devicePivot.position.y = this.basePivotY + this.liftSpring.value + floatOffsetY;

    const springMoving =
      Math.abs(this.springTilt.x.velocity) > 0.001 ||
      Math.abs(this.springTilt.y.velocity) > 0.001 ||
      Math.abs(this.springTilt.z.velocity) > 0.001 ||
      Math.abs(this.springTilt.x.value - tiltTarget.x) > 0.001 ||
      Math.abs(this.springTilt.y.value - tiltTarget.y) > 0.001 ||
      Math.abs(this.springTilt.z.value - tiltTarget.z) > 0.001 ||
      Math.abs(this.showcaseSpring.x.velocity) > 0.001 ||
      Math.abs(this.showcaseSpring.y.velocity) > 0.001 ||
      Math.abs(this.showcaseSpring.z.velocity) > 0.001 ||
      Math.abs(this.showcaseSpring.x.value - showcaseTarget.x) > 0.001 ||
      Math.abs(this.showcaseSpring.y.value - showcaseTarget.y) > 0.001 ||
      Math.abs(this.showcaseSpring.z.value - showcaseTarget.z) > 0.001 ||
      Math.abs(this.liftSpring.velocity) > 0.001 ||
      Math.abs(this.liftSpring.value - liftTarget) > 0.001;

    if (springMoving) needsMoreFrames = true;

    // Update iPad 3D Touch Ripples
    for (const slot of this.touchRipples) {
      if (!slot.active) continue;
      slot.age += dt;
      const t = slot.age / slot.duration;
      if (t >= 1) {
        slot.active = false;
        slot.group.visible = false;
        continue;
      }
      const easeOut = 1 - Math.pow(1 - t, 3);
      slot.outerRing.scale.setScalar(0.55 + easeOut * 2.15);
      slot.innerRing.scale.setScalar(0.4 + easeOut * 1.35);
      slot.coreDot.scale.setScalar(1.05 - easeOut * 0.45);
      slot.outerMat.opacity = Math.pow(1 - t, 1.5) * 0.92;
      slot.innerMat.opacity = Math.pow(1 - t, 1.2) * 0.85;
      slot.coreMat.opacity = Math.pow(1 - t, 1.8) * 0.95;
      needsMoreFrames = true;
    }

    // Update stage shockwaves & pedestal glow
    if (this.stage.update(dt)) {
      needsMoreFrames = true;
    }

    // Smooth camera preset glide (GPU only)
    if (this.cameraTargetPos && this.cameraTargetLook) {
      const camAlpha = 1 - Math.exp(-6.5 * dt);
      this.camera.position.lerp(this.cameraTargetPos, camAlpha);
      this.controls.target.lerp(this.cameraTargetLook, camAlpha);
      if (
        this.camera.position.distanceTo(this.cameraTargetPos) < 0.015 &&
        this.controls.target.distanceTo(this.cameraTargetLook) < 0.015
      ) {
        this.camera.position.copy(this.cameraTargetPos);
        this.controls.target.copy(this.cameraTargetLook);
        this.cameraTargetPos = null;
        this.cameraTargetLook = null;
      } else {
        needsMoreFrames = true;
      }
    }

    return needsMoreFrames;
  }

  private pushHudState(force: boolean) {
    const now = performance.now();
    const frame = evaluateTimelineFrame(this.sequence, this.currentTimeMs, this.currentTimeMs);
    const activeEvts = frame.activeEvents.map((a) => a.event);
    const activeKey = activeEvts.map((e) => e.id).join(',');

    // Throttle HUD state updates to ~15Hz unless active events changed or forced
    if (force || activeKey !== this.lastActiveKey || now - this.lastHudPushMs >= 64) {
      this.lastHudPushMs = now;
      this.lastActiveKey = activeKey;
      this.callbacks.onTimeUpdate(this.currentTimeMs, activeEvts);
    }
  }

  private renderScene() {
    this.controls.update();
    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      try {
        this.composer.render();
      } catch {
        this.composer = null;
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  /**
   * Software-WebGL fence pacing from the threejs skill so SwiftShader never starves the main thread.
   */
  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const startMs = performance.now();
    const poll = () => {
      if (this.destroyed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED && performance.now() - startMs < 180) {
        this.timerId = window.setTimeout(poll, 8);
      } else {
        if (sync) gl.deleteSync(sync);
        this.timerId = window.setTimeout(cb, 40);
      }
    };
    this.timerId = window.setTimeout(poll, 8);
  }

  private requestRender() {
    if (this.destroyed || this.continuousActive) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.rafId = requestAnimationFrame(() => {
      if (this.destroyed) return;
      this.renderDirty = false;
      this.renderScene();
      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.continuousActive) {
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) this.afterDraw(done);
      else done();
    });
  }

  private ensureLoopRunning() {
    if (this.destroyed || this.continuousActive) return;
    this.continuousActive = true;
    this.lastFrameTimestamp = performance.now();
    this.tick();
  }

  private tick = () => {
    if (this.destroyed) return;

    const now = performance.now();
    const dt = Math.min(0.08, Math.max(0.001, (now - this.lastFrameTimestamp) / 1000));
    this.lastFrameTimestamp = now;

    if (this.isPlaying) {
      this.currentTimeMs += dt * 1000;
      if (this.currentTimeMs >= this.sequence.duration_ms) {
        if (this.loopEnabled) {
          this.currentTimeMs = this.currentTimeMs % Math.max(1, this.sequence.duration_ms);
          this.prevEvaluatedMs = null;
        } else {
          this.currentTimeMs = this.sequence.duration_ms;
          this.isPlaying = false;
          this.callbacks.onPlayStateChange(false);
        }
      }
    }

    const stillAnimating = this.evaluateAndApplyFrame(dt, true);
    this.pushHudState(false);
    this.renderScene();

    if (this.isPlaying || stillAnimating) {
      if (this.isSoftwareGl) {
        this.afterDraw(this.tick);
      } else {
        this.rafId = requestAnimationFrame(this.tick);
      }
    } else {
      this.continuousActive = false;
      this.renderBusy = false;
    }
  };

  private handleResize = () => {
    if (this.destroyed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    this.applyResponsiveCameraPreset(this.deviceType, true);
    this.requestRender();
  };

  private raycastPointerHit(clientX: number, clientY: number): THREE.Intersection<THREE.Mesh> | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _vec2.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _vec2.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_vec2, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickableMeshes, false);
    if (hits.length > 0 && hits[0].object instanceof THREE.Mesh) {
      return hits[0] as THREE.Intersection<THREE.Mesh>;
    }
    return null;
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (Math.hypot(dx, dy) > 6) return; // Ignore orbit drags

    if (!this.isMappingMode || !this.currentDeviceRoot) return;

    const hit = this.raycastPointerHit(e.clientX, e.clientY);
    if (hit) {
      const hitMesh = hit.object;
      this.selectedMeshName = hitMesh.name;
      const currentButtonId = findButtonForMesh(this.meshMapping, hitMesh.name);

      // Compute exact 3D hit point & outward surface normal in currentDeviceRoot local space
      this.currentDeviceRoot.updateMatrixWorld(true);
      const localPt = this.currentDeviceRoot.worldToLocal(hit.point.clone());

      const worldNormal = new THREE.Vector3(0, 0, 1);
      if (hit.face) {
        _normalMat.getNormalMatrix(hitMesh.matrixWorld);
        worldNormal.copy(hit.face.normal).applyMatrix3(_normalMat).normalize();
      }
      // Ensure normal always faces outward toward the camera (handles inverted/double-sided GLB normals)
      _vec3B.copy(this.camera.position).sub(hit.point);
      if (worldNormal.dot(_vec3B) < 0) {
        worldNormal.negate();
      }

      this.currentDeviceRoot.getWorldQuaternion(_quat);
      const localNorm = worldNormal.clone().applyQuaternion(_quat.invert()).normalize();

      // Show immediate live crosshair marker on the exact clicked millimeter
      if (this.pendingPickMarker) {
        this.pendingPickMarker.position.set(
          localPt.x + localNorm.x * 0.022,
          localPt.y + localNorm.y * 0.022,
          localPt.z + localNorm.z * 0.022,
        );
        this.pendingPickMarker.quaternion.setFromUnitVectors(_zAxis, localNorm);
        this.pendingPickMarker.visible = true;
      }

      this.callbacks.onMeshSelected({
        meshName: hitMesh.name,
        screenX: e.clientX,
        screenY: e.clientY,
        currentButtonId,
        localPoint: [localPt.x, localPt.y, localPt.z],
        localNormal: [localNorm.x, localNorm.y, localNorm.z],
      });
    } else {
      this.selectedMeshName = null;
      if (this.pendingPickMarker) this.pendingPickMarker.visible = false;
      this.callbacks.onMeshSelected(null);
    }
    this.evaluateAndApplyFrame(0.016, false);
    this.requestRender();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isMappingMode) return;
    const now = performance.now();
    if (now - this.lastHoverCheck < 45) return;
    this.lastHoverCheck = now;

    const hit = this.raycastPointerHit(e.clientX, e.clientY);
    const mesh = hit ? hit.object : null;
    if (mesh !== this.hoveredMesh) {
      this.hoveredMesh = mesh;
      this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'crosshair';
      this.callbacks.onMeshHovered(mesh ? mesh.name : null);
      this.evaluateAndApplyFrame(0.016, false);
      this.requestRender();
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
  };

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timerId);

    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.clearCurrentDevice();
    this.stage.dispose();
    this.controls.dispose();
    this.rippleOuterGeo.dispose();
    this.rippleInnerGeo.dispose();
    this.rippleDotGeo.dispose();
    this.pinBackingGeo.dispose();
    this.pinOuterGeo.dispose();
    this.pinCoreGeo.dispose();
    this.pinPulseGeo.dispose();
    this.envRT?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
