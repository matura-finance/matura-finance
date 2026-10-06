// Remembers the gated route a disconnected user tried to open, so we can send them back there
// after they connect. Stored in sessionStorage (cleared on tab close). Client-only use.
const KEY = "matura.redirectAfterConnect";

export function setPendingRedirect(path: string): void {
  sessionStorage.setItem(KEY, path);
}

/** Reads and clears the pending redirect in one shot; null if none. */
export function takePendingRedirect(): string | null {
  const path = sessionStorage.getItem(KEY);
  if (path !== null) sessionStorage.removeItem(KEY);
  return path;
}

export function clearPendingRedirect(): void {
  sessionStorage.removeItem(KEY);
}
