import type { DeviceType } from '../types/trainer';

/**
 * W3C Standard Gamepad button indices mapped to canonical PlayStation DualSense IDs.
 * Works natively over Bluetooth & USB in Chrome, Edge, Safari (macOS & iOS 16+), and Firefox.
 */
export const PS5_GAMEPAD_INDEX_MAP: Record<number, string> = {
  0: 'BTN_CROSS',
  1: 'BTN_CIRCLE',
  2: 'BTN_SQUARE',
  3: 'BTN_TRIANGLE',
  4: 'BTN_L1',
  5: 'BTN_R1',
  6: 'BTN_L2',
  7: 'BTN_R2',
  8: 'BTN_SHARE',
  9: 'BTN_OPTIONS',
  10: 'BTN_L3',
  11: 'BTN_R3',
  12: 'BTN_DPAD_UP',
  13: 'BTN_DPAD_DOWN',
  14: 'BTN_DPAD_LEFT',
  15: 'BTN_DPAD_RIGHT',
  16: 'BTN_PS',
  17: 'BTN_TOUCHPAD',
};

/**
 * W3C Standard Gamepad button indices mapped to canonical Xbox Series X|S IDs.
 */
export const XBOX_GAMEPAD_INDEX_MAP: Record<number, string> = {
  0: 'BTN_A',
  1: 'BTN_B',
  2: 'BTN_X',
  3: 'BTN_Y',
  4: 'BTN_LB',
  5: 'BTN_RB',
  6: 'BTN_LT',
  7: 'BTN_RT',
  8: 'BTN_VIEW',
  9: 'BTN_MENU',
  10: 'BTN_LS',
  11: 'BTN_RS',
  12: 'BTN_DPAD_UP',
  13: 'BTN_DPAD_DOWN',
  14: 'BTN_DPAD_LEFT',
  15: 'BTN_DPAD_RIGHT',
  16: 'BTN_XBOX',
};

/**
 * Maps physical PC keyboard KeyboardEvent.code values to canonical PC KEY_* IDs.
 */
export const PC_KEY_CODE_MAP: Record<string, string> = {
  KeyW: 'KEY_W',
  KeyA: 'KEY_A',
  KeyS: 'KEY_S',
  KeyD: 'KEY_D',
  Space: 'KEY_SPACE',
  ShiftLeft: 'KEY_SHIFT',
  ShiftRight: 'KEY_SHIFT',
  ControlLeft: 'KEY_CTRL',
  ControlRight: 'KEY_CTRL',
  KeyQ: 'KEY_Q',
  KeyE: 'KEY_E',
  KeyR: 'KEY_R',
  KeyF: 'KEY_F',
  Tab: 'KEY_TAB',
  Escape: 'KEY_ESC',
  Digit1: 'KEY_1',
  Digit2: 'KEY_2',
};

/**
 * Maps MouseEvent.button values to canonical PC mouse BTN_* IDs.
 */
export const PC_MOUSE_BUTTON_MAP: Record<number, string> = {
  0: 'BTN_LMB',
  1: 'BTN_MMB',
  2: 'BTN_RMB',
  3: 'BTN_SIDE_2',
  4: 'BTN_SIDE_1',
};

/**
 * Auto-detects whether a connected Bluetooth/USB gamepad is PlayStation or Xbox from its HID/Gamepad ID string.
 */
export function detectGamepadBrand(gamepadId: string): 'ps5' | 'xbox' {
  const id = String(gamepadId || '').toLowerCase();
  if (
    id.includes('xbox') ||
    id.includes('microsoft') ||
    id.includes('045e') ||
    id.includes('xinput')
  ) {
    return 'xbox';
  }
  if (
    id.includes('dualsense') ||
    id.includes('dualshock') ||
    id.includes('sony') ||
    id.includes('054c') ||
    id.includes('playstation') ||
    id.includes('ps5') ||
    id.includes('ps4') ||
    id.includes('wireless controller')
  ) {
    return 'ps5';
  }
  return 'ps5';
}

/**
 * Returns a clean, user-friendly display name for a Bluetooth/USB controller ID string.
 */
export function formatControllerDisplayName(gamepadId: string, brand: 'ps5' | 'xbox'): string {
  const lower = String(gamepadId || '').toLowerCase();
  if (lower.includes('dualsense edge')) return 'DualSense Edge';
  if (lower.includes('dualsense') || lower.includes('054c')) return 'PS5 DualSense';
  if (lower.includes('dualshock')) return 'DualShock 4';
  if (lower.includes('xbox')) return 'Xbox Wireless';
  return brand === 'xbox' ? 'Xbox Controller' : 'PlayStation Controller';
}

/**
 * Maps a W3C Gamepad button index to the canonical button ID for the active platform.
 */
export function mapGamepadButtonIndex(
  buttonIndex: number,
  targetPlatform: DeviceType,
): string | null {
  if (targetPlatform === 'xbox') {
    return XBOX_GAMEPAD_INDEX_MAP[buttonIndex] ?? null;
  }
  if (targetPlatform === 'ps5') {
    return PS5_GAMEPAD_INDEX_MAP[buttonIndex] ?? null;
  }
  return null;
}

export interface GamepadButtonSnapshot {
  pressed: boolean;
  value: number;
}

/**
 * Extracts active pressed button IDs & normalized analog values (0..1) from a Gamepad button array.
 * Handles analog triggers (indices 6 & 7) smoothly with a 0.16 deadzone so partial pulls register crisply.
 */
export function readGamepadButtonStates(
  buttons: ReadonlyArray<GamepadButtonSnapshot>,
  targetPlatform: DeviceType,
  triggerThreshold = 0.16,
): Record<string, number> {
  const active: Record<string, number> = {};
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (!btn) continue;
    const isTrigger = i === 6 || i === 7;
    const value = typeof btn.value === 'number' ? Math.max(0, Math.min(1, btn.value)) : btn.pressed ? 1 : 0;
    const isPressed = isTrigger ? btn.pressed || value >= triggerThreshold : btn.pressed || value >= 0.5;
    if (!isPressed) continue;

    const mappedId = mapGamepadButtonIndex(i, targetPlatform);
    if (mappedId) {
      active[mappedId] = Math.max(active[mappedId] ?? 0, isTrigger ? Math.max(0.25, value) : 1);
    }
  }
  return active;
}

/**
 * Formats any canonical button ID (`BTN_R2`, `KEY_SHIFT`, `TOUCH_FIRE`) into a clean short display token.
 */
export function formatShortButtonName(buttonId: string): string {
  return buttonId
    .replace(/^(BTN_|KEY_|TOUCH_)/, '')
    .replaceAll('_', ' ');
}
