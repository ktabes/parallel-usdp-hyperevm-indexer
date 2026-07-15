import { describe, expect, it } from "vitest";
import {
  aggregateSavingsComponents,
  type SavingsAggregationComponent,
} from "@/analytics/multichain-snapshots";

const asOf = new Date("2026-07-15T20:00:00.000Z");

function component(
  chainId: number,
  options: Partial<SavingsAggregationComponent> = {},
): SavingsAggregationComponent {
  return {
    snapshotId: String(chainId),
    chainId,
    blockTimestamp: new Date("2026-07-15T19:59:30.000Z"),
    snapshotStatus: "candidate",
    usdpTotalSupply: "1000",
    susdpTotalSupply: "90",
    susdpTotalAssets: "100",
    susdpEstimatedApy: "100000000000000000",
    ...options,
  };
}

describe("cross-chain savings aggregation", () => {
  it("produces a complete additive snapshot with a TVL-weighted APY", () => {
    const expected = [1, 8453, 146, 999, 43114];
    const result = aggregateSavingsComponents(
      [
        component(1, {
          susdpTotalAssets: "100",
          susdpEstimatedApy: "100000000000000000",
        }),
        component(8453, {
          susdpTotalAssets: "300",
          susdpEstimatedApy: "200000000000000000",
        }),
        component(146),
        component(999),
        component(43114),
      ],
      expected,
      asOf,
      300,
    );

    expect(result.coverageStatus).toBe("complete");
    expect(result.missingChainIds).toEqual([]);
    expect(result.susdpTotalAssets).toBe(700n);
    expect(result.usdpSupplyOnSavingsChains).toBe(5_000n);
    expect(result.weightedEstimatedApy).toBe(142857142857142857n);
  });

  it("excludes stale and invalid components and reports partial coverage", () => {
    const result = aggregateSavingsComponents(
      [
        component(1),
        component(8453, {
          blockTimestamp: new Date("2026-07-15T19:40:00.000Z"),
        }),
        component(146, { snapshotStatus: "invalid" }),
      ],
      [1, 8453, 146, 999, 43114],
      asOf,
      300,
    );

    expect(result.coverageStatus).toBe("partial");
    expect(result.includedChainIds).toEqual([1]);
    expect(result.staleChainIds).toEqual([8453, 146]);
    expect(result.missingChainIds).toEqual([999, 43114]);
    expect(result.susdpTotalAssets).toBe(100n);
  });

  it("returns unavailable without usable chain components", () => {
    const result = aggregateSavingsComponents(
      [],
      [1, 8453, 146, 999, 43114],
      asOf,
      300,
    );

    expect(result.coverageStatus).toBe("unavailable");
    expect(result.weightedEstimatedApy).toBeNull();
    expect(result.missingChainIds).toHaveLength(5);
  });
});
