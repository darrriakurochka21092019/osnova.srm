export type OfflineDraft = {
  elements: any[];
  base: any[];
  files: Record<string, any>;
  pending?: { id: string; changes: any[] } | null;
};
let connection: Promise<IDBDatabase> | undefined;
function db() {
  return (connection ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('osnova-pending', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pages');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function readDraft(key: string): Promise<OfflineDraft | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('pages', 'readonly').objectStore('pages').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function writeDraft(key: string, value: OfflineDraft | null) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    if (value) store.put(value, key);
    else store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
