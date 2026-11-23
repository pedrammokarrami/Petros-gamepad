# Astro Trainer 3D — Embeddable Integration Guide

> **CRITICAL RULES FOR AI CODING AGENTS (READ FIRST):**
> 1. **DO NOT build a 2D list of button pills/chips from `DEVICE_BUTTONS`.** This package is an interactive **Three.js 3D WebGL stage**. You MUST copy the `src/three/`, `src/core/`, `src/components/`, `src/data/`, `src/sdk/`, `src/types/`, and `public/hdri/` folders intact and render `<ControllerTrainerStage />`.
> 2. **Install `three@^0.187.0`** (required for `three/addons/loaders/HDRLoader.js` and `OutputPass`).
> 3. **Give the parent wrapper an explicit height** (e.g., `h-[460px] sm:h-[600px]` or `h-screen`) — WebGL canvases collapse to `0px` if the parent has no height.
> 4. **If the host app uses Next.js (App Router or Pages Router)**, import `<ControllerTrainerStage />` with `next/dynamic` and `{ ssr: false }`.
> 5. **Verification check before finishing:** Inspect the rendered DOM and confirm a live `<canvas>` element exists inside `[data-testid="studio-canvas-mount"]` with `width > 0` and `height > 0`, and that the 3D controller, pedestal, and timeline scrubber are visibly rendered.

---

## 1. Dependencies

Install the exact compatible versions in your host React / Next.js / Vite application:

```bash
npm install three@^0.187.0 lucide-react
npm install -D @types/three@^0.187.0
```

Also copy the utility classes from `src/index.css` into your global stylesheet:
- `.vision-glass`
- `.vision-glass-subtle`
- `.vision-pill-active`
- `.font-mono-tabular`
- `.studio-scroll`

---

## 2. Files to Copy Into Your Host App (ALL REQUIRED)

Copy **all** of these files without skipping `src/three/` or `public/hdri/`:

```text
src/
  sdk/
    index.ts                     # Barrel export (import ControllerTrainerStage from here)
    ControllerTrainerStage.tsx   # Main drop-in 3D React component ('use client' ready)
    apiClient.ts                 # REST API fetch & payload normalizer
    hardwareInputService.ts      # Real Bluetooth Gamepad API, WebHID pairing, haptics & PC input
  components/
    DeviceSwitcher.tsx
    CalloutBadge.tsx
    TimelineDock.tsx
    BluetoothModal.tsx           # Bluetooth pairing helper & live button tester
  core/
    sequenceEngine.ts            # Timeline evaluator, spring physics & showcase choreography
    gamepadMapper.ts             # PS5 DualSense / Xbox / PC keyboard+mouse button mappings
    practiceEngine.ts            # Live timing accuracy & error detector (Perfect/Good/Early/Late/Wrong/Missed)
    meshMapping.ts               # Standard button ID -> GLB mesh name resolver
    glbPlacement.ts              # Auto-orientation & exact 3D anchor math
  data/
    devices.ts                   # Platform metadata, button catalogs & fallback samples
  three/
    StudioSceneController.ts     # Three.js WebGL engine + live hardware glow + drop-in GLB loader
    deviceBuilders.ts            # Built-in 3D hardware (PS5, Xbox, PC, iOS)
    backgroundEnvironments.ts    # Built-in 3D background dioramas (PS5, Series X, PC Rig, iPhone Pro)
    stageBuilder.ts              # Studio pedestal & shockwave ring system
  types/
    trainer.ts                   # Full TypeScript interfaces
public/
  hdri/
    studio_small_09_2k.hdr       # Studio IBL lighting map
  models/
    manifest.json                # Drop-in custom GLB asset manifest
```

---

## 3. React / Vite Integration

Render `<ControllerTrainerStage />` inside any container with an explicit width & height:

```tsx
import { ControllerTrainerStage } from './sdk';

export function SkillControllerPreview() {
  return (
    <div className="w-full h-[520px] sm:h-[640px] rounded-2xl overflow-hidden border border-white/10">
      <ControllerTrainerStage
        initialDevice="ps5"
        initialMode="demo" // or "practice" for Live Bluetooth Hardware Testing
        // Option A: REST endpoint (supports `{device}` template or auto `?device=...`)
        apiBaseUrl="https://api.yourapp.com/v1/controller-sequences/{device}"
        // Option B: Custom async fetcher (e.g., with auth token / Axios)
        // fetchSequence={async (device, presetId) => myApi.getSequence(device, presetId)}
        autoPlay={true}
        onDeviceChange={(device) => console.log('Active platform:', device)}
        onControllerConnectionChange={(ctrl) => console.log('Bluetooth controller:', ctrl)}
        onPracticeFeedback={(feedback, stats) => {
          // Send live hits, timing errors (ms), wrong button errors, or accuracy % to your backend
          console.log(feedback.judgement, feedback.deltaMs, stats.accuracyPct);
        }}
        onActiveEventsChange={(events, timeMs) => {
          // Sync with skill cards, video player, or HUD callouts
        }}
        onApiError={(err, device) => console.warn(device, err.message)}
      />
    </div>
  );
}
```

