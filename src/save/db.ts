/** Tiny IndexedDB wrapper (SPEC §2: saves in IndexedDB, settings in localStorage). */
const DB_NAME = 'hotaru';
const STORE = 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kv = {
  get: <T>(key: string) => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx('readwrite', (s) => { s.put(value, key); }),
  del: (key: string) => tx('readwrite', (s) => { s.delete(key); }),
  /** Atomic swap: write temp then real key in one transaction, so a save is never half-written. */
  swap: (key: string, value: unknown) => tx('readwrite', (s) => { s.put(value, key + '.tmp'); s.put(value, key); s.delete(key + '.tmp'); }),
};
