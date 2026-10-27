export type OfflineDraft = {
  elements: any[];
  base: any[];
  files: Record<string, any>;
  pending?: { id: string; changes: any[] } | null;
};
type StoredDraft = OfflineDraft & { fileIds?: string[] };
let connection: Promise<IDBDatabase> | undefined;
const fileKey = (key: string, id: string) => [key, id];
const fileRange = (key: string) => IDBKeyRange.bound([key, ''], [key, '\uffff']);
function db() {
  return (connection ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('osnova-pending', 2);
    let blocked = false;
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('pages')) r.result.createObjectStore('pages');
      if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files');
    };
    r.onblocked = () => {
      blocked = true;
      reject(
        new Error(
          'Закройте другие вкладки «Основы» и обновите эту страницу: локальное хранилище обновляется.',
        ),
      );
    };
    r.onsuccess = () => {
      if (blocked) {
        r.result.close();
        return;
      }
      r.result.onversionchange = () => {
        r.result.close();
        connection = undefined;
      };
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
  }));
}
export async function readDraft(key: string): Promise<OfflineDraft | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(['pages', 'files'], 'readwrite');
    let value: StoredDraft | undefined;
    const r = tx.objectStore('pages').get(key);
    r.onsuccess = () => {
      value = r.result;
      if (!value) tx.objectStore('files').delete(fileRange(key));
      if (!value?.fileIds) return; // Version 1 drafts already contain their files.
      value.files = {};
      for (const id of value.fileIds) {
        const stored = tx.objectStore('files').get(fileKey(key, id));
        stored.onsuccess = () => {
          if (stored.result) {
            value!.files[id] = stored.result;
          }
        };
      }
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function writeDraft(key: string, value: OfflineDraft | null) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(['pages', 'files'], 'readwrite');
    const store = tx.objectStore('pages');
    if (value) {
      // Immutable image binaries are cached once, never cloned again for every pen movement.
      for (const [id, file] of Object.entries(value.files)) {
        const cacheKey = fileKey(key, id);
        const exists = tx.objectStore('files').getKey(cacheKey);
        exists.onsuccess = () => {
          if (exists.result === undefined) tx.objectStore('files').put(file, cacheKey);
        };
      }
      store.put({ ...value, files: {}, fileIds: Object.keys(value.files) }, key);
    } else store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function pruneDraftFiles(key: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(['pages', 'files'], 'readwrite');
    const draft = tx.objectStore('pages').getKey(key);
    draft.onsuccess = () => {
      if (draft.result === undefined) tx.objectStore('files').delete(fileRange(key));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
