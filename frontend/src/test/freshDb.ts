import "fake-indexeddb/auto";
import { resetPresetsForTests } from "../api/presets";
import { resetDbForTests } from "../engine/db";

/** An empty browser database for each test. */
export async function freshDb(): Promise<void> {
  resetDbForTests();
  resetPresetsForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("subtitle-studio");
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      reject(req.error ?? new Error("delete failed"));
    };
  });
}
