import type { DeviceType, PcGlbSlot } from '../types/trainer';

const DB_NAME = 'astro_trainer_glb_db_v1';
const STORE_NAME = 'glb_models';
const DB_VERSION = 1;

export interface PersistedGlbRecord {
  key: string;
  device: DeviceType;
  slot: PcGlbSlot;
  fileName: string;
  buffer: ArrayBuffer;
  savedAt: number;
}

export function getGlbStorageKey(device: DeviceType, slot: PcGlbSlot = 'combined'): string {
  if (device === 'pc' && (slot === 'keyboard' || slot === 'mouse')) {
    return `pc:${slot}`;
  }
  return device;
}

function openGlbDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePersistedGlb(
  device: DeviceType,
  fileName: string,
  buffer: ArrayBuffer,
  slot: PcGlbSlot = 'combined',
): Promise<boolean> {
  const db = await openGlbDatabase();
  if (!db) return false;

  const key = getGlbStorageKey(device, slot);
  // Clone buffer so detached/transferred buffers never corrupt storage
  const safeCopy = buffer.slice(0);
  const record: PersistedGlbRecord = {
    key,
    device,
    slot,
    fileName,
    buffer: safeCopy,
    savedAt: Date.now(),
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // If saving combined PC model, clear individual keyboard/mouse sub-slots; and vice-versa
      if (device === 'pc') {
        if (slot === 'combined') {
          store.delete('pc:keyboard');
          store.delete('pc:mouse');
        } else {
          store.delete('pc');
        }
      }
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadAllPersistedGlbs(): Promise<PersistedGlbRecord[]> {
  const db = await openGlbDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? (req.result as PersistedGlbRecord[]) : [];
        db.close();
        resolve(items);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function deletePersistedGlbForDevice(device: DeviceType): Promise<void> {
  const db = await openGlbDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(device);
      if (device === 'pc') {
        store.delete('pc:keyboard');
        store.delete('pc:mouse');
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
