// @ts-check
/**
 * sync-reference-docs — build the "Reference" section (Lane A) of the docs site.
 *
 * Mirrors an EXPLICIT ALLOWLIST of repo `docs/*.md` into `content/docs/reference/` as MDX-safe `.md`
 * pages, injecting frontmatter (title + description), stripping the duplicate leading H1, swapping
 * Mermaid fences for pre-rendered static SVGs, and verifying in-page anchors resolve.
 *
 * Design invariants (see docs/plans/2026-10-06-feat-docs-website-fumadocs-plan.md):
 *  • C1 — ALLOWLIST ONLY, never a glob. The repo `docs/` tree mixes public-suitable docs with
 *    gitignored/internal artifacts (code-review.md, *-runbook.md, reviews/, brainstorms/, plans/).
 *    We copy only the listed files, assert each is NOT gitignored (best-effort; git may be absent in
 *    Docker) and NOT under a forbidden path, and fail loudly otherwise.
 *  • C2 — output `.md` (MDX `format: 'md'`), which treats raw `{` / `<` in prose as literal text, so
 *    engineering-toned source (e.g. `<25`, `{optimize,arithmetic}`) compiles without a sanitizer.
 *  • C3 — inject `title` + `description`; strip the leading `# H1` so it isn't rendered twice; fail
 *    if a source file has no H1.
 *  • I3 — a link checker fails the build on dangling in-page anchors or relative `.md` links.
 *  • I4 — Mermaid fences are replaced with committed static SVGs (no runtime eval, CSP stays strict).
 *
 * Output is gitignored and regenerated on every build/dev (prebuild/predev), so drift at deploy is
 * impossible — there is no committed generated content to go stale.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import GithubSlugger from "github-slugger";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_DIR, "../..");
const OUT_DIR = join(APP_DIR, "content", "docs", "reference");
const GITHUB_BLOB = "https://github.com/matura-finance/matura-finance/blob/main";

/**
 * Lane A allowlist. Each file was inventoried as tracked + secret-free + public-suitable
 * (see the plan's classification table). `mermaid` lists the committed SVG replacements, in the
 * order the Mermaid fences appear in the source — the count must match exactly.
 * @type {{ src: string; out: string; title: string; description: string; mermaid?: string[] }[]}
 */
const ALLOWLIST = [
  {
    src: "docs/architecture.md",
    out: "architecture.md",
    title: "Architecture",
    description:
      "How the Matura monorepo fits together — apps, packages, and the on-chain contract graph.",
    mermaid: ["/diagrams/architecture-monorepo.svg", "/diagrams/architecture-contracts.svg"],
  },
  {
    src: "docs/routing.md",
    out: "routing.md",
    title: "Best-execution routing",
    description:
      "The deterministic best-execution router: objective, constraints, and the off-chain/on-chain validation mirror.",
  },
  {
    src: "docs/threat-model.md",
    out: "threat-model.md",
    title: "Threat model",
    description:
      "Full-stack threat model: assets, trust assumptions, attack surface, and explicitly accepted risks.",
  },
  {
    src: "docs/decisions.md",
    out: "decisions.md",
    title: "Design decisions",
    description: "Architecture decision records — the key technology and design choices, and why.",
  },
  {
    src: "docs/test-report.md",
    out: "test-report.md",
    title: "Test report",
    description: "Test coverage across the contracts, API, and frontends.",
  },
  {
    src: "docs/gas-report.md",
    out: "gas-report.md",
    title: "Gas report",
    description: "Gas usage for the core on-chain operations.",
  },
];

/** Paths that must never be mirrored, even if added to the allowlist by mistake. */
const FORBIDDEN = [
  /(^|\/)reviews\//,
  /(^|\/)brainstorms\//,
  /(^|\/)plans\//,
  /(^|\/)solutions\//,
  /code-review\.md$/,
  /-runbook\.md$/,
  /deployment-runbook/,
];

/** Fail the build with a clear, prefixed message. */
function fail(msg) {
  console.error(`\n[sync-reference-docs] ERROR: ${msg}\n`);
  process.exit(1);
}

