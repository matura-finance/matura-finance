import { z } from "zod";

/**
 * Header-bearer JWT session. Kept in memory (React state) and mirrored to
 * `sessionStorage` so a reload survives without re-signing, but not `localStorage`
 * (smaller XSS blast radius, cleared on tab close). The token subject is bound to the
 * wallet that signed in; a mismatch on rehydrate/switch forces re-SIWE.
 */
const StoredSession = z.object({
  token: z.string(),
  expiresAt: z.string(),
  /** Lowercased address the token was minted for (the SIWE `sub`). */
  subject: z.string(),
});
export type StoredSession = z.infer<typeof StoredSession>;

const STORAGE_KEY = "matura.session";

export function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = StoredSession.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/** True when the session's ISO expiry is in the past (with a small clock-skew margin). */
export function isSessionExpired(session: Pick<StoredSession, "expiresAt">): boolean {
  return Date.parse(session.expiresAt) - 5_000 <= Date.now();
}
