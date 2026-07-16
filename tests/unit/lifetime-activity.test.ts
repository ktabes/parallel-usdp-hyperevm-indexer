import { describe, expect, it } from "vitest";
import {
  lifetimeActivityFromBlock,
  lifetimeActivityRequestCount,
  lifetimeActivityScope,
} from "@/analytics/lifetime-activity";
import { savingsChainAdapters } from "@/protocol/savings-chains";

describe("lifetime dual-asset activity planning", () => {
  it("starts each savings chain at its earliest USDp or sUSDp deployment", () => {
    expect(
      Object.fromEntries(
        savingsChainAdapters.map((adapter) => [
          adapter.chainSlug,
          lifetimeActivityFromBlock(adapter),
        ]),
      ),
    ).toEqual({
      ethereum: 22_639_007n,
      base: 31_200_853n,
      sonic: 32_199_398n,
      hyperevm: 5_035_286n,
      avalanche: 63_383_232n,
    });
  });

  it("uses a stable chain-isolated checkpoint scope", () => {
    const base = savingsChainAdapters.find(({ chainId }) => chainId === 8453)!;
    expect(lifetimeActivityScope(base)).toBe(
      "parallel-assets-base-lifetime-v1",
    );
  });

  it("estimates inclusive log request counts", () => {
    expect(lifetimeActivityRequestCount(10n, 10n, 2_000)).toBe(1n);
    expect(lifetimeActivityRequestCount(10n, 2_009n, 2_000)).toBe(1n);
    expect(lifetimeActivityRequestCount(10n, 2_010n, 2_000)).toBe(2n);
    expect(lifetimeActivityRequestCount(11n, 10n, 2_000)).toBe(0n);
  });
});
