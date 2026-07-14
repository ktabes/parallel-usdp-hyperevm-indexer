import { describe, expect, it } from "vitest";
import {
  classifyRpcError,
  coverageGaps,
  mergeCoverage,
  planBlockRange,
  reduceChunkSize,
  retryDelayMs,
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
    expect(classifyRpcError(new Error("503 fetch failed"))).toBe("transient");
    expect(classifyRpcError(new Error("invalid address"))).toBe("fatal");
    expect(retryDelayMs(10, "rate-limit")).toBe(15_000);
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
