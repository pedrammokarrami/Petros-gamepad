import { Gamepad2, Keyboard, Mouse, Tablet } from 'lucide-react';
import { DEVICE_PLATFORMS } from '../data/devices';
import type { DeviceType } from '../types/trainer';

interface DeviceSwitcherProps {
  activeDevice: DeviceType;
  onSelect: (device: DeviceType) => void;
}

function DeviceIcon({ id }: { id: DeviceType }) {
  switch (id) {
    case 'ps5':
    case 'xbox':
      return <Gamepad2 className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'pc':
      return (
        <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
          <Keyboard className="w-3.5 h-3.5" />
          <Mouse className="w-3.5 h-3.5" />
        </span>
      );
    case 'ipad':
      return <Tablet className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
}

export function DeviceSwitcher({ activeDevice, onSelect }: DeviceSwitcherProps) {
  return (
    <header className="absolute top-3 sm:top-4 inset-x-0 z-20 flex justify-center px-2 sm:px-3 pointer-events-none">
      <nav
        aria-label="Select controller platform"
        role="tablist"
        className="vision-glass pointer-events-auto inline-flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-full max-w-full overflow-x-auto studio-scroll"
      >
        {DEVICE_PLATFORMS.map((platform) => {
          const isActive = platform.id === activeDevice;
          return (
            <button
              key={platform.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Select ${platform.brandName} — ${platform.subtitle}`}
              onClick={() => onSelect(platform.id)}
              className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                isActive
                  ? 'vision-pill-active text-white'
                  : 'text-slate-300/80 hover:text-white hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <span
                className="hidden sm:inline transition-colors duration-150"
                style={{ color: isActive ? platform.accentHex : undefined }}
              >
                <DeviceIcon id={platform.id} />
              </span>
              <span className="font-semibold tracking-tight">{platform.brandName}</span>
              <span className="hidden lg:inline text-[11px] text-slate-400 font-normal">
                {platform.subtitle}
              </span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
