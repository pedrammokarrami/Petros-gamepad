import { useMemo } from 'react';
import { ControllerTrainerStage, normalizeDeviceType } from './sdk';

export default function App() {
  // Optional URL query parameters for quick iframe / standalone integration:
  // e.g. /?device=xbox&api=https://api.myapp.com/v1/sequences/{device}&autoplay=1
  const urlConfig = useMemo(() => {
    if (typeof window === 'undefined') {
      return { initialDevice: 'ps5' as const, apiBaseUrl: undefined, autoPlay: false, hideSwitcher: false };
    }
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('device');
    const initialDevice = (deviceParam ? normalizeDeviceType(deviceParam) : null) ?? 'ps5';
    const apiBaseUrl = params.get('api') || undefined;
    const autoPlay = params.get('autoplay') === '1' || params.get('autoplay') === 'true';
    const hideSwitcher = params.get('hideSwitcher') === '1';
    return { initialDevice, apiBaseUrl, autoPlay, hideSwitcher };
  }, []);

  return (
    <ControllerTrainerStage
      initialDevice={urlConfig.initialDevice}
      apiBaseUrl={urlConfig.apiBaseUrl}
      autoPlay={urlConfig.autoPlay}
      hideDeviceSwitcher={urlConfig.hideSwitcher}
    />
  );
}
