"use client";

import { useEffect, useState } from "react";

/** Isolated leaf so the per-second tick re-renders only this node, not the route breakdown. */
export function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, Date.parse(expiresAt) - Date.now()),
  );

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, Date.parse(expiresAt) - Date.now());
      setRemainingMs(r);
      if (r === 0) onExpire();
    };
    tick(); // fire immediately so an already-expired route never shows a live Confirm
    const id = setInterval(tick, 1_000);
    return () => {
      clearInterval(id);
    };
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return (
    <span className="font-mono tabular-nums" aria-label={`Route expires in ${mm}:${ss}`}>
      {mm}:{ss}
    </span>
  );
}
