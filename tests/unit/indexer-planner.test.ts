import { describe, expect, it } from "vitest";
import {
  classifyRpcError,
  coverageGaps,
  mergeCoverage,
  planBlockRange,
  providerRangeLimit,
  reduceChunkSize,
  retryDelayMs,
  shouldRetryRpcError,
} from "@/indexer/planner";

describe("indexer range planning", () => {
  it("caps a planned chunk at the requested end", () => {
    expect(planBlockRange(100n, 112n, 10)).toEqual({
      fromBlock: 100n,
      toBlock: 109n,
    });
    expect(planBlockRange(110n, 112n, 10)).toEqual({
      fromBlock: 110n,
      toBlock: 112n,
    });
  });

  it("reduces rejected ranges without reaching zero", () => {
    expect(reduceChunkSize(50)).toBe(25);
    expect(reduceChunkSize(3)).toBe(1);
    expect(reduceChunkSize(1)).toBe(1);
  });

  it("classifies provider failures and bounds retry delay", () => {
    expect(classifyRpcError(new Error("block range limited to 50"))).toBe(
      "range",
    );
    expect(classifyRpcError(new Error("429 Too Many Requests"))).toBe(
      "rate-limit",
    );
    expect(
      classifyRpcError(new Error("exceeded compute units per second capacity")),
    ).toBe("rate-limit");
    expect(classifyRpcError(new Error("503 fetch failed"))).toBe("transient");
    expect(classifyRpcError(new Error("invalid address"))).toBe("fatal");
    const providerLimit = new Error(
      "eth_getLogs is limited to a 5 range, upgrade your plan",
    );
    expect(classifyRpcError(providerLimit)).toBe("range");
    expect(providerRangeLimit(providerLimit)).toBe(5);
    expect(retryDelayMs(1, "rate-limit", () => 0)).toBe(1_600);
    expect(retryDelayMs(1, "rate-limit", () => 0.5)).toBe(2_000);
    expect(retryDelayMs(1, "rate-limit", () => 1)).toBe(2_400);
    expect(retryDelayMs(10, "rate-limit", () => 0.5)).toBe(60_000);
    expect(retryDelayMs(10, "transient", () => 0.5)).toBe(15_000);
  });

  it("keeps rate limits retryable while retaining finite transient retries", () => {
    expect(shouldRetryRpcError("rate-limit", 500, 5, true)).toBe(true);
    expect(shouldRetryRpcError("rate-limit", 5, 5, false)).toBe(false);
    expect(shouldRetryRpcError("transient", 4, 5, true)).toBe(true);
    expect(shouldRetryRpcError("transient", 5, 5, true)).toBe(false);
    expect(shouldRetryRpcError("fatal", 0, 5, true)).toBe(false);
  });

  it("merges overlapping reruns and identifies exact gaps", () => {
    const merged = mergeCoverage([
      { fromBlock: 110n, toBlock: 119n },
      { fromBlock: 100n, toBlock: 109n },
      { fromBlock: 105n, toBlock: 112n },
      { fromBlock: 130n, toBlock: 139n },
    ]);
    expect(merged).toEqual([
      { fromBlock: 100n, toBlock: 119n },
      { fromBlock: 130n, toBlock: 139n },
    ]);
    expect(coverageGaps(merged, 100n, 139n)).toEqual([
      { fromBlock: 120n, toBlock: 129n },
    ]);
  });
});
