import { validateEnv } from "./env.validation";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  JWT_SECRET: "j".repeat(40), // computed dummy (≥32) — not a literal, so no false secret-scan hit
};

describe("validateEnv", () => {
  it("applies defaults for optional keys", () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.CHAIN_ID).toBe(31337);
    expect(env.RPC_URL).toBe("http://127.0.0.1:8545");
    expect(env.INDEXER_CONFIRMATIONS).toBe(0);
    expect(env.INDEXER_MAX_BLOCK_RANGE).toBe(1000);
    expect(env.CURSOR_STALE_MS).toBe(30_000);
  });

  it("coerces numeric strings to numbers", () => {
    const env = validateEnv({ ...base, CHAIN_ID: "97", INDEXER_CONFIRMATIONS: "12" });
    expect(env.CHAIN_ID).toBe(97);
    expect(env.INDEXER_CONFIRMATIONS).toBe(12);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment variables/);
  });

  it("throws when RPC_URL is not a URL", () => {
    expect(() => validateEnv({ ...base, RPC_URL: "not-a-url" })).toThrow(
      /Invalid environment variables/,
    );
  });

  it("rejects a malformed ISSUER_PRIVATE_KEY", () => {
    expect(() => validateEnv({ ...base, ISSUER_PRIVATE_KEY: "0xabc" })).toThrow(
      /Invalid environment variables/,
    );
  });

  it("accepts an empty ISSUER_PRIVATE_KEY", () => {
    expect(validateEnv({ ...base, ISSUER_PRIVATE_KEY: "" }).ISSUER_PRIVATE_KEY).toBe("");
  });

  it("throws when JWT_SECRET is too short", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "short" })).toThrow(
      /Invalid environment variables/,
    );
  });

  it("parses DEMO_ISSUER_SIGNING_ENABLED='false' as false (not truthy-coerced)", () => {
    expect(
      validateEnv({ ...base, DEMO_ISSUER_SIGNING_ENABLED: "false" }).DEMO_ISSUER_SIGNING_ENABLED,
    ).toBe(false);
  });

  it("rejects demo issuer signing in production (fail-closed)", () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: "production",
        DEMO_ISSUER_SIGNING_ENABLED: "true",
        ISSUER_PRIVATE_KEY: `0x${"a".repeat(64)}`,
      }),
    ).toThrow(/Invalid environment variables/);
  });

  it("rejects a non-empty ISSUER_PRIVATE_KEY in production (fail-fast)", () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", ISSUER_PRIVATE_KEY: `0x${"a".repeat(64)}` }),
    ).toThrow(/Invalid environment variables/);
  });

  it("allows demo issuer signing in development with a key", () => {
    const env = validateEnv({
      ...base,
      DEMO_ISSUER_SIGNING_ENABLED: "true",
      ISSUER_PRIVATE_KEY: `0x${"a".repeat(64)}`,
    });
    expect(env.DEMO_ISSUER_SIGNING_ENABLED).toBe(true);
  });
});
