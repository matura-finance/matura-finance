"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useAccountEffect, useSignMessage } from "wagmi";

import { getNonce, postVerify } from "../api/endpoints";
import { env } from "../env";
import {
  clearStoredSession,
  isSessionExpired,
  loadStoredSession,
  saveStoredSession,
  type StoredSession,
} from "./session";

interface SessionContextValue {
  /** The bearer token for authed API calls, or null when not signed in. */
  token: string | null;
  isAuthenticated: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const [session, setSession] = useState<StoredSession | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lowerAddress = address?.toLowerCase();

  const drop = useCallback(() => {
    clearStoredSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  // Rehydrate on mount / when the active account resolves. Only trust a stored token
  // whose subject matches the active wallet and that hasn't expired.
  useEffect(() => {
    const stored = loadStoredSession();
    if (stored === null) return;
    if (isSessionExpired(stored) || stored.subject !== lowerAddress) {
      drop();
      return;
    }
    setSession(stored);
  }, [lowerAddress, drop]);

  // Any account/chain change or disconnect invalidates the session (subject binding).
  useAccountEffect({ onDisconnect: drop });
  useEffect(() => {
    if (session !== null && session.subject !== lowerAddress) drop();
  }, [session, lowerAddress, drop]);

  const signIn = useCallback(async () => {
    if (lowerAddress === undefined || address === undefined) return;
    setIsSigningIn(true);
    setError(null);
    try {
      const { nonce } = await getNonce();
      const message = createSiweMessage({
        address,
        chainId: env.chainId,
        domain: window.location.host,
        uri: window.location.origin,
        version: "1",
        nonce,
        statement: "Sign in to Matura",
        issuedAt: new Date(),
      });
      const signature = await signMessageAsync({ account: address, message });
      const { token, expiresAt } = await postVerify(message, signature);
      const next: StoredSession = { token, expiresAt, subject: lowerAddress };
      saveStoredSession(next);
      setSession(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setIsSigningIn(false);
    }
  }, [address, lowerAddress, signMessageAsync]);

  const value = useMemo<SessionContextValue>(
    () => ({
      token: session?.token ?? null,
      isAuthenticated: session !== null,
      isSigningIn,
      error,
      signIn,
      signOut: drop,
    }),
    [session, isSigningIn, error, signIn, drop],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
