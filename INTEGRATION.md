# Astro Trainer 3D — Embeddable Integration Guide

This package provides a self-contained, production-ready 3D Controller & Input Timing Stage (`<ControllerTrainerStage />`) supporting **PlayStation (DualSense)**, **Xbox (Series X)**, **PC (Keyboard & Mouse)**, and **iOS (iPad Pro Multi-Touch)** — each with its own matching 3D background hardware environment, spring-damped button choreography, millisecond timeline scrubber, REST API integration, and zero-config drop-in `.glb` replacement.

---

## 1. Dependencies

Install the required runtime packages in your host React / TypeScript application:

```bash
npm install three lucide-react
npm install -D @types/three
```

Ensure Tailwind CSS v4 (or v3) is configured and include the utility classes from `src/index.css` (`.vision-glass`, `.vision-glass-subtle`, `.vision-pill-active`, `.font-mono-tabular`, `.studio-scroll`).

---

## 2. Files to Copy Into Your Host App

Copy these folders directly into your project:

```text
src/
  sdk/
    index.ts                     # Barrel export (import everything from here)
    ControllerTrainerStage.tsx   # Main drop-in React component
    apiClient.ts                 # REST API fetch & payload normalizer
  components/
    DeviceSwitcher.tsx
    CalloutBadge.tsx
    TimelineDock.tsx
  core/
    sequenceEngine.ts            # Timeline evaluator, spring physics & showcase choreography
    meshMapping.ts               # Standard button ID -> GLB mesh name resolver
    glbPlacement.ts              # Auto-orientation & exact 3D anchor math
  data/
    devices.ts                   # Platform metadata, button catalogs & fallback samples
  three/
    StudioSceneController.ts     # WebGL Three.js engine + drop-in GLB loader
    deviceBuilders.ts            # Built-in procedural 3D hardware (PS5, Xbox, PC, iOS)
    backgroundEnvironments.ts    # Built-in 3D background monuments (PS5, Series X, PC Rig, iPhone Pro)
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

## 3. React Integration (Recommended)

Render `<ControllerTrainerStage />` inside any container with an explicit width & height:

```tsx
import { ControllerTrainerStage } from './sdk';

export function LessonInputTrainer() {
  return (
    <div className="w-full h-[680px] rounded-2xl overflow-hidden">
      <ControllerTrainerStage
        initialDevice="ps5"
        // Option A: REST endpoint (supports `{device}` template or auto `?device=...`)
        apiBaseUrl="https://api.yourapp.com/v1/controller-sequences/{device}"
        // Option B: Custom async fetcher (e.g., with auth token / Axios)
        // fetchSequence={async (device, presetId) => myApi.getSequence(device, presetId)}
        autoPlay={false}
        onDeviceChange={(device) => console.log('Active platform:', device)}
        onActiveEventsChange={(events, timeMs) => {
          // Sync with video player, HUD tips, or lesson tracker
        }}
        onApiError={(err, device) => console.warn(device, err.message)}
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

Your backend endpoint may return **either** a raw `TrainingSequence` object **or** a full envelope containing multiple presets and optional mesh mappings:

```json
{
  "sequence": {
    "title": "DualSense Parry & Counter Combo",
    "duration_ms": 3800,
    "events": [
      {
        "id": "ev-1",
        "target_mesh": "BTN_L1",
        "label": "Perfect Guard (L1)",
        "description": "Tap left bumper right before impact",
        "start_ms": 280,
        "end_ms": 880,
        "tilt": { "x": 0.08, "y": -0.05, "z": 0.1 },
        "color": "#38bdf8"
      },
      {
        "id": "ev-2",
        "target_mesh": "BTN_R2",
        "label": "Adaptive Trigger Finisher (R2)",
        "description": "Pull full right trigger through resistance",
        "start_ms": 1400,
        "end_ms": 2200,
        "tilt": { "x": 0.1, "y": 0.06, "z": -0.1 },
        "color": "#f472b6"
      }
    ]
  },
  "presets": [
    {
      "id": "combo-1",
      "shortLabel": "1. Parry & Counter",
      "sequence": { "title": "...", "duration_ms": 3800, "events": [] }
    }
  ],
  "activePresetId": "combo-1",
  "meshMapping": {
    "BTN_L1": "MyCustomGlb_L1_Mesh"
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

## 6. Imperative JavaScript & Iframe `postMessage` API

### Direct Browser API (`window.AstroTrainerAPI`)

```ts
window.AstroTrainerAPI?.setDevice('xbox'); // 'ps5' | 'playstation' | 'xbox' | 'pc' | 'ipad' | 'ios'
window.AstroTrainerAPI?.loadSequence('ps5', sequenceJson);
await window.AstroTrainerAPI?.loadFromUrl('pc', 'https://api.yourapp.com/v1/sequences/pc');
window.AstroTrainerAPI?.play();
window.AstroTrainerAPI?.pause();
window.AstroTrainerAPI?.seek(1250);
window.AstroTrainerAPI?.setLoop(true);
window.AstroTrainerAPI?.resetCamera();
const state = window.AstroTrainerAPI?.getState();
```

### Iframe Embedding & `postMessage`

You can also embed the compiled app in an `<iframe>` using URL query parameters:

```html
<iframe
  src="https://trainer.yourapp.com/?device=ps5&api=https://api.yourapp.com/v1/sequences/{device}"
  style="width:100%; height:680px; border:0;"
></iframe>
```

Control the iframe from your host page via `postMessage`:

```ts
iframe.contentWindow?.postMessage(
  { type: 'ASTRO_TRAINER_CMD', action: 'loadSequence', device: 'ps5', payload: sequenceJson },
  '*',
);
iframe.contentWindow?.postMessage({ type: 'ASTRO_TRAINER_CMD', action: 'play' }, '*');
```
