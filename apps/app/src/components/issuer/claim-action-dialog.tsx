"use client";

import { claimRegistryAbi } from "@matura/chain/abis";
import { bscTestnet } from "@matura/chain/chains";
import { getDeployment } from "@matura/chain/deployments";
import { CLAIM_STATES } from "@matura/shared";
import { Badge } from "@matura/ui/components/badge";
import { Button } from "@matura/ui/components/button";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { useConfig, useSendTransaction, useWriteContract } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { ApiError } from "../../lib/api/client";
import { postSettlementPrepare } from "../../lib/api/endpoints";
import {
  assertAllowedTarget,
  isUnexpectedTargetError,
  manifestAllowedTargets,
  UNEXPECTED_TARGET_MESSAGE,
} from "../../lib/chain/allowed-targets";
import type { ClaimWire } from "../../lib/api/schemas";
import { toAddress, toHex32, toHexData } from "../../lib/chain/bridge";
import { classifyTxError, TX_ERROR_COPY } from "../../lib/chain/errors";
import { formatUsdt, shortenHex } from "../../lib/chain/format";
import { CLAIM_STATE_DISPLAY, ISSUER_CLAIM_TYPE_LABEL } from "../../lib/claim-display";
import { CopyAddressButton } from "../wallet/copy-address-button";
import { Dialog } from "../ui/dialog";
import { FailIcon, StatusPane, StepList, SuccessIcon } from "../ui/flow-visuals";

export type ClaimAction = "settle" | "delay";

const COPY: Record<
  ClaimAction,
  { verb: string; title: string; cta: string; success: string; body: string }
> = {
  settle: {
    verb: "settle",
    title: "Settle This Claim?",
    cta: "Settle claim",
    success: "Claim settled",
    body: "Pays the claim with mock USDT and repays its financiers. Anyone may settle a matured claim.",
  },
  delay: {
    verb: "mark delayed",
    title: "Mark This Claim Delayed?",
    cta: "Mark delayed",
    success: "Claim marked delayed",
    body: "Flags a matured claim as a late payer. It stays settleable afterwards.",
  },
};

type Phase = "confirm" | "running" | "done" | "error";

/**
 * Confirm → step-by-step → success/failure dialog for the two issuer actions on an existing claim.
 * Settle runs the prepared approve+settle calldata; delay is a single markDelayed write. Both show
 * a live step checklist and surface the outcome in the dialog (no more bottom-of-page caption).
 */
