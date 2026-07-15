import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "@/config/env";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/indexer_test",
  HYPEREVM_RPC_URL: "https://rpc.example.invalid",
  FINALITY_LAG: "5",
  RPC_LOG_CHUNK_SIZE: "50",
  PRICE_SOURCE: "unconfigured",
  REFRESH_INTERVAL_SECONDS: "30",
};

describe("parseRuntimeEnv", () => {
  it("parses and coerces a complete environment", () => {
    expect(parseRuntimeEnv(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      FINALITY_LAG: 5,
      RPC_LOG_CHUNK_SIZE: 50,
      RPC_REQUEST_INTERVAL_MS: 1_500,
      PRICE_SOURCE: "unconfigured",
      REFRESH_INTERVAL_SECONDS: 30,
      GLOBAL_SNAPSHOT_MAX_AGE_SECONDS: 300,
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

  it("rejects an unsafe RPC request interval", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, RPC_REQUEST_INTERVAL_MS: "100" }),
    ).toThrow(/RPC_REQUEST_INTERVAL_MS/);
  });

  it("rejects a malformed RPC URL", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, HYPEREVM_RPC_URL: "not-a-url" }),
    ).toThrow(/HYPEREVM_RPC_URL/);
  });

  it("accepts optional multichain RPCs and rejects malformed ones", () => {
    expect(
      parseRuntimeEnv({
        ...validEnvironment,
        ETHEREUM_RPC_URL: "https://ethereum-rpc.example",
        BASE_RPC_URL: "",
      }),
    ).toMatchObject({
      ETHEREUM_RPC_URL: "https://ethereum-rpc.example",
      BASE_RPC_URL: undefined,
    });
    expect(() =>
      parseRuntimeEnv({ ...validEnvironment, SONIC_RPC_URL: "not-a-url" }),
    ).toThrow(/SONIC_RPC_URL/);
  });

  it("accepts an optional Alchemy key without exposing it in a URL", () => {
    expect(
      parseRuntimeEnv({
        ...validEnvironment,
        ALCHEMY_API_KEY: "test-key-value",
      }).ALCHEMY_API_KEY,
    ).toBe("test-key-value");
    expect(
      parseRuntimeEnv({ ...validEnvironment, ALCHEMY_API_KEY: "" })
        .ALCHEMY_API_KEY,
    ).toBeUndefined();
  });

  it("accepts an optional OnFinality key", () => {
    expect(
      parseRuntimeEnv({
        ...validEnvironment,
        ONFINALITY_API_KEY: "archive-key-value",
      }).ONFINALITY_API_KEY,
    ).toBe("archive-key-value");
    expect(
      parseRuntimeEnv({ ...validEnvironment, ONFINALITY_API_KEY: "" })
        .ONFINALITY_API_KEY,
    ).toBeUndefined();
  });
});
