/**
 * Browser storage (IndexedDB) for projects and the working copies of their videos.
 * Everything stays in this browser on this device.
 */

const DB_NAME = "subtitle-studio";
const DB_VERSION = 3;
export const PROJECTS = "projects";
export const MEDIA = "media";
export const FONTS = "fonts";
export const PRESETS = "presets";
type StoreName = typeof PROJECTS | typeof MEDIA | typeof FONTS | typeof PRESETS;

export interface MediaRecord {
  id: string;
  filename: string;
  type: string;
  size: number;
  blob: Blob;
}

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA, { keyPath: "id" });
      // Version 2: fonts the user adds.
      if (!db.objectStoreNames.contains(FONTS)) db.createObjectStore(FONTS, { keyPath: "id" });
      // Version 3: named style presets.
      if (!db.objectStoreNames.contains(PRESETS)) db.createObjectStore(PRESETS, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error("IndexedDB could not be opened"));
    };
    req.onblocked = () => {
      opening = null;
      reject(new Error("Close Subtitle Studio in other tabs, then try again."));
    };
  });
  return opening;
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

/** Resolves only when the write is durable (the transaction completed). */
async function write(name: StoreName, fn: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("IndexedDB write failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("IndexedDB write was aborted"));
    };
    fn(tx.objectStore(name));
  });
}

export async function getOne<T>(name: StoreName, key: string): Promise<T | undefined> {
  return request((await store(name, "readonly")).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(name: StoreName): Promise<T[]> {
  return request((await store(name, "readonly")).getAll()) as Promise<T[]>;
}

export async function getAllKeys(name: StoreName): Promise<string[]> {
  const keys = await request((await store(name, "readonly")).getAllKeys());
  return keys.map(String);
}

export const putOne = (name: StoreName, value: unknown) =>
  write(name, (s) => {
    s.put(value);
  });

export const deleteOne = (name: StoreName, key: string) =>
  write(name, (s) => {
    s.delete(key);
  });

/** For tests: forget the cached connection. */
export function resetDbForTests(): void {
  opening = null;
}
