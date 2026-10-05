"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { useAppKit } from "@reown/appkit/react";

import { setPendingRedirect } from "../lib/pending-redirect";

/**
 * Hard gate for non-public routes. The page is never rendered until a wallet is connected: while
 * wagmi is (re)connecting a minimal placeholder shows, and if it settles disconnected the user is
 * sent to the public /vaults page. Only `status === "connected"` renders `children`.
 *
 * Two disconnected cases are distinguished via `wasConnected`:
 *  - Arrived here already disconnected → remember this route and open the connect modal, so after
 *    connecting the user is returned here (see PostConnectRedirect).
 *  - Was connected and then disconnected (intentional) → just leave to /vaults, no modal.
 *
 * Gating on the settled status (not `isConnected`) avoids bouncing a connected user mid-reconnect.
 */
export function RequireConnected({ children }: { children: ReactNode }) {
  const { status } = useAccount();
  const { open } = useAppKit();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);
  const wasConnected = useRef(false);

  useEffect(() => {
    if (status === "connected") {
      wasConnected.current = true;
      return;
    }
    if (status === "disconnected" && !handled.current) {
      handled.current = true;
      if (!wasConnected.current) {
        setPendingRedirect(pathname);
        void open();
      }
      router.replace("/vaults");
    }
  }, [status, open, router, pathname]);

  if (status === "connected") return <>{children}</>;

  return <div className="min-h-dvh bg-muted" aria-busy="true" />;
}
