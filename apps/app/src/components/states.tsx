import { Card, CardContent, CardDescription, CardTitle } from "@matura/ui/components/card";
import type { ReactNode } from "react";

/**
 * Shared UX-state panels. Every state ships a live next-action (acceptance: no dead
 * ends). Tone: `warning` = caution rail (RPC / not-deployed), default = neutral.
 */
export function StatePanel({
  title,
  body,
  action,
  tone = "neutral",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <Card className={tone === "warning" ? "border-l-4 border-l-warning" : undefined}>
      <CardContent className="flex flex-col items-start gap-3 py-8">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
        {action}
      </CardContent>
    </Card>
  );
}

export function Disconnected({ action }: { action?: ReactNode }) {
  return (
    <StatePanel
      title="Connect your wallet"
      body="Connect a wallet to view your Matura Account and request liquidity against verified future payments."
      action={action}
    />
  );
}

export function WrongChain({ action }: { action?: ReactNode }) {
  return (
    <StatePanel
      title="Switch to BNB Chain Testnet"
      body="Matura is currently available on BNB Chain Testnet. Switch networks to continue."
      action={action}
    />
  );
}

export function EmptyAccount() {
  return (
    <StatePanel
      title="No verified payments yet"
      body="Matura Claims appear here after an approved issuer or supported onchain source verifies a future payment."
    />
  );
}

export function RpcUnavailable({ action }: { action?: ReactNode }) {
  return (
    <StatePanel
      tone="warning"
      title="Can't reach the network"
      body="We couldn't read from BNB Chain Testnet. This is usually temporary — check your connection and try again."
      action={action}
    />
  );
}

export function NotDeployed() {
  return (
    <StatePanel
      tone="warning"
      title="Contracts deploying soon"
      body="The Matura Protocol is not yet deployed on this network. Live account data and execution will be available once contracts are published."
    />
  );
}