/** True if `relPath` is gitignored. Best-effort: returns false if git is unavailable (e.g. Docker). */
function isGitIgnored(relPath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relPath], { cwd: REPO_ROOT, stdio: "ignore" });
    return true; // exit 0 → ignored
  } catch (err) {
    // exit 1 → not ignored (expected); exit 128 / ENOENT → git unavailable → treat as not-ignored.
    if (err && typeof err === "object" && "status" in err && err.status === 1) return false;
    return false;
  }
}

/** Replace ```mermaid fences with image embeds, in order; assert the count matches `svgs`. */
function replaceMermaid(body, svgs, srcLabel) {
  const fence = /```mermaid\r?\n[\s\S]*?\r?\n```/g;
  const matches = body.match(fence) ?? [];
  const expected = svgs?.length ?? 0;
  if (matches.length !== expected) {
    fail(
      `${srcLabel}: found ${matches.length} Mermaid diagram(s) but ${expected} committed SVG(s) are ` +
        `mapped. Pre-render the diagram(s) to apps/docs/public/diagrams/ and update the allowlist ` +
        `'mermaid' array (order matters), or the diagram would silently drop.`,
    );
  }
  let i = 0;
  return body.replace(fence, () => {
    const svg = /** @type {string[]} */ (svgs)[i++];
    return `![${srcLabel} diagram](${svg})`;
  });
}

/** github-slugger-compatible anchor set for every ATX heading in `body`. */
function headingSlugs(body) {
  const slugger = new GithubSlugger();
  const slugs = new Set();
  for (const line of body.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) slugs.add(slugger.slug(stripInlineMarkdown(m[1])));
  }
  return slugs;
}

/** Strip inline markdown (code, emphasis, links) from heading text before slugging, as rehype does. */
function stripInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]/g, "");
}

/** Fail on dangling in-page anchors or relative .md links in the final body. */
function checkLinks(body, srcLabel) {
  const slugs = headingSlugs(body);
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  const dangling = [];
  const relative = [];
  let m;
  while ((m = linkRe.exec(body)) !== null) {
    const href = m[1].trim();
    if (href.startsWith("#")) {
      const anchor = href.slice(1);
      if (anchor && !slugs.has(anchor)) dangling.push(href);
    } else if (/^\.{0,2}\/[^)]*\.mdx?($|#)/.test(href) || /^[^):/]+\.mdx?($|#)/.test(href)) {
      relative.push(href);
    }
  }
  if (dangling.length > 0) {
    fail(
      `${srcLabel}: dangling in-page anchor(s) that match no heading slug: ${[...new Set(dangling)].join(", ")}`,
    );
  }
  if (relative.length > 0) {
    fail(
      `${srcLabel}: relative markdown link(s) that won't resolve in the mirrored tree: ` +
        `${[...new Set(relative)].join(", ")}. Convert to an absolute /docs/... link or a GitHub URL.`,
    );
  }
}

const CONTRACTS_DIR = join(APP_DIR, "content", "docs", "contracts");
const MANIFEST = join(REPO_ROOT, "packages", "chain", "src", "deployments", "97.json");
const BSCSCAN = "https://testnet.bscscan.com/address";

/** Core contract address slots → display label + one-line note. */
const CONTRACT_LABELS = {
  router: ["MaturaRouter", "Best-execution routing + on-chain leg re-validation"],
  settlementManager: ["SettlementManager", "Atomic, conservation-checked settlement waterfall"],
  claimRegistry: ["ClaimRegistry", "Issuer-authorized claim state (EIP-712 attestations)"],
  vaultRegistry: ["VaultRegistry", "Enumerable liquidity vaults + reservations"],
  issuerRegistry: ["IssuerRegistry", "Approved attestation signers + epochs"],
  mockUsdt: ["MockUSDT", "6-decimal test settlement asset (faucet)"],
};
const VAULT_LABELS = { stableVault: "Stable Vault", flexVault: "Flex Vault" };
const SOURCE_LABELS = {
  payroll: "Payroll claim source",
  freelance: "Freelance claim source",
  stream: "Stream claim source",
};

function addrRow(label, note, address) {
  return `| ${label} | ${note} | [\`${address}\`](${BSCSCAN}/${address}) |`;
}

