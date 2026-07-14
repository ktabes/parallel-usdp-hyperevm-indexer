import { describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_NETWORK_TESTS === "1";
const networkTest = shouldRun ? it : it.skip;

describe("HyperEVM RPC", () => {
  networkTest("reports HyperEVM mainnet chain id", async () => {
    const endpoint = process.env.HYPEREVM_RPC_URL;
    expect(
      endpoint,
      "HYPEREVM_RPC_URL is required when RUN_NETWORK_TESTS=1",
    ).toBeTruthy();

    const response = await fetch(endpoint!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as { result?: string };

    expect(response.ok).toBe(true);
    expect(payload.result).toBe("0x3e7");
  });
});
