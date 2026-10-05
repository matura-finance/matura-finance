"use client";

import { maturaRouterAbi } from "@matura/chain/abis";
import { bscTestnet } from "@matura/chain/chains";
import { getDeployment, isDeployed } from "@matura/chain/deployments";
import { EXECUTION_ROUTE_TYPES } from "@matura/chain/eip712";
import type { NonExecutableResult } from "@matura/shared";
import { Button } from "@matura/ui/components/button";
import { Field } from "@matura/ui/components/field";
import { Input } from "@matura/ui/components/input";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain, useWriteContract } from "wagmi";

import { ApiError } from "../../lib/api/client";
import { useSession } from "../../lib/auth/session-provider";
import { TX_ERROR_COPY } from "../../lib/chain/errors";
import { prepareRoute } from "../../lib/chain/execution-route";
import { formatUsdt, parseAmountToBaseUnits } from "../../lib/chain/format";
import {
  useAccountPortfolio,
  useExecutionPoll,
  useInvalidateOnSettled,
  useOptimize,
  usePrepareExecution,
} from "../../lib/queries/hooks";
import { useTxFlow } from "../../lib/tx/use-tx-flow";
import { Dialog } from "../ui/dialog";
import { Countdown } from "./countdown";
import { RouteBreakdown } from "./route-breakdown";

const ELIGIBLE_STATES = new Set(["ELIGIBLE", "PARTIALLY_FUNDED"]);
const STEPS = ["Amount", "Review", "Sign", "Confirm", "Done"] as const;
const DISCLOSURE =
  "This testnet prototype assigns economic claim slices using mock assets. It is not a production financial offer.";

/**
 * The full Get Liquidity flow as a modal stepper: Amount → Review → Sign → Confirm → Done.
 * Launched from the Portfolio so the user acts in the context of their positions. Closing resets
 * the flow; dismissal is blocked while a transaction is in flight.
 */
