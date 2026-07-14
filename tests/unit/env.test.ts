import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "@/config/env";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/indexer_test",
  HYPEREVM_RPC_URL: "https://rpc.example.invalid",
  FINALITY_LAG: "5",
  RPC_LOG_CHUNK_SIZE: "5000",
  PRICE_SOURCE: "unconfigured",
  REFRESH_INTERVAL_SECONDS: "30",
};

describe("parseRuntimeEnv", () => {
  it("parses and coerces a complete environment", () => {
    expect(parseRuntimeEnv(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      FINALITY_LAG: 5,
      RPC_LOG_CHUNK_SIZE: 5_000,
      PRICE_SOURCE: "unconfigured",
      REFRESH_INTERVAL_SECONDS: 30,
    });
  });

  it("rejects a missing database URL", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects unsafe range configuration", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, RPC_LOG_CHUNK_SIZE: "0" }),
    ).toThrow(/RPC_LOG_CHUNK_SIZE/);
  });

  it("rejects a malformed RPC URL", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, HYPEREVM_RPC_URL: "not-a-url" }),
    ).toThrow(/HYPEREVM_RPC_URL/);
  });
});
