import { describe, expect, it } from "vitest";
import {
  aggregateUsdpSupplyComponents,
  isBlockTimestampOutsideAlignment,
  runWithSupplyRpcFailover,
  type UsdpSupplyComponent,
} from "@/analytics/usdp-supply";
import {
  publicSupplyRpcUrls,
  usdpSupplyAdapters,
} from "@/protocol/usdp-chains";

const asOf = new Date("2026-07-16T12:00:00.000Z");

function component(
  chainId: number,
  options: Partial<UsdpSupplyComponent> = {},
): UsdpSupplyComponent {
  return {
    assetSnapshotId: String(chainId),
    chainId,
    chainSlug: `chain-${chainId}`,
    chainName: `Chain ${chainId}`,
    blockNumber: "100",
    blockHash: `0x${"1".repeat(64)}`,
    blockTimestamp: new Date("2026-07-16T11:59:00.000Z"),
    totalSupply: "1000",
    snapshotStatus: "candidate",
    metadataVerified: true,
    observedName: "USDp",
    observedSymbol: "USDp",
    observedDecimals: 18,
    codeHash: `0x${"2".repeat(64)}`,
    finalityMode: "rpc-finalized",
    rpcSource: "public-default",
    manifestVersion: "test-v1",
    ...options,
  };
}

describe("global USDp supply aggregation", () => {
  it("requires all 24 registered deployments for complete coverage", () => {
    const expected = usdpSupplyAdapters.map((adapter) => adapter.chain.id);
    const result = aggregateUsdpSupplyComponents({
      components: expected.map((chainId) => component(chainId)),
      expectedChainIds: expected,
      failedChainIds: [],
      asOf,
      maximumAgeSeconds: 3_600,
      alignmentMaximumSkewSeconds: 1_800,
    });

    expect(expected).toHaveLength(24);
    expect(result.coverageStatus).toBe("complete");
    expect(result.includedChainIds).toHaveLength(24);
    expect(result.candidateTotalSupply).toBe(24_000n);
    expect(result.failedChainIds).toEqual([]);
  });

  it("excludes stale, misaligned, and metadata-invalid components", () => {
    const result = aggregateUsdpSupplyComponents({
      components: [
        component(1),
        component(8453, {
          blockTimestamp: new Date("2026-07-16T10:00:00.000Z"),
        }),
        component(146, {
          metadataVerified: false,
          snapshotStatus: "invalid",
          observedSymbol: "WRONG",
        }),
      ],
      expectedChainIds: [1, 8453, 146, 999],
      failedChainIds: [999],
      asOf,
      maximumAgeSeconds: 3_600,
      alignmentMaximumSkewSeconds: 1_800,
    });

    expect(result.coverageStatus).toBe("partial");
    expect(result.includedChainIds).toEqual([1]);
    expect(result.staleChainIds).toEqual([8453]);
    expect(result.failedChainIds).toEqual([146, 999]);
    expect(result.candidateTotalSupply).toBe(1_000n);
  });
});

describe("USDp supply block alignment", () => {
  it("accepts a finalized block inside the window and rejects old or future tags", () => {
    expect(isBlockTimestampOutsideAlignment(1_784_203_140n, asOf, 1_800)).toBe(
      false,
    );
    expect(isBlockTimestampOutsideAlignment(1_784_200_000n, asOf, 1_800)).toBe(
      true,
    );
    expect(isBlockTimestampOutsideAlignment(1_784_205_601n, asOf, 1_800)).toBe(
      true,
    );
  });

  it("excludes only a component captured outside the common observation window", () => {
    const result = aggregateUsdpSupplyComponents({
      components: [
        component(1),
        component(56, {
          blockTimestamp: new Date("2026-07-16T12:31:00.000Z"),
        }),
      ],
      expectedChainIds: [1, 56],
      failedChainIds: [],
      asOf,
      maximumAgeSeconds: 3_600,
      alignmentMaximumSkewSeconds: 1_800,
    });

    expect(result.coverageStatus).toBe("partial");
    expect(result.includedChainIds).toEqual([1]);
    expect(result.staleChainIds).toEqual([56]);
    expect(result.candidateTotalSupply).toBe(1_000n);
  });
});

describe("USDp supply adapter registry", () => {
  it("matches every canonical USDp deployment exactly once", () => {
    expect(usdpSupplyAdapters).toHaveLength(24);
    expect(
      new Set(usdpSupplyAdapters.map((adapter) => adapter.chain.id)).size,
    ).toBe(24);
  });

  it("keeps multiple official public BNB endpoints available", () => {
    const bnb = usdpSupplyAdapters.find((adapter) => adapter.chain.id === 56)!;
    expect(publicSupplyRpcUrls(bnb)).toEqual(
      expect.arrayContaining([
        "https://bsc-dataseed.bnbchain.org",
        "https://bsc-dataseed-public.bnbchain.org",
      ]),
    );
    expect(publicSupplyRpcUrls(bnb)[0]).toBe(
      "https://bsc-dataseed.bnbchain.org",
    );
  });
});

describe("USDp supply RPC failover", () => {
  it("uses the next candidate after a transient provider failure", async () => {
    const attempted: string[] = [];
    await expect(
      runWithSupplyRpcFailover({
        rpcUrls: ["primary", "fallback"],
        attemptsPerRpc: 2,
        retryDelayMs: 0,
        operation: async (rpcUrl) => {
          attempted.push(rpcUrl);
          if (rpcUrl === "primary") throw new Error("temporarily unavailable");
          return "snapshot";
        },
      }),
    ).resolves.toBe("snapshot");
    expect(attempted).toEqual(["primary", "primary", "fallback"]);
  });
});