### Real Bluetooth Controller Support (Zero Native Wrapper Needed)

- **PS5 DualSense & Xbox Series X|S Wireless Controllers** work over Bluetooth in Chrome, Edge, Firefox, and Safari (macOS & iOS 16+) via the W3C **Gamepad API** (`navigator.getGamepads()`), with optional **WebHID** direct pairing (`navigator.hid.requestDevice`) on Chromium desktop.
- Pressing any button on the real Bluetooth controller immediately depresses and illuminates the matching 3D button on screen (including analog `L2/R2` and `LT/RT` pressure).
- In **Live Test (`mode="practice"`)**, the engine detects **PERFECT (`±95ms`)**, **GOOD (`±210ms`)**, **TOO EARLY / TOO LATE (`±360ms`)**, **WRONG BUTTON**, and **MISSED** steps, fires dual-rumble haptic feedback (`vibrationActuator`), flashes crimson red on mistakes / emerald green on hits, and reports real-time accuracy & error counts via `onPracticeFeedback` and `window.AstroTrainerAPI.getPracticeStats()`.

### Next.js Integration (`ssr: false` required for WebGL)

```tsx
'use client';

import dynamic from 'next/dynamic';

const ControllerTrainerStage = dynamic(
  () => import('./sdk').then((mod) => mod.ControllerTrainerStage),
  { ssr: false },
);

export function SkillControllerCard() {
  return (
    <div className="w-full h-[500px] sm:h-[620px] rounded-2xl overflow-hidden">
      <ControllerTrainerStage
        initialDevice="ps5"
        apiBaseUrl="/api/controller-sequences/{device}"
        autoPlay
      />
    </div>
  );
}
```

### Component Props (`ControllerTrainerProps`)

| Prop | Type | Description |
| :--- | :--- | :--- |
| `initialDevice` | `'ps5' \| 'playstation' \| 'xbox' \| 'pc' \| 'ipad' \| 'ios'` | Initial active platform (default `'ps5'`). |
| `apiBaseUrl` | `string` | REST endpoint URL. Supports `{device}` placeholder or appends `?device=<id>`. |
| `fetchSequence` | `(device, presetId?) => Promise<BackendSequencePayload \| TrainingSequence>` | Custom async loader (overrides `apiBaseUrl`). |
| `sequences` | `Partial<Record<DeviceType, TrainingSequence>>` | Direct reactive sequence state per platform. |
| `presets` | `Partial<Record<DeviceType, DemoPreset[]>>` | Optional sequence selector presets shown in the dock. |
| `models` | `Partial<Record<DeviceType, DeviceModelUrls>>` | Custom `.glb` URLs for foreground devices and/or 3D backgrounds. |
| `meshMappings` | `Partial<Record<DeviceType, DeviceMeshMapping>>` | Optional button ID to custom GLB mesh name mapping. |
| `surfaceAnchors` | `Partial<Record<DeviceType, DeviceAnchorMap>>` | Optional exact 3D local surface pins (`{ point, normal }`). |
| `autoPlay` | `boolean` | Automatically start playback when a sequence loads. |
| `hideDeviceSwitcher` | `boolean` | Hide the top platform bar when your host app controls platform switching. |

---

## 4. Backend REST API JSON Contract

Your backend endpoint may return **either** a raw `TrainingSequence` object **or** a full envelope containing multiple presets and optional mesh mappings.

Example for a skill combo like **"Precision Driven Through Ball (L1 + R1 + Triangle)"**:

```json
{
  "sequence": {
    "title": "Precision Driven Through Ball (L1 + R1 + Triangle)",
    "duration_ms": 2800,
    "events": [
      {
        "id": "ev-1",
        "target_mesh": "BTN_L1",
        "label": "Hold Modifier (L1)",
        "description": "Hold left bumper to trigger driven loft modifier",
        "start_ms": 250,
        "end_ms": 1850,
        "tilt": { "x": 0.08, "y": -0.05, "z": 0.09 },
        "color": "#38bdf8"
      },
      {
        "id": "ev-2",
        "target_mesh": "BTN_R1",
        "label": "Hold Precision (R1)",
        "description": "Combine right bumper for threaded pass curve",
        "start_ms": 500,
        "end_ms": 1850,
        "tilt": { "x": 0.08, "y": 0.05, "z": -0.09 },
        "color": "#f472b6"
      },
      {
        "id": "ev-3",
        "target_mesh": "BTN_TRIANGLE",
        "label": "Release Through Ball (Triangle)",
        "description": "Tap Triangle to launch the driven through pass",
        "start_ms": 1150,
        "end_ms": 1950,
        "tilt": { "x": 0.1, "y": 0.06, "z": -0.1 },
        "color": "#34d399"
      }
    ]
  }
}
```