export function ClaimActionDialog({
  open,
  action,
  claim,
  onClose,
  onDone,
}: {
  open: boolean;
  action: ClaimAction;
  claim: ClaimWire | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useSession();
  const config = useConfig();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("confirm");
  const [step, setStep] = useState(0);
  const [errMsg, setErrMsg] = useState("");

  // Reset to the confirm step whenever a fresh claim/action is opened.
  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setStep(0);
      setErrMsg("");
    }
  }, [open, action, claim?.claimId]);

  const copy = COPY[action];
  const labels =
    action === "settle" ? ["Approve mock USDT", "Settle claim"] : ["Mark claim delayed"];

  const handleClose = () => {
    if (phase === "running") return;
    onClose();
  };

  // Re-read the claim on-chain and report whether the action's target state is already reached.
  // Used to recover from a lost receipt or a stale confirm snapshot without re-sending.
  async function reachedTarget(): Promise<boolean> {
    if (claim === null) return false;
    try {
      const c = await readContract(config, {
        address: toAddress(getDeployment(bscTestnet.id).claimRegistry),
        abi: claimRegistryAbi,
        functionName: "getClaim",
        args: [toHex32(claim.claimId)],
      });
      const state = CLAIM_STATES[c.state];
      return action === "settle" ? state === "PAID" : state === "DELAYED";
    } catch {
      return false;
    }
  }

  async function run(): Promise<void> {
    if (claim === null) return;
    setPhase("running");
    setStep(0);
    try {
      const d = getDeployment(bscTestnet.id);
      if (action === "delay") {
        const hash = await writeContractAsync({
          address: toAddress(d.claimRegistry),
          abi: claimRegistryAbi,
          functionName: "markDelayed",
          args: [toHex32(claim.claimId)],
        });
        await waitForTransactionReceipt(config, { hash });
      } else {
        if (token === null) throw new Error("Session expired — sign in again.");
        const prepared = await postSettlementPrepare(claim.claimId, token);
        const steps = prepared.steps;
        const allowed = manifestAllowedTargets();
        // When no approve is needed the server returns a single settle step — mark the approve
        // label done and run the settle at index 1.
        const offset = steps.length >= 2 ? 0 : 1;
        for (let i = 0; i < steps.length; i++) {
          setStep(offset + i);
          const s = steps[i];
          if (s === undefined) continue;
          assertAllowedTarget(s.to, allowed);
          const hash = await sendTransactionAsync({
            to: toAddress(s.to),
            data: s.data === undefined ? undefined : toHexData(s.data),
            value: BigInt(s.value),
          });
          await waitForTransactionReceipt(config, { hash });
        }
      }
      setPhase("done");
      onDone();
    } catch (e) {
      // A lost receipt or a stale confirm snapshot can mean the action already succeeded on-chain:
      // settle 409s ALREADY_SETTLED on re-prepare, and either action may have reached its target
      // state on a prior attempt. Re-read before reporting a revert.
      if ((e instanceof ApiError && e.code === "ALREADY_SETTLED") || (await reachedTarget())) {
        setPhase("done");
        onDone();
        return;
      }
      const msg = isUnexpectedTargetError(e)
        ? UNEXPECTED_TARGET_MESSAGE
        : e instanceof Error && e.message.includes("sign in")
          ? e.message
          : TX_ERROR_COPY[classifyTxError(e)].body;
      setErrMsg(msg);
      setPhase("error");
    }
  }

  let content;
  if (claim === null) {
    content = null;
  } else if (phase === "running") {
    content = (
      <div className="flex flex-col gap-5 py-2">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {action === "settle" ? "Settling claim" : "Marking claim delayed"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm each transaction in your wallet. Claim {shortenHex(claim.claimId)}.
          </p>
        </div>
        <StepList steps={labels} current={step} />
      </div>
    );
  } else if (phase === "done") {
    content = (
      <StatusPane
        icon={<SuccessIcon />}
        title={copy.success}
        body="Done. It may take a moment to appear in your claims."
      >
        <Button className="capitalize" onClick={handleClose}>
          Done
        </Button>
      </StatusPane>
    );
  } else if (phase === "error") {
    content = (
      <StatusPane icon={<FailIcon />} title={`Could not ${copy.verb} the claim`} body={errMsg}>
        <div className="flex gap-3">
          <Button className="capitalize" onClick={() => void run()}>
            Try again
          </Button>
          <Button variant="ghost" className="capitalize" onClick={handleClose}>
            Close
          </Button>
        </div>
      </StatusPane>
    );
  } else {
    const display = CLAIM_STATE_DISPLAY[claim.state];
    content = (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">{copy.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <dl className="flex flex-col gap-2 rounded-card border border-border bg-muted px-4 py-3 text-sm">
          <SummaryRow label="Claim">
            <span className="font-mono text-foreground">{shortenHex(claim.claimId)}</span>
            <CopyAddressButton address={claim.claimId} label="claim ID" />
          </SummaryRow>
          <SummaryRow label="Type">
            <span className="text-foreground">{ISSUER_CLAIM_TYPE_LABEL[claim.claimType]}</span>
          </SummaryRow>
          <SummaryRow label="Face value">
            <span className="tabular-nums text-foreground">{formatUsdt(claim.faceValue)}</span>
          </SummaryRow>
          <SummaryRow label="Status">
            <Badge variant={display.tone}>{display.label}</Badge>
          </SummaryRow>
        </dl>
        <div className="flex gap-3">
          <Button
            className="capitalize"
            variant={action === "delay" ? "secondary" : "default"}
            onClick={() => void run()}
          >
            {copy.cta}
          </Button>
          <Button variant="ghost" className="capitalize" onClick={handleClose}>
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
      dismissable={phase !== "running"}
      size="md"
      label={copy.title}
    >
      {content}
    </Dialog>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5">{children}</dd>
    </div>
  );
}
