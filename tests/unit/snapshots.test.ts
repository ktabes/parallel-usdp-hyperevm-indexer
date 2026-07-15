import { describe, expect, it } from "vitest";
import { evaluatePriceRound } from "@/analytics/snapshots";

const round = {
  roundId: 12n,
  answer: 100_000_000n,
  startedAt: 900n,
  updatedAt: 950n,
  answeredInRound: 12n,
  decimals: 8,
  description: "USDp/USD",
};

describe("finalized snapshot price evidence", () => {
  it("keeps exact feed units and reports freshness", () => {
    expect(evaluatePriceRound(round, 1_000n, 100n)).toEqual({
      priceUsdAtomic: "100000000",
      priceDecimals: 8,
      stale: false,
      ageSeconds: "50",
      metadata: {
        provider: "DIA",
        description: "USDp/USD",
        roundId: "12",
        startedAt: "900",
        updatedAt: "950",
        answeredInRound: "12",
        maximumAgeSeconds: "100",
      },
    });
  });

  it("marks an old observation stale without changing its value", () => {
    expect(evaluatePriceRound(round, 1_051n, 100n)).toMatchObject({
      priceUsdAtomic: "100000000",
      stale: true,
      ageSeconds: "101",
    });
  });

  it("fails closed for invalid answers and future feed timestamps", () => {
    expect(() =>
      evaluatePriceRound({ ...round, answer: 0n }, 1_000n, 100n),
    ).toThrow("positive");
    expect(() =>
      evaluatePriceRound({ ...round, updatedAt: 1_031n }, 1_000n, 100n),
    ).toThrow("ahead");
  });
});
