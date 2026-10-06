"use client";

import { bscTestnet } from "@matura/chain/chains";
import { getDeployment } from "@matura/chain/deployments";
import { CLAIM_TYPES, type ClaimType } from "@matura/shared";
import { Button } from "@matura/ui/components/button";
import { Field } from "@matura/ui/components/field";
import { Input } from "@matura/ui/components/input";
import { useState } from "react";
import { isAddress, keccak256, stringToHex } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useAccount, useConfig, useSendTransaction } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { ApiError } from "../../lib/api/client";
import { postClaimRegistrationPrepare } from "../../lib/api/endpoints";
import {
  assertAllowedTarget,
  isUnexpectedTargetError,
  manifestAllowedTargets,
  UNEXPECTED_TARGET_MESSAGE,
} from "../../lib/chain/allowed-targets";
import { toAddress, toHexData } from "../../lib/chain/bridge";
import { classifyTxError, TX_ERROR_COPY } from "../../lib/chain/errors";
import { formatUsdt, parseAmountToBaseUnits, shortenHex } from "../../lib/chain/format";
import { ISSUER_CLAIM_TYPE_LABEL } from "../../lib/claim-display";
import { CopyAddressButton } from "../wallet/copy-address-button";
import { Dialog } from "../ui/dialog";
import { FailIcon, StatusPane, StepBar, SuccessIcon, Spinner } from "../ui/flow-visuals";

const STEPS = ["Details", "Submit", "Done"] as const;

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "done"; claimId: string; beneficiary: string; face: string }
  | { kind: "error"; msg: string };

/**
 * Create-a-claim flow as a stepper dialog (Details → Submit → Done). The issuer picks an arbitrary
 * beneficiary (left blank by default so the admin can't accidentally fund their own wallet). On
 * success the new claim ID is shown copyable, since it's the handle for settling later.
 */
