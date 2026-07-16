import { describe, expect, it } from "vitest";
import {
  verifyBaseLifetimeRange,
  verifyGlobalUsdpSupply,
  verifyHealth,
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

  it("accepts complete Base lifetime analytics for both assets", () => {
    expect(
      verifyBaseLifetimeRange({
        status: "complete",
        range: "all",
        coverage: { availableComponents: 2, missingComponents: 0 },
        chains: [
          {
            chainId: 8453,
            assets: {
              usdp: {
                status: "available",
                currentHoldersAtCoverageEnd: 486,
                activity: {
                  transferVolume: "26878931865830441382036182",
                  transferCount: 129550,
                  uniqueParticipants: 937,
                  newHolders: 936,
                },
              },
              susdp: {
                status: "available",
                currentHoldersAtCoverageEnd: 12,
                activity: {
                  transferVolume: "53728306915538115636",
                  transferCount: 11,
                },
              },
            },
          },
        ],
      }),
    ).toMatchObject({ id: "base-lifetime-analytics", status: "pass" });
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
