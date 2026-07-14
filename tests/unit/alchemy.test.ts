import { describe, expect, it } from "vitest";
import {
  alchemyRpcUrl,
  onfinalityArchiveRpcUrl,
  ONFINALITY_PUBLIC_ARCHIVE_RPC_URL,
  redactSecrets,
} from "@/rpc/alchemy";

describe("RPC provider configuration", () => {
  it("constructs the HyperEVM endpoint from a key", () => {
    expect(alchemyRpcUrl("example-key")).toBe(
      "https://hyperliquid-mainnet.g.alchemy.com/v2/example-key",
    );
  });

  it("pins the verified public archival endpoint", () => {
    expect(ONFINALITY_PUBLIC_ARCHIVE_RPC_URL).toBe(
      "https://hyperliquid.api.onfinality.io/evm/public",
    );
  });

  it("constructs the private archival endpoint from a key", () => {
    expect(onfinalityArchiveRpcUrl("archive-key")).toBe(
      "https://hyperliquid.api.onfinality.io/evm?apikey=archive-key",
    );
    expect(onfinalityArchiveRpcUrl()).toBe(ONFINALITY_PUBLIC_ARCHIVE_RPC_URL);
  });

  it("redacts keys from provider errors", () => {
    expect(
      redactSecrets(
        "request failed: https://example.invalid/v2/sensitive-key-value",
        ["sensitive-key-value"],
      ),
    ).toBe("request failed: https://example.invalid/v2/[REDACTED]");
  });
});
