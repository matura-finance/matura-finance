"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { takePendingRedirect } from "../lib/pending-redirect";

/**
 * Global watcher (mounted once in the provider tree): when the wallet becomes connected and a gated
 * route was remembered (because the user was bounced to /vaults to connect), sends them back there.
 * No pending redirect → does nothing, so a plain connect on /vaults stays on /vaults.
 */
export function PostConnectRedirect() {
  const { status } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (status !== "connected") return;
    const path = takePendingRedirect();
    if (path !== null) router.replace(path);
  }, [status, router]);

  return null;
}
