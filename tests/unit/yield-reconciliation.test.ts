import { describe, expect, it } from "vitest";
import { reconcileConstantRateWindow } from "@/analytics/yield-reconciliation";
import { computeUpdatedAssets } from "@/protocol/savings-math";

describe("savings YPO rate reconciliation", () => {
  it("verifies an exact constant-rate interval independently", () => {
    const actual = 1_000_000n;
    const rate = 3_022_307_772_824_702_283n;
    const lastUpdate = 1_000n;
    const startTimestamp = 2_000n;
    const endTimestamp = 3_000n;
    const start = computeUpdatedAssets(
      actual,
      rate,
      startTimestamp - lastUpdate,
    );
    const end = computeUpdatedAssets(actual, rate, endTimestamp - lastUpdate);

    expect(
      reconcileConstantRateWindow({
        actualAssetsAtStart: actual,
        actualAssetsAtEnd: actual,
        totalAssetsAtStart: start,
        totalAssetsAtEnd: end,
        rateAtStart: rate,
        rateAtEnd: rate,
        lastUpdateAtStart: lastUpdate,
        lastUpdateAtEnd: lastUpdate,
        blockTimestampAtStart: startTimestamp,
        blockTimestampAtEnd: endTimestamp,
        accruedInterest: 0n,
        nativeYpo: end - start,
      }),
    ).toMatchObject({
      status: "verified",
      reason: "constant_rate_integration_exact",
      ypoDelta: "0",
    });
  });

  it("keeps changing or accrued intervals candidate for segmentation", () => {
    expect(
      reconcileConstantRateWindow({
        actualAssetsAtStart: 100n,
        actualAssetsAtEnd: 101n,
        totalAssetsAtStart: 100n,
        totalAssetsAtEnd: 101n,
        rateAtStart: 0n,
        rateAtEnd: 0n,
        lastUpdateAtStart: 1n,
        lastUpdateAtEnd: 2n,
        blockTimestampAtStart: 10n,
        blockTimestampAtEnd: 20n,
        accruedInterest: 1n,
        nativeYpo: 1n,
      }),
    ).toEqual({
      status: "candidate",
      reason: "segmented_rate_reconciliation_required",
    });
  });
});
