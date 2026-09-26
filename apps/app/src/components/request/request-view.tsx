"use client";

import { maturaRouterAbi } from "@matura/chain/abis";
import { bscTestnet } from "@matura/chain/chains";
import { getDeployment, isDeployed } from "@matura/chain/deployments";
import { EXECUTION_ROUTE_TYPES } from "@matura/chain/eip712";
import type { NonExecutableResult } from "@matura/shared";
import { Button } from "@matura/ui/components/button";
import { Card, CardContent } from "@matura/ui/components/card";
import { Field } from "@matura/ui/components/field";
import { Input } from "@matura/ui/components/input";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Stack } from "@matura/ui/components/stack";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignTypedData, useWriteContract } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { ApiError } from "../../lib/api/client";
import {
  useAccountPortfolio,
  useExecutionPoll,
  useInvalidateOnSettled,
  useOptimize,
  usePrepareExecution,
} from "../../lib/api/hooks";
import { toAddress } from "../../lib/chain/bridge";
import { TX_ERROR_COPY } from "../../lib/chain/errors";
import { prepareRoute } from "../../lib/chain/execution-route";
import { formatUsdt, parseAmountToBaseUnits } from "../../lib/chain/format";
import { isTxInFlight } from "../../lib/tx/machine";
import { useTxFlow } from "../../lib/tx/use-tx-flow";
import { Disconnected, NotDeployed, RpcUnavailable, WrongChain } from "../states";
import { Countdown } from "./countdown";
import { RouteBreakdown } from "./route-breakdown";

const ELIGIBLE_STATES = new Set(["ELIGIBLE", "PARTIALLY_FUNDED"]);

const DISCLOSURE =
  "This testnet prototype assigns economic claim slices using mock assets. It is not a production financial offer.";

