import { describe, expect, it } from "vitest";
import { buildStablewatchAssetPayload } from "@/integration/stablewatch";

const component = {
  chainId: 999,
  chainSlug: "hyperevm",
  blockNumber: "100",
  blockHash: `0x${"1".repeat(64)}`,
  blockTimestamp: "2026-07-16T00:00:00.000Z",
  status: "candidate",
  usdpTotalSupply: "1000000000000000000000",
  susdpTotalAssets: "100000000000000000000",
  susdpActualAssets: "99000000000000000000",
  susdpPendingYield: "1000000000000000000",
  susdpTotalSupply: "95000000000000000000",
  susdpSharePriceUsdp: "1052631578947368421",
  susdpEstimatedApy: "100000000000000000",
  susdpPauseState: 1,
  assetRelationshipVerified: true,
  manifestVersion: "manifest-v1",
  calculationVersion: "state-v1",
};

const baseInput = {
  generatedAt: "2026-07-16T00:01:00.000Z",
  global: {
    status: "complete",
    asOf: "2026-07-16T00:00:00.000Z",
    freshness: { stale: false },
    coverage: {
      expectedChainCount: 5,
      includedChainCount: 5,
      expectedChainIds: [1, 8453, 146, 999, 43114],
      includedChainIds: [1, 8453, 146, 999, 43114],
      missingChainIds: [],
      staleChainIds: [],
    },
    usdp: {
      supplyOnSavingsChains: "1000000000000000000000",
      scope: "five_savings_chains_only",
      globalSupplyStatus: "partial_until_24_chains",
    },
    susdp: {
      totalAssetsUsdp: "100000000000000000000",
      totalSupply: "95000000000000000000",
      weightedEstimatedApy: "100000000000000000",
      coverageStatus: "complete",
    },
    components: [component],
    calculationVersion: "global-v1",
  },
  history: {
    status: "partial",
    chains: [],
    global: null,
  },
  prices: {
    status: "candidate",
    blockNumber: "100",
    blockTimestamp: "2026-07-16T00:00:00.000Z",
    usdp: {
      priceUsdAtomic: "990000000000000000",
      decimals: 18,
      source: "DIA",
      stale: false,
    },
    susdp: {
      priceUsdAtomic: "1040000000000000000",
      decimals: 18,
      source: "DIA",
      stale: false,
    },
  },
};

describe("StableWatch-compatible asset payload", () => {
  it("keeps current estimated metrics available while aligned YPO is pending", () => {
    const payload = buildStablewatchAssetPayload(baseInput);

    expect(payload.status).toBe("partial");
    expect(payload.marketRow.tvlUsdp.value).toBe("100000000000000000000");
    expect(payload.marketRow.tvlUsdEstimate.value).toBe("99000000000000000000");
    expect(payload.marketRow.estimatedApy.attribution).toContain(
      "not trailing realized APY",
    );
    expect(payload.marketRow.ypoSevenDay.availability).toBe("unavailable");
    expect(payload.detail.chainBreakdown[0]?.chainSlug).toBe("hyperevm");
  });

  it("promotes only a complete reconciled global history interval", () => {
    const payload = buildStablewatchAssetPayload({
      ...baseInput,
      history: {
        status: "complete",
        chains: [],
        global: {
          windowStart: "2026-07-09T00:00:00.000Z",
          windowEnd: "2026-07-16T00:00:00.000Z",
          coverageStatus: "complete",
          nativeYpo: "500000000000000000000",
          includedChainIds: [1, 8453, 146, 999, 43114],
          missingChainIds: [],
          unreconciledChainIds: [],
          calculationVersion: "global-history-v1",
        },
      },
    });

    expect(payload.status).toBe("candidate");
    expect(payload.marketRow.ypoSevenDay).toMatchObject({
      availability: "available",
      verification: "verified",
      value: "500000000000000000000",
    });
  });

  it("fails USD estimates closed when price evidence is stale", () => {
    const payload = buildStablewatchAssetPayload({
      ...baseInput,
      prices: {
        ...baseInput.prices,
        usdp: { ...baseInput.prices.usdp, stale: true },
      },
    });

    expect(payload.marketRow.tvlUsdEstimate.availability).toBe("stale");
    expect(payload.marketRow.tvlUsdEstimate.reason).toBe(
      "source_snapshot_stale",
    );
  });
});
