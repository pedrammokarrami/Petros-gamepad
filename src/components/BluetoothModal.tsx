import { Bluetooth, CheckCircle2, Gamepad2, Radio, X } from 'lucide-react';
import { formatShortButtonName } from '../core/gamepadMapper';
import { HardwareInputService } from '../sdk/hardwareInputService';
import type { ConnectedControllerInfo, DeviceType } from '../types/trainer';

interface BluetoothModalProps {
  open: boolean;
  activeDevice: DeviceType;
  controller: ConnectedControllerInfo | null;
  pressedButtons: string[];
  onClose: () => void;
  onScanBluetooth: () => void;
  onStartLiveTest: () => void;
}

export function BluetoothModal({
  open,
  activeDevice,
  controller,
  pressedButtons,
  onClose,
  onScanBluetooth,
  onStartLiveTest,
}: BluetoothModalProps) {
  if (!open) return null;

  const supportsWebHid = HardwareInputService.isWebHidSupported();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bluetooth Controller Connection"
      className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/55"
      onClick={onClose}
    >
      <div
        className="vision-glass rounded-3xl w-full max-w-[440px] p-5 sm:p-6 space-y-4 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                controller
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-400/35'
              }`}
            >
              <Bluetooth className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Bluetooth Controller Setup
              </h2>
              <p className="text-[11px] text-slate-400">
                Test combos live with your physical DualSense or Xbox pad
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Bluetooth dialog"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Live Connection Card */}
        {controller ? (
          <div className="rounded-2xl bg-emerald-500/12 border border-emerald-400/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-white truncate">
                  {controller.name}
                </span>
              </div>
              <span className="font-mono-tabular text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 shrink-0">
                Connected
              </span>
            </div>

            <p className="text-[11px] text-slate-300">
              Press any button on your controller to watch it light up live on the 3D stage.
            </p>

            {/* Real-time Pressed Buttons Readout */}
            <div className="flex flex-wrap items-center gap-1.5 min-h-[26px] pt-1">
              {pressedButtons.length > 0 ? (
                pressedButtons.map((btn) => (
                  <span
                    key={btn}
                    className="font-mono-tabular text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-sky-500/25 border border-sky-400/50 text-sky-200"
                  >
                    {formatShortButtonName(btn)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-400 italic">
                  Waiting for button input...
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-200">
              <Radio className="w-4 h-4 text-sky-400 animate-pulse shrink-0" aria-hidden="true" />
              <span>Listening for Bluetooth controllers...</span>
            </div>

            <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
              <div className="flex items-start gap-2">
                <Gamepad2 className="w-3.5 h-3.5 text-sky-300 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-white">PS5 DualSense:</span> Hold{' '}
                  <span className="font-mono-tabular text-sky-200">Create + PS</span> for 3s until
                  the lightbar blinks, pair in OS Bluetooth settings, then press any button.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-white">Xbox Wireless:</span> Hold the top{' '}
                  <span className="font-mono-tabular text-emerald-200">Pair</span> button until the
                  Xbox logo flashes, pair in Bluetooth settings, then press any button.
                </div>
              </div>
              {activeDevice === 'pc' && (
                <p className="text-slate-400 pt-1">
                  PC mode also reads your real Keyboard &amp; Mouse directly during Live Test.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onScanBluetooth}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-medium text-white transition-colors cursor-pointer"
          >
            <Bluetooth className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
            <span>{supportsWebHid ? 'Pair / Scan Bluetooth' : 'Scan Controller'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onStartLiveTest();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>Start Live Test</span>
          </button>
        </div>
      </div>
    </div>
  );
}
