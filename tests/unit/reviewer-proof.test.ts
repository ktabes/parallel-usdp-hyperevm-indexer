import { describe, expect, it } from "vitest";
import {
  verifyGlobalUsdpSupply,
  verifyHealth,
  verifyLifetimeRange,
  verifySavingsHistory,
  verifyStablewatchProjection,
} from "../../scripts/reviewer-proof";

function globalSupplyFixture(componentCount = 24) {
  return {
    snapshotStatus: "complete",
    accountingStatus: "candidate",
    candidateTotalSupply: "2002447001272243447105794",
    asOf: "2026-07-16T12:00:00.000Z",
    coverage: {
      expectedChainCount: 24,
      includedChainCount: componentCount,
      missingChainIds: [],
      staleChainIds: [],
      failedChainIds: [],
      componentSkewSeconds: 1424,
    },
    components: Array.from({ length: componentCount }, (_, index) => ({
      chainId: index + 1,
      metadata: { verified: true },
    })),
  };
}

describe("reviewer proof validators", () => {
  it("accepts the public service identity", () => {
    expect(
      verifyHealth({
        status: "ok",
        service: "parallel-usdp-hyperevm-indexer",
        phase: 10,
        phaseStatus: "stablewatch-handoff-candidate",
        timestamp: "2026-07-16T12:00:00.000Z",
      }),
    ).toMatchObject({ id: "service-health", status: "pass" });
  });

  it("requires complete verified 24-chain USDp supply", () => {
    expect(verifyGlobalUsdpSupply(globalSupplyFixture())).toMatchObject({
      id: "global-usdp-supply",
      status: "pass",
      evidence: { includedChainCount: 24 },
    });
    expect(() => verifyGlobalUsdpSupply(globalSupplyFixture(23))).toThrow(
      /all 24 registered chains/,
    );
  });

  it("accepts complete four-chain lifetime analytics for both assets", () => {
    const chain = (chainId: number) => ({
      chainId,
      chainSlug: `chain-${chainId}`,
      assets: {
        usdp: {
          status: "available",
          coverage: { historyComplete: true },
          currentHoldersAtCoverageEnd: 29,
          activity: { transferVolume: "100", transferCount: 2 },
        },
        susdp: {
          status: "available",
          coverage: { historyComplete: true },
          currentHoldersAtCoverageEnd: 6,
          activity: { transferVolume: "50", transferCount: 1 },
        },
      },
      savings: {
        flows: {
          depositedAssets: "20",
          withdrawnAssets: "10",
          depositCount: 2,
          withdrawCount: 1,
        },
      },
    });
    expect(
      verifyLifetimeRange({
        status: "complete",
        range: "all",
        coverage: { availableComponents: 8, missingComponents: 0 },
        chains: [1, 8453, 146, 43114].map(chain),
      }),
    ).toMatchObject({ id: "four-chain-lifetime-analytics", status: "pass" });
  });

  it("accepts verified aligned five-chain YPO with fixed HyperEVM provenance", () => {
    const chains = [1, 8453, 146, 999, 43114].map((chainId) => ({
      chainId,
      chainSlug: `chain-${chainId}`,
      fromBlock: chainId === 999 ? "39958147" : "1",
      toBlock: chainId === 999 ? "40572940" : "2",
      coverageScope:
        chainId === 999
          ? "parallel-savings-hyperevm-1783558757-1784163557-v1"
          : `scope-${chainId}`,
      nativeYpo: "1",
      reconciliationStatus: "verified",
    }));
    expect(
      verifySavingsHistory({
        status: "complete",
        chains,
        global: {
          coverageStatus: "complete",
          expectedChainCount: 5,
          includedChainCount: 5,
          missingChainIds: [],
          unreconciledChainIds: [],
          nativeYpo: "5",
          windowStart: "2026-07-09T00:59:17.000Z",
          windowEnd: "2026-07-16T00:59:17.000Z",
        },
      }),
    ).toMatchObject({ id: "five-chain-aligned-ypo", status: "pass" });
  });

  it("accepts a renderable versioned StableWatch projection", () => {
    expect(
      verifyStablewatchProjection({
        schemaVersion: "parallel-stablewatch-asset-v1",
        status: "candidate",
        generatedAt: "2026-07-16T12:00:00.000Z",
        detail: {
          usdpSupply: {
            global: {
              availability: "available",
              verification: "candidate",
              value: "2002447001272243447105794",
            },
          },
          chainBreakdown: [{ chainId: 8453 }],
        },
      }),
    ).toMatchObject({ id: "stablewatch-projection", status: "pass" });
  });
});
