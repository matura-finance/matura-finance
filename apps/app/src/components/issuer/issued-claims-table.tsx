"use client";

import { Badge } from "@matura/ui/components/badge";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";
import type { ReactNode } from "react";

import type { ClaimWire } from "../../lib/api/schemas";
import { formatUsdt, shortenAddress, shortenHex } from "../../lib/chain/format";
import {
  CLAIM_STATE_DISPLAY,
  ISSUER_CLAIM_TYPE_LABEL,
  isDelayable,
  isSettleable,
} from "../../lib/claim-display";
import { CopyAddressButton } from "../wallet/copy-address-button";
import { Tooltip } from "../ui/tooltip";

/** Relative maturity, e.g. "in 25m" or "12m overdue" — minute-grained for the demo's short dues. */
function formatDue(iso: string): { text: string; overdue: boolean } {
  const diffMs = new Date(iso).getTime() - Date.now();
  const overdue = diffMs <= 0;
  const mins = Math.max(0, Math.round(Math.abs(diffMs) / 60_000));
  const suffix = overdue ? " overdue" : "";
  const prefix = overdue ? "" : "in ";
  if (mins < 60) return { text: `${prefix}${String(mins)}m${suffix}`, overdue };
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return { text: `${prefix}${String(hrs)}h${suffix}`, overdue };
  return { text: `${prefix}${String(Math.round(hrs / 24))}d${suffix}`, overdue };
}

export function IssuedClaimsTable({
  claims,
  onSettle,
  onDelay,
}: {
  claims: ClaimWire[];
  onSettle: (claim: ClaimWire) => void;
  onDelay: (claim: ClaimWire) => void;
}) {
  if (claims.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No claims yet. Create one above — it will appear here once it&apos;s indexed, with actions
        to settle or mark it delayed.
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Claim ID</TH>
          <TH>Type</TH>
          <TH>Beneficiary</TH>
          <TH numeric>Face value</TH>
          <TH>Due</TH>
          <TH>Status</TH>
          <TH className="text-right">Actions</TH>
        </TR>
      </THead>
      <TBody>
        {claims.map((claim) => {
          const display = CLAIM_STATE_DISPLAY[claim.state];
          const due = formatDue(claim.dueAt);
          const settleable = isSettleable(claim.state);
          const delayable = isDelayable(claim.state);
          return (
            <TR key={claim.claimId}>
              <TD>
                <span className="inline-flex items-center gap-1">
                  <Tooltip label={claim.claimId} className="cursor-default">
                    <span className="font-mono text-xs text-foreground">
                      {shortenHex(claim.claimId)}
                    </span>
                  </Tooltip>
                  <CopyAddressButton address={claim.claimId} label="claim ID" size={13} />
                </span>
              </TD>
              <TD>{ISSUER_CLAIM_TYPE_LABEL[claim.claimType]}</TD>
              <TD>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(claim.beneficiary)}
                </span>
              </TD>
              <TD numeric>{formatUsdt(claim.faceValue)}</TD>
              <TD>
                <span className={due.overdue ? "text-warning-foreground" : "text-muted-foreground"}>
                  {due.text}
                </span>
              </TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  <Badge variant={display.tone}>{display.label}</Badge>
                  {claim.pending === true && <Badge variant="secondary">Indexing…</Badge>}
                </span>
              </TD>
              <TD>
                <div className="flex items-center justify-end gap-1">
                  {settleable && (
                    <IconAction
                      label="Settle claim"
                      onClick={() => {
                        onSettle(claim);
                      }}
                    >
                      <SettleIcon />
                    </IconAction>
                  )}
                  {delayable && (
                    <IconAction
                      label="Mark delayed"
                      onClick={() => {
                        onDelay(claim);
                      }}
                    >
                      <DelayIcon />
                    </IconAction>
                  )}
                  {!settleable && !delayable && (
                    <span className="text-xs text-muted-foreground" aria-hidden>
                      —
                    </span>
                  )}
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/** Settle = banknote/coins glyph. */
function SettleIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width={20} height={12} x={2} y={6} rx={2} />
      <circle cx={12} cy={12} r={2} />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

/** Delay = clock glyph. */
function DelayIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
