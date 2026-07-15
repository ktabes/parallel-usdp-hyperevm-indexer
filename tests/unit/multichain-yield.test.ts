import { describe, expect, it } from "vitest";
import { aggregateSavingsYieldComponents } from "@/analytics/multichain-yield";

describe("cross-chain savings YPO aggregation", () => {
  it("sums only fully reconciled components", () => {
    const result = aggregateSavingsYieldComponents(
      [
        {
          id: "1",
          chainId: 1,
          nativeYpo: "100",
          reconciliationStatus: "verified",
        },
        {
          id: "2",
          chainId: 8453,
          nativeYpo: "200",
          reconciliationStatus: "candidate",
        },
      ],
      [1, 8453, 146],
    );

    expect(result.coverageStatus).toBe("partial");
    expect(result.includedChainIds).toEqual([1]);
    expect(result.missingChainIds).toEqual([146]);
    expect(result.unreconciledChainIds).toEqual([8453]);
    expect(result.nativeYpo).toBe(100n);
  });

  it("refuses a candidate-only global YPO total", () => {
    const result = aggregateSavingsYieldComponents(
      [
        {
          id: "1",
          chainId: 1,
          nativeYpo: "100",
          reconciliationStatus: "candidate",
        },
      ],
      [1],
    );

    expect(result.coverageStatus).toBe("unavailable");
    expect(result.includedChainIds).toEqual([]);
    expect(result.unreconciledChainIds).toEqual([1]);
    expect(result.nativeYpo).toBe(0n);
  });
});
