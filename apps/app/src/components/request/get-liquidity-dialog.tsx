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
import { FailIcon, Spinner, StatusPane, StepBar, SuccessIcon } from "../ui/flow-visuals";
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
  // Splits the single awaitingWallet state into two visible steps: Sign (route signature) then
  // Confirm (the executeRoute transaction). Flipped true once the gasless signature resolves.
  const [routeSigned, setRouteSigned] = useState(false);
  // Flips true if indexing drags on, so we can reassure the user (funds already arrived) and let
  // them close — the poll gives up silently after a bounded window and never transitions state.
  const [indexingSlow, setIndexingSlow] = useState(false);

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

  // After the receipt lands, indexing can stall (slow/paused indexer). Flip to a reassuring,
  // dismissable state after a bounded wait so the user is never trapped behind the spinner.
  useEffect(() => {
    if (tx.state.status !== "indexing") {
      setIndexingSlow(false);
      return;
    }
    const timer = setTimeout(() => {
      setIndexingSlow(true);
    }, 45_000);
    return () => {
      clearTimeout(timer);
    };
  }, [tx.state.status]);

  const onExpire = useCallback(() => {
    setExpired(true);
  }, []);

  const optimizeWithTarget = useCallback(
    (targetAdvance: string) => {
      if (portfolio.data === undefined) return;
      // The optimizer accepts at most 20 claims per request (OptimizeRequest.claimIds max). A
      // wallet with more eligible claims routes only the first 20 here — acceptable for the demo.
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
    setRouteSigned(false);
    setIndexingSlow(false);
    setAmount("");
    setMaxCost("");
    onClose();
  }, [tx, optimize, prepare, onClose]);

  const confirm = useCallback(async () => {
    const data = optimize.data;
    if (data?.routeId === undefined || data.routeId === null) return;
    setPrepareError(null);
    setRouteSigned(false);
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
        setRouteSigned(true);
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
  // Lock dismissal only while the user is signing/submitting. Once the receipt is in
  // (confirmed/indexing) the tx is irreversible, so keeping the modal locked would only trap the
  // user — allow dismissal there (see the confirmed/indexing pane, which offers an explicit Close).
  const inFlight = s === "awaitingWallet" || s === "broadcast" || prepare.isPending;

  let stepIndex = 0;
  if (optimize.isPending || inReview || result?.executable === false) stepIndex = 1;
  if (s === "awaitingWallet") stepIndex = routeSigned ? 3 : 2;
  else if (s === "broadcast" || s === "confirmed" || s === "indexing") stepIndex = 3;
  else if (s === "indexed") stepIndex = 4;

  // Network/deployment/auth guards only apply before a tx starts. Once a tx is in flight or done
  // (s !== "idle"), render purely from tx state so a mid-flight wallet network/account switch can't
  // pre-empt the progress/success UI with "Wrong network".
  const preFlight = s === "idle";

  let content: ReactNode;
  if (preFlight && chainId !== bscTestnet.id) {
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
  } else if (preFlight && !isDeployed(bscTestnet.id)) {
    content = <StatusPane icon={<FailIcon />} title="Contracts not deployed on this network" />;
  } else if (preFlight && !isAuthenticated) {
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
    content = routeSigned ? (
      <StatusPane
        icon={<Spinner />}
        title="Confirm the transaction"
        body="Approve the executeRoute transaction in your wallet to receive your advance."
      />
    ) : (
      <StatusPane
        icon={<Spinner />}
        title="Sign your route"
        body="Sign the route authorization in your wallet — this is gasless and moves no funds."
      />
    );
  } else if (indexingSlow && s === "indexing") {
    // The receipt is in (funds have arrived) but indexing is slow. Reassure and let the user close.
    content = (
      <StatusPane
        icon={<SuccessIcon />}
        title="Your liquidity has arrived"
        body="The transaction is confirmed on-chain. Matura is still indexing it, so your positions may take a moment to update."
      >
        <Button onClick={handleClose}>Close</Button>
        <Link href="/portfolio" className="text-xs text-foreground underline underline-offset-2">
          View your activity
        </Link>
      </StatusPane>
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
    <Dialog
      open={open}
      onClose={handleClose}
      dismissable={!inFlight}
      size="lg"
      label="Get Liquidity"
    >
      <StepBar steps={STEPS} current={stepIndex} />
      <div className="mt-6 [&_button]:capitalize">{content}</div>
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
