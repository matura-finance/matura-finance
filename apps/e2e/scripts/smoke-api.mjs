// Remote API smoke — probes an ALREADY-DEPLOYED Matura API over HTTP(S).
//
// Track B, step 10 (catch-up gate + smoke). It never boots anything; it drives the live API:
//   1. GET  /api/v1/health        → 200 { status: "ok" }              (liveness)
//   2. GET  /api/v1/health/ready  → poll until checks.cursor.status == "up"  (indexer caught up)
//   3. GET  /api/v1/auth/nonce    → assert SIWE nonce shape { nonce, domain, chainId }
//      POST /api/v1/auth/verify   → a BOGUS signature must be REJECTED (non-2xx)
//      NOTE: a valid nonce→sign→verify→bearer needs a signing key; that authed leg runs at
//            Track B with the operator wallet. Here we prove the SIWE surface without a key.
//   4. POST /api/v1/routes/optimize (no bearer) → 401  (fail-closed auth guard holds)
//      GET  /api/v1/vaults        → assert read-model shape { vaults[], finalizedThrough }
//
// Env:
//   SMOKE_API_URL         API origin, e.g. https://api.matura.xyz (a trailing /api/v1 is tolerated).
//                         Must be https:// EXCEPT localhost/127.0.0.1 (for the local dry-run).
//   SMOKE_READY_TIMEOUT_MS  max wait for readiness (default 120000).
//   SMOKE_POLL_INTERVAL_MS  poll cadence for /health/ready (default 3000).
//   SMOKE_REQUEST_TIMEOUT_MS per-request timeout (default 10000).
//
// Exit 0 = all checks passed; exit 1 = any check failed (or env missing).

const rawUrl = process.env.SMOKE_API_URL;
if (rawUrl === undefined || rawUrl === "") {
  console.error(
    "smoke-api: SMOKE_API_URL is required (the deployed API origin, e.g. https://api.matura.xyz).",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  console.error(`smoke-api: SMOKE_API_URL is not a valid URL: ${rawUrl}`);
  process.exit(1);
}
const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
if (parsed.protocol !== "https:" && !isLocalhost) {
  console.error(`smoke-api: SMOKE_API_URL must be https:// (got ${parsed.protocol}//): ${rawUrl}`);
  console.error("  (http:// is allowed only for localhost/127.0.0.1 dry-runs.)");
  process.exit(1);
}

// Normalize to an origin base, tolerating either `…/api/v1` or a bare origin.
const base = rawUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
const api = (path) => `${base}/api/v1${path}`;

const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? "120000");
const POLL_INTERVAL_MS = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? "3000");
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? "10000");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a bounded per-request timeout; returns { status, ok, json } (json may be null). */
async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Throwing assertion — the message names the failed check for the final report. */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

async function checkLiveness() {
  const { status, json } = await request(api("/health"));
  assert(status === 200, `GET /health expected 200, got ${status}`);
  assert(
    isRecord(json) && json.status === "ok",
    `GET /health expected { status: "ok" }, got ${JSON.stringify(json)}`,
  );
  console.log("  PASS  liveness: GET /health → 200 { status: 'ok' }");
}

async function checkReadiness() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = null;
  // /health/ready returns 503 (with a JSON body) while degraded, 200 once all checks are up.
  while (Date.now() < deadline) {
    const { json } = await request(api("/health/ready"));
    last = json;
    const cursor = isRecord(json) && isRecord(json.checks) ? json.checks.cursor : undefined;
    if (isRecord(cursor) && cursor.status === "up") {
      console.log(
        `  PASS  readiness: cursor up (lagBlocks=${cursor.lagBlocks}, lagMs=${cursor.lagMs})`,
      );
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `readiness: cursor not up within ${READY_TIMEOUT_MS}ms (last=${JSON.stringify(last)})`,
  );
}

async function checkSiweSurface() {
  const { status, json } = await request(api("/auth/nonce"));
  assert(status === 200, `GET /auth/nonce expected 200, got ${status}`);
  assert(
    isRecord(json) &&
      typeof json.nonce === "string" &&
      json.nonce.length > 0 &&
      typeof json.domain === "string" &&
      typeof json.chainId === "number",
    `GET /auth/nonce shape mismatch: ${JSON.stringify(json)}`,
  );
  console.log(
    `  PASS  SIWE nonce shape: { nonce, domain: '${json.domain}', chainId: ${json.chainId} }`,
  );

  // A bogus (but 0x-hex, so DTO-valid) signature must be REJECTED by SIWE verification.
  const bogus = await request(api("/auth/verify"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "smoke: not a real SIWE message",
      signature: `0x${"11".repeat(65)}`,
    }),
  });
  assert(!bogus.ok, `POST /auth/verify should REJECT a bogus signature, got ${bogus.status}`);
  console.log(`  PASS  SIWE verify rejects a bogus signature (status ${bogus.status})`);
  console.log("  SKIP  authed sign→bearer leg: needs a signing key — exercised at Track B.");
}

async function checkAuthGuardAndRead() {
  // Fail-closed guard: an authed write-prep endpoint must reject an unauthenticated request.
  const guarded = await request(api("/routes/optimize"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(
    guarded.status === 401,
    `POST /routes/optimize without a bearer expected 401, got ${guarded.status}`,
  );
  console.log("  PASS  fail-closed guard: POST /routes/optimize (no bearer) → 401");

  // Public read-model shape check — proves the projection is being served.
  const { status, json } = await request(api("/vaults"));
  assert(status === 200, `GET /vaults expected 200, got ${status}`);
  assert(
    isRecord(json) && Array.isArray(json.vaults) && typeof json.finalizedThrough === "string",
    `GET /vaults shape mismatch: ${JSON.stringify(json)}`,
  );
  console.log(
    `  PASS  read-model shape: GET /vaults → { vaults: [${json.vaults.length}], finalizedThrough }`,
  );
}

async function main() {
  console.log(`smoke-api: probing ${base}`);
  await checkLiveness();
  await checkReadiness();
  await checkSiweSurface();
  await checkAuthGuardAndRead();
  console.log("smoke-api: PASS — all checks green.");
}

main().catch((err) => {
  console.error(`smoke-api: FAIL — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