/** Generate the deployed-addresses page from the chain manifest (build-time fs read, never bundled). */
function generateContractsPage() {
  if (!existsSync(MANIFEST)) {
    fail(`chain manifest not found at ${MANIFEST} — cannot generate the deployed-addresses page.`);
  }
  /** @type {{ chainId: number; deploymentBlock: string; addresses: Record<string,string>; namedVaults: Record<string,string>; sources: Record<string,string> }} */
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (m.chainId !== 97) fail(`manifest chainId is ${m.chainId}, expected 97 (BSC Testnet only).`);

  const core = Object.entries(CONTRACT_LABELS)
    .filter(([k]) => m.addresses[k])
    .map(([k, [label, note]]) => addrRow(label, note, m.addresses[k]))
    .join("\n");
  const vaults = Object.entries(m.namedVaults ?? {})
    .map(([k, a]) => addrRow(VAULT_LABELS[k] ?? k, "Liquidity vault", a))
    .join("\n");
  const sources = Object.entries(m.sources ?? {})
    .map(([k, a]) => addrRow(SOURCE_LABELS[k] ?? k, "Demo claim source", a))
    .join("\n");

  const page = `---
title: "Deployed addresses"
description: "Verified BSC Testnet (chain 97) contract addresses, generated from the deployment manifest."
---

> **Generated** from \`packages/chain/src/deployments/97.json\` at build time — never hand-edited, so
> it can never drift from the live deployment. **Network:** BNB Smart Chain **Testnet** (chain \`97\`).
> First indexed block: \`${m.deploymentBlock}\`. Testnet only — no real funds.

## Core contracts

| Contract | Role | Address (BscScan) |
| --- | --- | --- |
${core}

## Liquidity vaults

| Vault | Role | Address (BscScan) |
| --- | --- | --- |
${vaults}

## Demo claim sources

| Source | Role | Address (BscScan) |
| --- | --- | --- |
${sources}
`;

  mkdirSync(CONTRACTS_DIR, { recursive: true });
  writeFileSync(join(CONTRACTS_DIR, "deployed-addresses.md"), page);
  console.log(`[sync-reference-docs] generated contracts/deployed-addresses.md from 97.json`);
}

function run() {
  // Fresh output dir every run — removed allowlist entries never linger.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  for (const entry of ALLOWLIST) {
    const srcAbs = join(REPO_ROOT, entry.src);
    const label = entry.src;

    if (FORBIDDEN.some((re) => re.test(entry.src))) {
      fail(
        `${label}: matches a forbidden (internal/gitignored) path pattern — refusing to mirror.`,
      );
    }
    if (isGitIgnored(entry.src)) {
      fail(`${label}: is gitignored (internal/local-only) — refusing to publish it.`);
    }
    if (!existsSync(srcAbs)) {
      fail(`${label}: listed in the allowlist but not found on disk.`);
    }

    const raw = readFileSync(srcAbs, "utf8");

    const h1 = /^#\s+(.+?)\s*$/m.exec(raw);
    if (!h1) fail(`${label}: no leading '# H1' heading — cannot derive a title.`);

    // Strip the first H1 line (title comes from frontmatter instead, avoiding a double render).
    let body = raw.replace(/^#\s+.+?\r?\n/, "");

    if (entry.mermaid || /```mermaid/.test(body)) {
      body = replaceMermaid(body, entry.mermaid ?? [], label);
    }

    checkLinks(body, label);

    const sourceNote =
      `> **Source:** mirrored verbatim from [\`${entry.src}\`](${GITHUB_BLOB}/${entry.src}). ` +
      `Generated at build time — edit the source file, not this page.`;

    const frontmatter = [
      "---",
      `title: ${JSON.stringify(entry.title)}`,
      `description: ${JSON.stringify(entry.description)}`,
      "---",
      "",
    ].join("\n");

    writeFileSync(join(OUT_DIR, entry.out), `${frontmatter}\n${sourceNote}\n\n${body.trimStart()}`);
    console.log(`[sync-reference-docs] mirrored ${label} → reference/${entry.out}`);
  }

  // Section meta: fixed order + title for the generated "Reference" group.
  const meta = {
    title: "Reference",
    description: "Deep-reference docs mirrored from the repository.",
    pages: ALLOWLIST.map((e) => e.out.replace(/\.md$/, "")),
  };
  writeFileSync(join(OUT_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[sync-reference-docs] wrote reference/meta.json (${ALLOWLIST.length} pages)`);

  generateContractsPage();
}

run();
