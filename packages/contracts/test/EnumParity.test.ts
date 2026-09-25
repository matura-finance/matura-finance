import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CLAIM_TYPE, CLAIM_STATE } from "./helpers/constants.js";

// Parses `uint8 internal constant NAME = N;` from a single `library <libName>` block in the source.
function parseOrdinals(source: string, libName: string): Record<string, number> {
  const start = source.indexOf(`library ${libName}`);
  assert.ok(start >= 0, `library ${libName} not found`);
  const rest = source.slice(start + `library ${libName}`.length);
  const nextLib = rest.indexOf("library ");
  const body = nextLib === -1 ? rest : rest.slice(0, nextLib);
  const out: Record<string, number> = {};
  const re = /uint8 internal constant (\w+) = (\d+);/g;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined || name === "COUNT") continue;
    out[name] = Number(value);
  }
  return out;
}

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../contracts/libraries/ClaimEnums.sol"),
  "utf8",
);

describe("enum parity: ClaimEnums.sol ⇄ test constants", () => {
  it("ClaimTypes ordinals match constants.ts CLAIM_TYPE", () => {
    const sol = parseOrdinals(source, "ClaimTypes");
    for (const [name, ordinal] of Object.entries(CLAIM_TYPE)) {
      assert.equal(sol[name], ordinal, `ClaimType.${name}`);
    }
  });

  it("ClaimStates ordinals match constants.ts CLAIM_STATE", () => {
    const sol = parseOrdinals(source, "ClaimStates");
    for (const [name, ordinal] of Object.entries(CLAIM_STATE)) {
      assert.equal(sol[name], ordinal, `ClaimState.${name}`);
    }
  });
});
