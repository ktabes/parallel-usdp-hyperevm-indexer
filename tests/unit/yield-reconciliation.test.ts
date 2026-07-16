import { describe, expect, it } from "vitest";
import {
  integrateSegmentedRateWindow,
  reconcileConstantRateWindow,
} from "@/analytics/yield-reconciliation";
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

  it("integrates rate segments across accrual, deposit, withdrawal, and rate changes", () => {
    const rate = 3_022_307_772_824_702_283n;
    const startActual = 1_000_000n;
    const startTimestamp = 1_100n;
    const lastUpdate = 1_000n;
    const startTotal = computeUpdatedAssets(
      startActual,
      rate,
      startTimestamp - lastUpdate,
    );
    const accruedAt1200 =
      computeUpdatedAssets(startActual, rate, 200n) - startActual;
    const changedRate = rate * 2n;
    const afterAccrual = startActual + accruedAt1200 + 50_000n - 10_000n;
    const pendingAtEnd =
      computeUpdatedAssets(afterAccrual, changedRate, 100n) - afterAccrual;
    const expectedYpo =
      accruedAt1200 - (startTotal - startActual) + pendingAtEnd;

    const result = integrateSegmentedRateWindow({
      actualAssetsAtStart: startActual,
      totalAssetsAtStart: startTotal,
      rateAtStart: rate,
      lastUpdateAtStart: lastUpdate,
      blockTimestampAtStart: startTimestamp,
      blockTimestampAtEnd: 1_300n,
      events: [
        {
          timestamp: 1_200n,
          logIndex: 1,
          eventName: "Accrued",
          interest: accruedAt1200,
        },
        {
          timestamp: 1_200n,
          logIndex: 2,
          eventName: "Deposit",
          assets: 50_000n,
        },
        {
          timestamp: 1_200n,
          logIndex: 3,
          eventName: "Withdraw",
          assets: 10_000n,
        },
        {
          timestamp: 1_200n,
          logIndex: 4,
          eventName: "RateUpdated",
          newRate: changedRate,
        },
      ],
    });

    expect(result.integratedYpo).toBe(expectedYpo);
    expect(result.accruedVariance).toBe(0n);
    expect(result.predictedPendingYieldAtEnd).toBe(pendingAtEnd);
  });
});
