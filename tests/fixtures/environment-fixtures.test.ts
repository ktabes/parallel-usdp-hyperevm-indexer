import { describe, expect, it } from "vitest";
import { runtimeEnvSchema } from "@/config/env";

describe("configuration fixtures", () => {
  it.each([
    ["negative finality", { FINALITY_LAG: "-1" }],
    ["fractional chunk", { RPC_LOG_CHUNK_SIZE: "1.5" }],
    ["unsafe RPC pace", { RPC_REQUEST_INTERVAL_MS: "100" }],
    ["too-fast refresh", { REFRESH_INTERVAL_SECONDS: "1" }],
    ["unknown price source", { PRICE_SOURCE: "magic" }],
  ])("rejects %s", (_name, override) => {
    const result = runtimeEnvSchema.safeParse({
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/indexer_test",
      HYPEREVM_RPC_URL: "https://rpc.example.invalid",
      ...override,
    });

    expect(result.success).toBe(false);
  });
});