### Standard `target_mesh` IDs

- **PlayStation (`ps5`)**: `BTN_CROSS`, `BTN_CIRCLE`, `BTN_SQUARE`, `BTN_TRIANGLE`, `BTN_L1`, `BTN_R1`, `BTN_L2`, `BTN_R2`, `BTN_DPAD_UP`, `BTN_DPAD_DOWN`, `BTN_DPAD_LEFT`, `BTN_DPAD_RIGHT`, `BTN_L3`, `BTN_R3`, `BTN_TOUCHPAD`, `BTN_PS`, `BTN_SHARE`, `BTN_OPTIONS`
- **Xbox (`xbox`)**: `BTN_A`, `BTN_B`, `BTN_X`, `BTN_Y`, `BTN_LB`, `BTN_RB`, `BTN_LT`, `BTN_RT`, `BTN_DPAD_UP`, `BTN_DPAD_DOWN`, `BTN_DPAD_LEFT`, `BTN_DPAD_RIGHT`, `BTN_LS`, `BTN_RS`, `BTN_XBOX`, `BTN_VIEW`, `BTN_MENU`
- **PC (`pc`)**: `BTN_LMB`, `BTN_RMB`, `BTN_MMB`, `BTN_SIDE_1`, `BTN_SIDE_2`, `BTN_DPI`, `KEY_W`, `KEY_A`, `KEY_S`, `KEY_D`, `KEY_SPACE`, `KEY_SHIFT`, `KEY_CTRL`, `KEY_Q`, `KEY_E`, `KEY_R`, `KEY_F`, `KEY_TAB`, `KEY_ESC`, `KEY_1`, `KEY_2`
- **iOS (`ipad`)**: `TOUCH_MOVE`, `TOUCH_AIM`, `TOUCH_FIRE`, `TOUCH_JUMP`, `TOUCH_ULT` (plus optional `touch: { x: 0..1, y: 0..1 }` screen coordinates on any event)

---

## 5. Replacing `.glb` 3D Models (No UI Required)

Drop your `.glb` files into `/public/models/` and register them in `/public/models/manifest.json` (or pass the `models` prop directly). Any omitted field seamlessly uses the built-in 3D studio hardware and 3D platform background monument.

```json
{
  "ps5": {
    "deviceGlbUrl": "/models/ps5-dualsense.glb",
    "backgroundGlbUrl": "/models/bg-ps5-console.glb"
  },
  "xbox": {
    "deviceGlbUrl": "/models/xbox-controller.glb",
    "backgroundGlbUrl": "/models/bg-xbox-series-x.glb"
  },
  "pc": {
    "keyboardGlbUrl": "/models/pc-keyboard.glb",
    "mouseGlbUrl": "/models/pc-mouse.glb",
    "backgroundGlbUrl": "/models/bg-pc-rig.glb"
  },
  "ipad": {
    "deviceGlbUrl": "/models/ipad-pro.glb",
    "backgroundGlbUrl": "/models/bg-iphone-pro.glb"
  }
}
```

---

## 6. Imperative JavaScript & Iframe `postMessage` API (Zero-Friction Option)

If your host app uses a non-React framework (or you want total bundle isolation), build this repo (`npm run build`), host `dist/`, and embed it in an `<iframe>`:

```html
<iframe
  src="https://trainer.yourapp.com/?device=ps5&api=https://api.yourapp.com/v1/sequences/{device}&autoplay=1"
  style="width:100%; height:560px; border:0; border-radius:20px;"
  allow="fullscreen"
></iframe>
```

Control the embedded stage from your host page via `postMessage` (or `window.AstroTrainerAPI` when mounted directly):

```ts
// Direct React mount:
window.AstroTrainerAPI?.setDevice('xbox'); // 'ps5' | 'playstation' | 'xbox' | 'pc' | 'ipad' | 'ios'
window.AstroTrainerAPI?.loadSequence('ps5', sequenceJson);
await window.AstroTrainerAPI?.loadFromUrl('pc', 'https://api.yourapp.com/v1/sequences/pc');
window.AstroTrainerAPI?.play();
window.AstroTrainerAPI?.pause();
window.AstroTrainerAPI?.seek(1250);

// Iframe mount:
iframe.contentWindow?.postMessage(
  { type: 'ASTRO_TRAINER_CMD', action: 'loadSequence', device: 'ps5', payload: sequenceJson },
  '*',
);
iframe.contentWindow?.postMessage({ type: 'ASTRO_TRAINER_CMD', action: 'play' }, '*');
```
