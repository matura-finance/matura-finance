"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Button } from "@matura/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@matura/ui/components/card";
import { Stack } from "@matura/ui/components/stack";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { ApiError } from "../../lib/api/client";
import type { ClaimWire } from "../../lib/api/schemas";
import { useSession } from "../../lib/auth/session-provider";
import { useInvalidateIssuedClaims, useIssuedClaims } from "../../lib/queries/hooks";
import { Disconnected, NotDeployed, WrongChain } from "../states";
import { Spinner } from "../ui/flow-visuals";
import { ClaimActionDialog, type ClaimAction } from "./claim-action-dialog";
import { CreateClaimDialog } from "./create-claim-dialog";
import { IssuedClaimsTable } from "./issued-claims-table";

export function IssuerView() {
  const { address, isConnected, chainId } = useAccount();
  const { isAuthenticated, isSigningIn, signIn, refresh } = useSession();
  const issued = useIssuedClaims(address);
  const invalidate = useInvalidateIssuedClaims();

  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<{ kind: ClaimAction; claim: ClaimWire } | null>(null);

  // A dead/expired token on the claims poll → re-prompt SIWE (no manual reconnect).
  useEffect(() => {
    const e = issued.error;
    if (e instanceof ApiError && e.status === 401) refresh();
  }, [issued.error, refresh]);

  if (!isConnected || address === undefined) return <Disconnected />;
  if (chainId !== bscTestnet.id) return <WrongChain />;
  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;

  const refetch = () => {
    invalidate(address);
  };

  return (
    <Stack gap="lg">
      <div className="rounded-card border-l-4 border-l-warning bg-warning/10 px-4 py-3 text-sm text-foreground">
        <span className="font-medium">Demo environment.</span> Every action here creates or changes
        a synthetic testnet claim using mock USDT. No real funds move and nothing is a real
        financial obligation.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How The Demo Flows</CardTitle>
          <CardDescription>
            This page plays the issuer. Run the steps in order to see a claim go from issued to
            financed to settled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
            <FlowStep n={1}>
              <span className="text-foreground">Create a claim</span>, payable to any wallet you
              name.
            </FlowStep>
            <FlowStep n={2}>
              An operator marks it eligible for financing (handled behind the scenes).
            </FlowStep>
            <FlowStep n={3}>
              The beneficiary opens{" "}
              <span className="text-foreground">Portfolio → Get Liquidity</span> to finance the
              claim and receive an advance of mock USDT.
            </FlowStep>
            <FlowStep n={4}>
              At maturity, use the <span className="text-foreground">settle</span> action below to
              repay financiers — or <span className="text-foreground">mark it delayed</span> to
              simulate a late payer.
            </FlowStep>
          </ol>
        </CardContent>
      </Card>

      {!isAuthenticated ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              Sign in with your wallet to act as the demo issuer. You&apos;ll approve a quick
              signature — no gas, and no funds move.
            </p>
            <Button disabled={isSigningIn} onClick={() => void signIn()}>
              {isSigningIn ? "Check your wallet…" : "Sign in"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Stack gap="md">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Your Issued Claims
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Claims you&apos;ve registered. Settle or mark them delayed once they&apos;ve
                matured.
              </p>
            </div>
            <Button
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              + Create Claim
            </Button>
          </div>

          {issued.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : issued.isError ? (
            <div className="rounded-card border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
              Couldn&apos;t load your claims.{" "}
              <button
                type="button"
                onClick={() => void issued.refetch()}
                className="text-foreground underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          ) : (
            <IssuedClaimsTable
              claims={issued.data.claims}
              onSettle={(claim) => {
                setAction({ kind: "settle", claim });
              }}
              onDelay={(claim) => {
                setAction({ kind: "delay", claim });
              }}
            />
          )}
        </Stack>
      )}

      <CreateClaimDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={refetch}
      />
      <ClaimActionDialog
        open={action !== null}
        action={action?.kind ?? "settle"}
        claim={action?.claim ?? null}
        onClose={() => {
          setAction(null);
        }}
        onDone={refetch}
      />
    </Stack>
  );
}

/** A single numbered row in the "how the demo flows" list. */
function FlowStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