export function GetLiquidityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, chainId } = useAccount();
  const { isAuthenticated, isSigningIn, signIn } = useSession();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const portfolio = useAccountPortfolio(address);
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

  const { markIndexing, markIndexed, markFailed } = tx;
  useEffect(() => {
    if (tx.state.status === "confirmed") markIndexing();
  }, [tx.state.status, markIndexing]);

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

  const handleClose = useCallback(() => {
    tx.reset();
    optimize.reset();
    prepare.reset();
    setExecutionId(undefined);
    setExpired(false);
    setPrepareError(null);
    setAmount("");
    setMaxCost("");
    onClose();
  }, [tx, optimize, prepare, onClose]);

  const confirm = useCallback(async () => {
    const data = optimize.data;
    if (data?.routeId === undefined || data.routeId === null) return;
    setPrepareError(null);
    try {
      const prepared = await prepare.mutateAsync(data.routeId);
      const step = prepared.steps.at(0);
      if (step === undefined) throw new Error("Empty prepare response");
      const {
        domain,
        message,
        executionId: id,
        router,
      } = prepareRoute(step, getDeployment(bscTestnet.id).router);
      setExecutionId(id);
      await tx.run(async () => {
        const signature = await signTypedDataAsync({
          domain,
          types: EXECUTION_ROUTE_TYPES,
          primaryType: "ExecutionRoute",
          message,
        });
        return writeContractAsync({
          address: router,
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
      } else if (e instanceof Error && e.message.includes("manifest router")) {
        setPrepareError(
          "This route targets an unexpected contract and was not signed. Refresh to try again.",
        );
      } else {
        setPrepareError("Could not prepare this route. Refresh to compare current prices.");
      }
    }
  }, [optimize.data, prepare, tx, signTypedDataAsync, writeContractAsync]);

  const result = optimize.data?.result;
  const executable = result?.executable === true ? result : null;
  const routeId = optimize.data?.routeId ?? null;
  const s = tx.state.status;
  const inReview = executable !== null && routeId !== null && s === "idle";
  const inFlight =
    s === "awaitingWallet" ||
    s === "broadcast" ||
    s === "confirmed" ||
    s === "indexing" ||
    prepare.isPending;

  let stepIndex = 0;
  if (optimize.isPending || inReview || result?.executable === false) stepIndex = 1;
  if (s === "awaitingWallet") stepIndex = 2;
  else if (s === "broadcast" || s === "confirmed" || s === "indexing") stepIndex = 3;
  else if (s === "indexed") stepIndex = 4;

  let content: ReactNode;
  if (chainId !== bscTestnet.id) {
    content = (
      <StatusPane
        icon={<FailIcon />}
        title="Wrong network"
        body="Switch to BNB Chain Testnet to continue."
      >
        <Button
          disabled={isSwitching}
          onClick={() => {
            switchChain({ chainId: bscTestnet.id });
          }}
        >
          Switch network
        </Button>
      </StatusPane>
    );
  } else if (!isDeployed(bscTestnet.id)) {
    content = <StatusPane icon={<FailIcon />} title="Contracts not deployed on this network" />;
  } else if (!isAuthenticated) {
    content = (
      <StatusPane
        icon={<Spinner />}
        title="Sign in to request liquidity"
        body="A one-time gasless signature proves you control this wallet. No funds move."
      >
        <Button disabled={isSigningIn} onClick={() => void signIn()}>
          {isSigningIn ? "Check your wallet…" : "Sign in"}
        </Button>
      </StatusPane>
    );
  } else if (s === "failed") {
    content = (
      <StatusPane
        icon={<FailIcon />}
        title={TX_ERROR_COPY[tx.state.error].title}
        body={TX_ERROR_COPY[tx.state.error].body}
      >
        <Button onClick={handleClose}>Start over</Button>
      </StatusPane>
    );
  } else if (s === "indexed") {
    content = (
      <StatusPane
        icon={<SuccessIcon />}
        title="Liquidity received"
        body="Your advance has landed. It may take a moment to appear in your positions."
      >
        <Button onClick={handleClose}>Done</Button>
      </StatusPane>
    );
  } else if (s === "awaitingWallet") {
    content = (
      <StatusPane
        icon={<Spinner />}
        title="Confirm in your wallet"
        body="Sign the route and approve the transaction in your wallet."
      />
    );
  } else if (s === "broadcast" || s === "confirmed" || s === "indexing") {
    content = (
      <StatusPane
        icon={<Spinner />}
        title={s === "broadcast" ? "Submitting your route" : "Confirmed — updating your positions"}
        body={
          s === "broadcast"
            ? "Your transaction is being confirmed on-chain."
            : "Confirmed on-chain. Waiting for Matura to index the result."
        }
      >
        {(s === "confirmed" || s === "indexing") && (
          <p className="text-xs text-muted-foreground">
            Taking longer than expected?{" "}
            <Link href="/portfolio" className="text-foreground underline underline-offset-2">
              View your activity
            </Link>
            .
          </p>
        )}
      </StatusPane>
    );
  } else if (optimize.isPending) {
    content = (
      <StatusPane
        icon={<Spinner />}
        title="Finding your best route"
        body="Comparing eligible Matura Claims against vault pricing…"
      />
    );
  } else if (optimize.isError) {
    content = (
      <StatusPane
        icon={<FailIcon />}
        title="Could not compare routes"
        body="Adjust the amount or your cost limit and try again."
      >
        <Button
          onClick={() => {
            optimize.reset();
          }}
        >
          Back
        </Button>
      </StatusPane>
    );
  } else if (result?.executable === false) {
    content = (
      <NonExecutable
        result={result}
        onFinancePartial={optimizeWithTarget}
        onBack={() => {
          optimize.reset();
        }}
      />
    );
  } else if (inReview) {
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">Review your route</h3>
          {optimize.data?.expiresAt !== null && optimize.data !== undefined && !expired && (
            <span className="text-xs text-muted-foreground">
              Expires in <Countdown expiresAt={optimize.data.expiresAt} onExpire={onExpire} />
            </span>
          )}
        </div>
        <RouteBreakdown result={executable} filteredOut={optimize.data?.filteredOut ?? []} />
        <p className="text-xs text-muted-foreground">{DISCLOSURE}</p>
        {prepareError !== null && <p className="text-sm text-warning-foreground">{prepareError}</p>}
        {expired ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-warning-foreground">
              This route expired. Refresh to compare current prices.
            </p>
            <Button variant="secondary" onClick={runOptimize}>
              Refresh route
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button onClick={() => void confirm()} disabled={prepare.isPending}>
              {prepare.isPending ? "Preparing…" : "Confirm & receive liquidity"}
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
      </div>
    );
  } else {
    // Step 1 — the amount form.
    content = (
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            How much do you need?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Matura compares your eligible claims and the vaults, then assigns only what is needed.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="gl-amount" className="text-sm font-medium text-foreground">
            Amount needed
          </label>
          <div className="relative">
            <Input
              id="gl-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
              className="h-12 pr-16 text-lg tabular-nums"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              USDT
            </span>
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
            Advanced preferences
          </summary>
          <div className="mt-3">
            <Field label="Maximum total cost (USDT, advisory)" htmlFor="gl-maxCost">
              <Input
                id="gl-maxCost"
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
        <div className="flex gap-3">
          <Button
            size="lg"
            disabled={amount.trim() === "" || portfolio.data === undefined}
            onClick={runOptimize}
          >
            Find my best route
          </Button>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} dismissable={!inFlight} size="lg">
      <Stepper current={stepIndex} />
      <div className="mt-6">{content}</div>
    </Dialog>
  );
}

function NonExecutable({
  result,
  onFinancePartial,
  onBack,
}: {
  result: NonExecutableResult;
  onFinancePartial: (targetBaseUnits: string) => void;
  onBack: () => void;
}) {
  const canPartial =
    result.bestFeasiblePartial !== undefined && BigInt(result.maxAchievableAdvance) > 0n;
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="font-medium text-foreground">No executable route right now</p>
      <p className="text-sm text-muted-foreground">
        Your amount, cost limit, available claims, or vault liquidity may prevent execution. Adjust
        the request or try again later.
      </p>
      {BigInt(result.maxAchievableAdvance) > 0n && (
        <p className="text-sm text-foreground">
          We could reach {formatUsdt(result.maxAchievableAdvance)} of your request (short by{" "}
          {formatUsdt(result.shortfallAdvance)}).
        </p>
      )}
      <div className="flex gap-3">
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
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "border-2 border-primary text-primary"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {done ? "✓" : String(i + 1)}
            </span>
            <span
              className={`text-xs font-medium ${done || active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function StatusPane({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {icon}
      <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
      {body !== undefined && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function FailIcon() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  );
}
