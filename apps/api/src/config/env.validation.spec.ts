import { validateEnv } from "./env.validation";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public" };

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
});
