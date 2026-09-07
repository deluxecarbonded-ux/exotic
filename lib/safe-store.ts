/* Crash-proof storage — works in EVERY embed context:
   - normal browser  → localStorage (persistent)
   - sandboxed iframe (localStorage throws) → in-memory map
   Never throws, never crashes the app over storage. */

const mem = new Map<string, string>();

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return mem.has(key) ? mem.get(key)! : null;
  }
}
function lsSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    mem.set(key, value);
  }
}
function lsDel(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
  mem.delete(key);
}

/* Storage-like adapter for supabase-js auth (Web Storage API shape) */
export const safeStorage = {
  getItem: (key: string) => lsGet(key),
  setItem: (key: string, value: string) => lsSet(key, value),
  removeItem: (key: string) => lsDel(key),
};

/* thin helpers for app settings (theme / locale / sound / ai) */
export const safeGet = lsGet;
export const safeSet = lsSet;
export const safeDel = lsDel;
