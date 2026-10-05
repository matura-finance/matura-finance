"use client";

import { claimRegistryAbi } from "@matura/chain/abis";
import { bscTestnet } from "@matura/chain/chains";
import { getDeployment, isDeployed } from "@matura/chain/deployments";
import { CLAIM_TYPES, type ClaimType } from "@matura/shared";
import { Button } from "@matura/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@matura/ui/components/card";
import { Field } from "@matura/ui/components/field";
import { Input } from "@matura/ui/components/input";
import { Stack } from "@matura/ui/components/stack";
import { useState } from "react";
import { keccak256, stringToHex } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useAccount, useConfig, useSendTransaction, useWriteContract } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { postClaimRegistrationPrepare, postSettlementPrepare } from "../../lib/api/endpoints";
import type { PrepareStep } from "../../lib/api/schemas";
import { toAddress, toHex32, toHexData } from "../../lib/chain/bridge";
import { classifyTxError, TX_ERROR_COPY } from "../../lib/chain/errors";
import { parseAmountToBaseUnits } from "../../lib/chain/format";
import { ISSUER_CLAIM_TYPE_LABEL } from "../../lib/claim-display";
import { Disconnected, NotDeployed, WrongChain } from "../states";

type Status =
  | { kind: "idle" }
  | { kind: "running"; msg: string }
  | { kind: "done"; msg: string }
  | { kind: "error"; msg: string };

export function IssuerView() {
  const { address, isConnected, chainId } = useAccount();
  const { isAuthenticated, isSigningIn, signIn, token } = useSession();
  const config = useConfig();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [claimType, setClaimType] = useState<ClaimType>("PAYROLL");
  const [face, setFace] = useState("20000");
  const [dueMinutes, setDueMinutes] = useState("30");
  const [settleId, setSettleId] = useState("");
  const [delayId, setDelayId] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Defense-in-depth: only ever submit to the issuer/settlement contracts from the manifest.
  const allowedTargets = (): Set<string> => {
    const d = getDeployment(bscTestnet.id);
    return new Set([d.claimRegistry, d.settlementManager, d.mockUsdt].map((a) => a.toLowerCase()));
  };

  async function runSteps(steps: PrepareStep[], msg: string): Promise<void> {
    setStatus({ kind: "running", msg });
    try {
      const allowed = allowedTargets();
      for (const step of steps) {
        if (!allowed.has(step.to.toLowerCase())) {
          throw new Error("Refusing to submit a transaction to an unexpected contract");
        }
        const hash = await sendTransactionAsync({
          to: toAddress(step.to),
          data: step.data === undefined ? undefined : toHexData(step.data),
          value: BigInt(step.value),
        });
        await waitForTransactionReceipt(config, { hash });
      }
      setStatus({ kind: "done", msg: "Done. It may take a moment to index." });
    } catch (e) {
      setStatus({ kind: "error", msg: TX_ERROR_COPY[classifyTxError(e)].body });
    }
  }

  async function createClaim(): Promise<void> {
    if (token === null || address === undefined) return;
    const minutes = Number(dueMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setStatus({ kind: "error", msg: "Enter a whole number of minutes until maturity." });
      return;
    }
    const claimId = keccak256(stringToHex(`matura-demo:${crypto.randomUUID()}`));
    const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
    try {
      const prepared = await postClaimRegistrationPrepare(
        {
          claimId,
          beneficiary: address.toLowerCase(),
          token: getDeployment(bscTestnet.id).mockUsdt,
          faceValue: parseAmountToBaseUnits(face),
          dueAt,
          claimType,
        },
        token,
      );
      await runSteps(prepared.steps, `Creating ${ISSUER_CLAIM_TYPE_LABEL[claimType]}…`);
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Could not create claim" });
    }
  }

  async function settleClaim(): Promise<void> {
    if (token === null || settleId.trim() === "") return;
    try {
      const prepared = await postSettlementPrepare(settleId.trim(), token);
      await runSteps(prepared.steps, "Settling claim (approve, then settle)…");
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Could not settle claim" });
    }
  }

  async function markDelayed(): Promise<void> {
    if (delayId.trim() === "") return;
    setStatus({ kind: "running", msg: "Marking claim delayed…" });
    try {
      const hash = await writeContractAsync({
        address: toAddress(getDeployment(bscTestnet.id).claimRegistry),
        abi: claimRegistryAbi,
        functionName: "markDelayed",
        args: [toHex32(delayId.trim())],
      });
      await waitForTransactionReceipt(config, { hash });
      setStatus({ kind: "done", msg: "Claim marked delayed." });
    } catch (e) {
      setStatus({ kind: "error", msg: TX_ERROR_COPY[classifyTxError(e)].body });
    }
  }

  if (!isConnected || address === undefined) return <Disconnected />;
  if (chainId !== bscTestnet.id) return <WrongChain />;
  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;

  const busy = status.kind === "running";

  return (
    <Stack gap="lg">
      <div className="rounded-card border-l-4 border-l-warning bg-warning/10 px-4 py-3 text-sm text-foreground">
        Demo environment — creates synthetic testnet claims only.
      </div>

      {!isAuthenticated ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              Sign in as the demo issuer to create synthetic claims.
            </p>
            <Button disabled={isSigningIn} onClick={() => void signIn()}>
              {isSigningIn ? "Check your wallet…" : "Sign in"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Create claim</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Claim type" htmlFor="ctype">
                <select
                  id="ctype"
                  value={claimType}
                  onChange={(e) => {
                    setClaimType(e.target.value as ClaimType);
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
              <Field label="Face value (USDT)" htmlFor="face">
                <Input
                  id="face"
                  inputMode="decimal"
                  value={face}
                  onChange={(e) => {
                    setFace(e.target.value);
                  }}
                />
              </Field>
              <Field label="Due in (minutes)" htmlFor="due">
                <Input
                  id="due"
                  inputMode="numeric"
                  value={dueMinutes}
                  onChange={(e) => {
                    setDueMinutes(e.target.value);
                  }}
                />
              </Field>
              <Button
                disabled={busy || face.trim() === "" || dueMinutes.trim() === ""}
                onClick={() => void createClaim()}
              >
                Create
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settle claim</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Claim ID" htmlFor="settle">
                <Input
                  id="settle"
                  placeholder="0x…"
                  value={settleId}
                  onChange={(e) => {
                    setSettleId(e.target.value);
                  }}
                />
              </Field>
              <Button disabled={busy} variant="secondary" onClick={() => void settleClaim()}>
                Settle claim
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mark as delayed</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Claim ID" htmlFor="delay">
                <Input
                  id="delay"
                  placeholder="0x…"
                  value={delayId}
                  onChange={(e) => {
                    setDelayId(e.target.value);
                  }}
                />
              </Field>
              <Button disabled={busy} variant="secondary" onClick={() => void markDelayed()}>
                Mark as delayed
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {status.kind !== "idle" && (
        <p
          className={
            status.kind === "error"
              ? "text-sm text-warning-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {status.msg}
        </p>
      )}
    </Stack>
  );
}