export function CreateClaimDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { address } = useAccount();
  const { token } = useSession();
  const config = useConfig();
  const { sendTransactionAsync } = useSendTransaction();

  const [claimType, setClaimType] = useState<ClaimType>("PAYROLL");
  const [face, setFace] = useState("20000");
  const [dueMinutes, setDueMinutes] = useState("30");
  const [beneficiary, setBeneficiary] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  // Frozen claim identity for this dialog session so a retry re-sends the SAME claimId rather than
  // minting a second claim. Cleared only on close (a fresh dialog session → a fresh claim).
  const [identity, setIdentity] = useState<{ claimId: string; dueAt: string } | null>(null);

  const reset = () => {
    setPhase({ kind: "form" });
    setIdentity(null);
    setBeneficiary("");
    setFace("20000");
    setDueMinutes("30");
    setClaimType("PAYROLL");
  };

  const handleClose = () => {
    if (phase.kind === "submitting") return;
    reset();
    onClose();
  };

  async function submit(): Promise<void> {
    if (token === null || address === undefined) return;
    const minutes = Number(dueMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setPhase({ kind: "error", msg: "Enter a whole number of minutes until maturity." });
      return;
    }
    if (!isAddress(beneficiary)) {
      setPhase({ kind: "error", msg: "Enter a valid beneficiary address (0x…)." });
      return;
    }
    const beneficiaryLc = beneficiary.toLowerCase();
    const id = identity ?? {
      claimId: keccak256(stringToHex(`matura-demo:${crypto.randomUUID()}`)),
      dueAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    };
    if (identity === null) setIdentity(id);
    const faceBase = parseAmountToBaseUnits(face);
    setPhase({ kind: "submitting" });
    try {
      const d = getDeployment(bscTestnet.id);
      const prepared = await postClaimRegistrationPrepare(
        {
          claimId: id.claimId,
          beneficiary: beneficiaryLc,
          token: d.mockUsdt,
          faceValue: faceBase,
          dueAt: id.dueAt,
          claimType,
        },
        token,
      );
      const allowed = manifestAllowedTargets();
      for (const step of prepared.steps) {
        assertAllowedTarget(step.to, allowed);
        const hash = await sendTransactionAsync({
          to: toAddress(step.to),
          data: step.data === undefined ? undefined : toHexData(step.data),
          value: BigInt(step.value),
        });
        await waitForTransactionReceipt(config, { hash });
      }
      setPhase({ kind: "done", claimId: id.claimId, beneficiary: beneficiaryLc, face: faceBase });
      onCreated();
    } catch (e) {
      // A lost receipt on a prior attempt may have actually registered the claim; re-preparing the
      // same claimId then 409s CLAIM_ALREADY_EXISTS. Treat that as success — the claim does exist.
      if (e instanceof ApiError && e.code === "CLAIM_ALREADY_EXISTS") {
        setPhase({ kind: "done", claimId: id.claimId, beneficiary: beneficiaryLc, face: faceBase });
        onCreated();
        return;
      }
      const msg = isUnexpectedTargetError(e)
        ? UNEXPECTED_TARGET_MESSAGE
        : TX_ERROR_COPY[classifyTxError(e)].body;
      setPhase({ kind: "error", msg });
    }
  }

  const stepIndex = phase.kind === "form" ? 0 : phase.kind === "done" ? 2 : 1;

  let content;
  if (phase.kind === "submitting") {
    content = (
      <StatusPane
        icon={<Spinner />}
        title="Registering your claim"
        body="Confirm the transaction in your wallet. This records the claim on-chain."
      />
    );
  } else if (phase.kind === "done") {
    content = (
      <StatusPane
        icon={<SuccessIcon />}
        title="Claim created"
        body={`A ${formatUsdt(phase.face)} claim payable to ${shortenHex(phase.beneficiary)} is on-chain. It will appear in your claims once indexed.`}
      >
        <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
          <span className="font-mono text-sm text-foreground">{shortenHex(phase.claimId)}</span>
          <CopyAddressButton address={phase.claimId} label="claim ID" />
        </div>
        <Button className="capitalize" onClick={handleClose}>
          Done
        </Button>
      </StatusPane>
    );
  } else if (phase.kind === "error") {
    content = (
      <StatusPane icon={<FailIcon />} title="Could not create the claim" body={phase.msg}>
        <div className="flex gap-3">
          <Button
            className="capitalize"
            onClick={() => {
              setPhase({ kind: "form" });
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" className="capitalize" onClick={handleClose}>
            Close
          </Button>
        </div>
      </StatusPane>
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Create A Claim</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Issue a synthetic claim payable to any wallet. You sign in as the issuer; the
            beneficiary is whoever you name below.
          </p>
        </div>
        <Field label="Claim type" htmlFor="cc-type">
          <select
            id="cc-type"
            value={claimType}
            onChange={(e) => {
              const next = CLAIM_TYPES.find((t) => t === e.target.value);
              if (next !== undefined) setClaimType(next);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ISSUER_CLAIM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Face value (USDT)" htmlFor="cc-face">
          <Input
            id="cc-face"
            inputMode="decimal"
            value={face}
            onChange={(e) => {
              setFace(e.target.value);
            }}
          />
        </Field>
        <Field label="Due in (minutes)" htmlFor="cc-due">
          <Input
            id="cc-due"
            inputMode="numeric"
            value={dueMinutes}
            onChange={(e) => {
              setDueMinutes(e.target.value);
            }}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="cc-benef" className="text-sm font-medium text-foreground">
              Beneficiary address
            </label>
            {address !== undefined && (
              <button
                type="button"
                onClick={() => {
                  setBeneficiary(address);
                }}
                className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Use my address
              </button>
            )}
          </div>
          <Input
            id="cc-benef"
            placeholder="0x… (who can finance this claim)"
            value={beneficiary}
            onChange={(e) => {
              setBeneficiary(e.target.value);
            }}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Left blank on purpose — name the wallet that should receive and finance this claim.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            className="capitalize"
            disabled={face.trim() === "" || dueMinutes.trim() === "" || beneficiary.trim() === ""}
            onClick={() => void submit()}
          >
            Create claim
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
      dismissable={phase.kind !== "submitting"}
      size="lg"
      label="Create a claim"
    >
      <StepBar steps={STEPS} current={stepIndex} />
      <div className="mt-6">{content}</div>
    </Dialog>
  );
}