export function RequestView() {
  const { address, isConnected, chainId } = useAccount();
  const { isAuthenticated, isSigningIn, signIn } = useSession();
  const portfolio = useAccountPortfolio(isConnected ? address : undefined);
  const optimize = useOptimize();
  const prepare = usePrepareExecution();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const tx = useTxFlow();
  const invalidate = useInvalidateOnSettled();

  const [amount, setAmount] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [executionId, setExecutionId] = useState<string | undefined>(undefined);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const poll = useExecutionPoll(
    executionId,
    tx.state.status === "confirmed" || tx.state.status === "indexing",
  );

  // Once the receipt confirms, move into the indexing-poll phase. Depend on the stable
  // status primitive + memoized callback (NOT the whole `tx` object, which is recreated
  // each render) so this fires only on the transition, not every render.
  const { markIndexing, markIndexed, markFailed } = tx;
  useEffect(() => {
    if (tx.state.status === "confirmed") markIndexing();
  }, [tx.state.status, markIndexing]);

  // When the projection reports the execution, finish (or fail) exactly once.
  useEffect(() => {
    if (poll.data?.status === "EXECUTED") {
      markIndexed();
      if (address !== undefined) invalidate(address);
    } else if (poll.data?.status === "FAILED") {
      markFailed();
    }
  }, [poll.data?.status, markIndexed, markFailed, invalidate, address]);

  const onExpire = useCallback(() => {
    setExpired(true);
  }, []);

  const optimizeWithTarget = useCallback(
    (targetAdvance: string) => {
      if (portfolio.data === undefined) return;
      const claimIds = portfolio.data.claims
        .filter((c) => ELIGIBLE_STATES.has(c.state))
        .map((c) => c.claimId)
        .slice(0, 20);
      setExpired(false);
      setPrepareError(null);
      optimize.mutate({
        claimIds,
        targetAdvance,
        maxTotalCost: maxCost.trim() === "" ? undefined : parseAmountToBaseUnits(maxCost),
      });
    },
    [portfolio.data, maxCost, optimize],
  );

  const runOptimize = useCallback(() => {
    optimizeWithTarget(parseAmountToBaseUnits(amount));
  }, [optimizeWithTarget, amount]);

  const confirm = useCallback(async () => {
    const data = optimize.data;
    if (data?.routeId === undefined || data.routeId === null) return;
    setPrepareError(null);
    try {
      const prepared = await prepare.mutateAsync(data.routeId);
      const step = prepared.steps.at(0);
      if (step === undefined) throw new Error("Empty prepare response");
      // Defense-in-depth: never sign/submit to a contract other than the on-chain manifest
      // router, even if the API response says otherwise.
      const target = toAddress(step.verifyingContract ?? step.to);
      if (target !== toAddress(getDeployment(bscTestnet.id).router)) {
        setPrepareError(
          "This route targets an unexpected contract and was not signed. Refresh to try again.",
        );
        return;
      }
      const { domain, message, executionId: id } = prepareRoute(step);
      setExecutionId(id);
      await tx.run(async () => {
        const signature = await signTypedDataAsync({
          domain,
          types: EXECUTION_ROUTE_TYPES,
          primaryType: "ExecutionRoute",
          message,
        });
        return writeContractAsync({
          address: toAddress(step.verifyingContract ?? step.to),
          abi: maturaRouterAbi,
          functionName: "executeRoute",
          args: [message, signature],
        });
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setPrepareError(
          e.code === "ROUTER_PAUSED"
            ? "Routing is paused right now. Please try again later."
            : "This route is no longer available. Refresh to compare current prices.",
        );
      } else {
        setPrepareError("Could not prepare this route. Refresh to compare current prices.");
      }
    }
  }, [optimize.data, prepare, tx, signTypedDataAsync, writeContractAsync]);

  // ── Gates ─────────────────────────────────────────────────────────────────
  if (!isConnected || address === undefined) return <Disconnected />;
  if (chainId !== bscTestnet.id) return <WrongChain />;
  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;
  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-8">
          <p className="font-medium text-foreground">Sign in to request liquidity</p>
          <p className="text-sm text-muted-foreground">
            A one-time gasless signature proves you control this wallet. No funds move.
          </p>
          <Button disabled={isSigningIn} onClick={() => void signIn()}>
            {isSigningIn ? "Check your wallet…" : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (portfolio.isPending) return <Skeleton className="h-40 w-full" />;
  if (portfolio.isError) return <RpcUnavailable />;

  // ── Execution status (once a route is being submitted) ──────────────────────
  if (tx.state.status !== "idle") {
    return (
      <ExecutionStatus
        tx={tx}
        onReset={() => {
          tx.reset();
          setExecutionId(undefined);
          optimize.reset();
        }}
      />
    );
  }

  const result = optimize.data?.result;
  const executable = result?.executable === true ? result : null;
  const routeId = optimize.data?.routeId ?? null;
  const inReview = executable !== null && routeId !== null;

  return (
    <Stack gap="lg">
      {!inReview && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <Field label="Amount needed (USDT)" htmlFor="amount">
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="e.g. 4800"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
              />
            </Field>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Advanced preferences
              </summary>
              <div className="mt-3">
                <Field label="Maximum total cost (USDT, advisory)" htmlFor="maxCost">
                  <Input
                    id="maxCost"
                    inputMode="decimal"
                    placeholder="optional"
                    value={maxCost}
                    onChange={(e) => {
                      setMaxCost(e.target.value);
                    }}
                  />
                </Field>
              </div>
            </details>
            <Button disabled={amount.trim() === "" || optimize.isPending} onClick={runOptimize}>
              {optimize.isPending ? "Comparing eligible Matura Vaults…" : "Find my best route"}
            </Button>
          </CardContent>
        </Card>
      )}

      {optimize.isError && (
        <p className="text-sm text-warning-foreground">
          Could not compare routes. Adjust the amount or try again.
        </p>
      )}

      {result?.executable === false && (
        <NonExecutable result={result} onFinancePartial={optimizeWithTarget} />
      )}

      {inReview && (
        <Stack gap="md">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Your best executable route
            </h2>
            {optimize.data?.expiresAt !== null && optimize.data !== undefined && !expired && (
              <span className="text-sm text-muted-foreground">
                Expires in <Countdown expiresAt={optimize.data.expiresAt} onExpire={onExpire} />
              </span>
            )}
          </div>

          <RouteBreakdown result={executable} filteredOut={optimize.data?.filteredOut ?? []} />

          <p className="text-xs text-muted-foreground">{DISCLOSURE}</p>
          {prepareError !== null && (
            <p className="text-sm text-warning-foreground">{prepareError}</p>
          )}

          {expired ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-warning-foreground">
                This route has expired. Refresh to compare current prices.
              </p>
              <Button variant="secondary" onClick={runOptimize}>
                Refresh
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={() => void confirm()} disabled={prepare.isPending}>
                {prepare.isPending ? "Preparing…" : "Confirm and receive liquidity"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  optimize.reset();
                }}
              >
                Back
              </Button>
            </div>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function NonExecutable({
  result,
  onFinancePartial,
}: {
  result: NonExecutableResult;
  onFinancePartial: (targetBaseUnits: string) => void;
}) {
  const canPartial =
    result.bestFeasiblePartial !== undefined && BigInt(result.maxAchievableAdvance) > 0n;
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <p className="font-medium text-foreground">No executable route right now</p>
        <p className="text-sm text-muted-foreground">
          Your amount, cost limit, available claims, or vault liquidity may prevent execution.
          Adjust the request or try again later.
        </p>
        {BigInt(result.maxAchievableAdvance) > 0n && (
          <p className="text-sm text-foreground">
            We could reach {formatUsdt(result.maxAchievableAdvance)} of your request (short by{" "}
            {formatUsdt(result.shortfallAdvance)}).
          </p>
        )}
        {canPartial && (
          <Button
            variant="secondary"
            onClick={() => {
              onFinancePartial(result.maxAchievableAdvance);
            }}
          >
            Finance {formatUsdt(result.maxAchievableAdvance)} instead
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutionStatus({
  tx,
  onReset,
}: {
  tx: ReturnType<typeof useTxFlow>;
  onReset: () => void;
}) {
  const s = tx.state;
  if (s.status === "failed") {
    const copy = TX_ERROR_COPY[s.error];
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-8">
          <p className="font-medium text-foreground">{copy.title}</p>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
          <Button onClick={onReset}>Start over</Button>
        </CardContent>
      </Card>
    );
  }
  const message =
    s.status === "awaitingWallet"
      ? "Confirm this route in your wallet"
      : s.status === "broadcast"
        ? "Your transaction is being confirmed"
        : s.status === "indexed"
          ? "Liquidity received"
          : "Confirmed onchain. Updating your Matura Account…";
  const done = s.status === "indexed";
  // Once the tx is on-chain (confirmed/indexing) the projection may lag; never dead-end —
  // offer a non-destructive escape to Activity so the user is never stranded on this screen.
  const onChainPending = s.status === "confirmed" || s.status === "indexing";
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-8">
        <p className="font-heading text-lg font-semibold text-foreground">{message}</p>
        {done && (
          <Button onClick={onReset} disabled={isTxInFlight(s)}>
            Make another request
          </Button>
        )}
        {onChainPending && (
          <p className="text-sm text-muted-foreground">
            Taking longer than expected?{" "}
            <Link href="/activity" className="text-foreground underline underline-offset-2">
              View your activity
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
