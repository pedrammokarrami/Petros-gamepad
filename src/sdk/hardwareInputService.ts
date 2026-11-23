import {
  PC_KEY_CODE_MAP,
  PC_MOUSE_BUTTON_MAP,
  detectGamepadBrand,
  formatControllerDisplayName,
  readGamepadButtonStates,
} from '../core/gamepadMapper';
import type { ConnectedControllerInfo, DeviceType } from '../types/trainer';

export interface HardwareInputCallbacks {
  onConnectionChange: (controller: ConnectedControllerInfo | null) => void;
  onButtonPress: (buttonId: string, value: number) => void;
  onButtonRelease: (buttonId: string) => void;
  onActiveButtonsChange: (pressedMap: Record<string, number>) => void;
}

interface WebHidNavigator extends Navigator {
  hid?: {
    requestDevice: (options: {
      filters: Array<{ vendorId?: number; usagePage?: number; usage?: number }>;
    }) => Promise<Array<{ productName?: string; vendorId?: number; opened?: boolean; open?: () => Promise<void> }>>;
  };
}

type DualRumbleActuator = {
  playEffect?: (
    type: 'dual-rumble',
    params: {
      startDelay?: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<unknown>;
};

function getActuator(pad: Gamepad | null | undefined): DualRumbleActuator | null {
  if (!pad) return null;
  const candidate = (pad as unknown as { vibrationActuator?: DualRumbleActuator })
    .vibrationActuator;
  return candidate && typeof candidate.playEffect === 'function' ? candidate : null;
}

/**
 * Browser-native Real Hardware Input Service:
 * - Connects seamlessly to Bluetooth/USB PlayStation DualSense & Xbox Wireless Controllers via W3C Gamepad API
 * - Supports optional direct Bluetooth HID pairing prompt via WebHID (Sony 0x054c & Microsoft 0x045e) on Chromium
 * - Triggers real dual-rumble haptic feedback (`vibrationActuator`) on Perfect Hits & Wrong/Missed Errors
 * - Captures physical PC Keyboard & Mouse inputs when practicing on the PC platform
 */
export class HardwareInputService {
  private callbacks: HardwareInputCallbacks;
  private activeDevice: DeviceType = 'ps5';
  private capturePcInputs = false;

  private connectedInfo: ConnectedControllerInfo | null = null;
  private activeGamepadIndex: number | null = null;
  private prevPressed: Record<string, number> = {};
  private pcPressed: Record<string, number> = {};
  private simulatedPressed: Record<string, number> = {};

  private rafId = 0;
  private destroyed = false;

  constructor(callbacks: HardwareInputCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.handleGamepadConnected);
      window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('mousedown', this.handleMouseDown);
      window.addEventListener('mouseup', this.handleMouseUp);
      this.scanExistingGamepads();
      this.startPolling();
    }
  }

  public setTargetDevice(device: DeviceType) {
    this.activeDevice = device;
    this.pcPressed = {};
    this.emitMergedPressed();
  }

  public setCapturePcInputs(enabled: boolean) {
    this.capturePcInputs = enabled;
    if (!enabled) {
      this.pcPressed = {};
      this.emitMergedPressed();
    }
  }

  public getConnectedController(): ConnectedControllerInfo | null {
    return this.connectedInfo;
  }

  public static isWebHidSupported(): boolean {
    if (typeof navigator === 'undefined') return false;
    return Boolean((navigator as WebHidNavigator).hid?.requestDevice);
  }

  /**
   * Scans already-paired Bluetooth/USB gamepads first; if none are active and WebHID is available,
   * prompts the browser's Bluetooth/HID controller picker for Sony DualSense & Microsoft Xbox controllers.
   */
  public async connectBluetooth(): Promise<ConnectedControllerInfo | null> {
    const existing = this.scanExistingGamepads();
    if (existing) {
      this.triggerHaptic('connect');
      return existing;
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as WebHidNavigator) : null;
    if (nav?.hid?.requestDevice) {
      try {
        const devices = await nav.hid.requestDevice({
          filters: [
            { vendorId: 0x054c }, // Sony Interactive Entertainment (DualSense / DualShock)
            { vendorId: 0x045e }, // Microsoft (Xbox Wireless / Series X|S)
            { usagePage: 0x01, usage: 0x05 }, // Generic Bluetooth Gamepad
          ],
        });
        if (devices && devices.length > 0) {
          const dev = devices[0];
          const brand = dev.vendorId === 0x045e ? 'xbox' : detectGamepadBrand(dev.productName ?? '');
          const info: ConnectedControllerInfo = {
            id: dev.productName || 'Bluetooth Controller',
            name: formatControllerDisplayName(dev.productName ?? '', brand),
            index: this.activeGamepadIndex ?? 0,
            detectedDevice: brand,
            connectionType: 'webhid',
            hasHaptics: false,
            connectedAt: Date.now(),
          };
          this.connectedInfo = info;
          this.callbacks.onConnectionChange(info);
          // Re-scan Gamepad API shortly after HID permission grant
          window.setTimeout(() => {
            this.scanExistingGamepads();
          }, 300);
          return info;
        }
      } catch {
        // User cancelled WebHID dialog or browser blocked it — fall back to passive Gamepad API scan
      }
    }

    return this.scanExistingGamepads();
  }

  /**
   * Fires physical dual-rumble haptic feedback on the connected Bluetooth controller if supported.
   */
  public triggerHaptic(kind: 'connect' | 'hit' | 'error') {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    if (this.activeGamepadIndex === null) return;
    const pads = navigator.getGamepads();
    const actuator = getActuator(pads[this.activeGamepadIndex]);
    if (!actuator?.playEffect) return;

    try {
      if (kind === 'hit') {
        void actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 55,
          weakMagnitude: 0.45,
          strongMagnitude: 0.18,
        });
      } else if (kind === 'error') {
        void actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 170,
          weakMagnitude: 0.85,
          strongMagnitude: 0.72,
        });
      } else {
        void actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 90,
          weakMagnitude: 0.5,
          strongMagnitude: 0.35,
        });
      }
    } catch {
      // Haptic API unsupported on this browser/driver
    }
  }

  /**
   * Programmatic hardware input simulator (allows host apps & automated tests to drive live practice identically to a Bluetooth pad).
   */
  public simulateInput(buttonId: string, pressed: boolean, value = 1) {
    if (!this.connectedInfo && (this.activeDevice === 'ps5' || this.activeDevice === 'xbox')) {
      const brand = this.activeDevice === 'xbox' ? 'xbox' : 'ps5';
      this.connectedInfo = {
        id: brand === 'xbox' ? 'Xbox Wireless Controller (Bluetooth)' : 'DualSense Wireless Controller (Bluetooth)',
        name: brand === 'xbox' ? 'Xbox Wireless' : 'PS5 DualSense',
        index: 0,
        detectedDevice: brand,
        connectionType: 'simulated',
        hasHaptics: false,
        connectedAt: Date.now(),
      };
      this.callbacks.onConnectionChange(this.connectedInfo);
    }

    const wasPressed = (this.simulatedPressed[buttonId] ?? 0) > 0;
    if (pressed) {
      this.simulatedPressed[buttonId] = Math.max(0.25, Math.min(1, value));
      if (!wasPressed) {
        this.callbacks.onButtonPress(buttonId, this.simulatedPressed[buttonId]);
      }
    } else {
      delete this.simulatedPressed[buttonId];
      if (wasPressed) {
        this.callbacks.onButtonRelease(buttonId);
      }
    }
    this.emitMergedPressed();
  }

  public scanExistingGamepads(): ConnectedControllerInfo | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad && pad.connected) {
        return this.registerGamepad(pad);
      }
    }
    return null;
  }

  private registerGamepad(pad: Gamepad): ConnectedControllerInfo {
    const brand = detectGamepadBrand(pad.id);
    const info: ConnectedControllerInfo = {
      id: pad.id,
      name: formatControllerDisplayName(pad.id, brand),
      index: pad.index,
      detectedDevice: brand,
      connectionType: 'bluetooth-gamepad',
      hasHaptics: Boolean(getActuator(pad)),
      connectedAt: Date.now(),
    };
    this.activeGamepadIndex = pad.index;
    const changed =
      !this.connectedInfo ||
      this.connectedInfo.id !== info.id ||
      this.connectedInfo.connectionType !== info.connectionType;
    this.connectedInfo = info;
    if (changed) {
      this.callbacks.onConnectionChange(info);
    }
    return info;
  }

  private handleGamepadConnected = (e: GamepadEvent) => {
    this.registerGamepad(e.gamepad);
    this.triggerHaptic('connect');
  };

  private handleGamepadDisconnected = (e: GamepadEvent) => {
    if (this.activeGamepadIndex === e.gamepad.index) {
      this.activeGamepadIndex = null;
      this.prevPressed = {};
      const fallback = this.scanExistingGamepads();
      if (!fallback) {
        this.connectedInfo = null;
        this.callbacks.onConnectionChange(null);
      }
      this.emitMergedPressed();
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.capturePcInputs || this.activeDevice !== 'pc') return;
    if (e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const btnId = PC_KEY_CODE_MAP[e.code];
    if (!btnId) return;
    if (e.code === 'Space' || e.code === 'Tab') {
      e.preventDefault();
    }
    this.pcPressed[btnId] = 1;
    this.callbacks.onButtonPress(btnId, 1);
    this.emitMergedPressed();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (this.activeDevice !== 'pc') return;
    const btnId = PC_KEY_CODE_MAP[e.code];
    if (!btnId || !this.pcPressed[btnId]) return;
    delete this.pcPressed[btnId];
    this.callbacks.onButtonRelease(btnId);
    this.emitMergedPressed();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.capturePcInputs || this.activeDevice !== 'pc') return;
    // Ignore clicks on buttons/HUD controls so UI stays effortless to click
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, [role="slider"], [role="tablist"], [role="dialog"]')) {
      return;
    }
    const btnId = PC_MOUSE_BUTTON_MAP[e.button];
    if (!btnId) return;
    this.pcPressed[btnId] = 1;
    this.callbacks.onButtonPress(btnId, 1);
    this.emitMergedPressed();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (this.activeDevice !== 'pc') return;
    const btnId = PC_MOUSE_BUTTON_MAP[e.button];
    if (!btnId || !this.pcPressed[btnId]) return;
    delete this.pcPressed[btnId];
    this.callbacks.onButtonRelease(btnId);
    this.emitMergedPressed();
  };

  private startPolling() {
    const poll = () => {
      if (this.destroyed) return;
      this.pollGamepadFrame();
      this.rafId = window.requestAnimationFrame(poll);
    };
    this.rafId = window.requestAnimationFrame(poll);
  }

  private pollGamepadFrame() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null =
      this.activeGamepadIndex !== null ? pads[this.activeGamepadIndex] ?? null : null;

    if (!pad || !pad.connected) {
      for (let i = 0; i < pads.length; i++) {
        const candidate = pads[i];
        if (candidate && candidate.connected) {
          pad = candidate;
          this.registerGamepad(candidate);
          break;
        }
      }
    }

    if (!pad || !pad.connected) return;

    const mapTarget: DeviceType =
      this.activeDevice === 'xbox' || this.activeDevice === 'ps5'
        ? this.activeDevice
        : this.connectedInfo?.detectedDevice ?? 'ps5';

    const nextPressed = readGamepadButtonStates(pad.buttons, mapTarget);

    let changed = false;
    // Detect rising edges (newly pressed buttons)
    for (const [btnId, val] of Object.entries(nextPressed)) {
      const prevVal = this.prevPressed[btnId];
      if (prevVal === undefined) {
        changed = true;
        this.callbacks.onButtonPress(btnId, val);
      } else if (Math.abs(prevVal - val) > 0.04) {
        changed = true;
      }
    }
    // Detect falling edges (released buttons)
    for (const btnId of Object.keys(this.prevPressed)) {
      if (nextPressed[btnId] === undefined) {
        changed = true;
        this.callbacks.onButtonRelease(btnId);
      }
    }

    if (changed) {
      this.prevPressed = nextPressed;
      this.emitMergedPressed();
    }
  }

  private emitMergedPressed() {
    const merged: Record<string, number> = {
      ...this.prevPressed,
      ...this.pcPressed,
      ...this.simulatedPressed,
    };
    this.callbacks.onActiveButtonsChange(merged);
  }

  public dispose() {
    this.destroyed = true;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('mousedown', this.handleMouseDown);
      window.removeEventListener('mouseup', this.handleMouseUp);
    }
  }
}
