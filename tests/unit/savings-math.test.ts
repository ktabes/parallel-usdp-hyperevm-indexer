import { describe, expect, it } from "vitest";
import {
  calculateNativeYpo,
  calculatePendingYield,
  computeUpdatedAssets,
} from "@/protocol/savings-math";

describe("Savings fixed-point math", () => {
  it("matches the contract approximation for the current 10% APR rate", () => {
    const rate = 3_022_307_772_824_702_283n;
    expect(computeUpdatedAssets(10n ** 18n, rate, 31_536_000n)).toBe(
      1_099_999_999_999_999_984n,
    );
  });

  it("returns the balance unchanged for zero elapsed time or rate", () => {
    expect(computeUpdatedAssets(123n, 5n, 0n)).toBe(123n);
    expect(computeUpdatedAssets(123n, 0n, 100n)).toBe(123n);
  });

  it("calculates pending yield and rejects impossible negative values", () => {
    expect(calculatePendingYield(1_250n, 1_000n)).toBe(250n);
    expect(() => calculatePendingYield(999n, 1_000n)).toThrow(/negative/);
  });

  it("counts accrued events and pending-yield boundary changes once", () => {
    expect(calculateNativeYpo(100n, 40n, 65n)).toBe(125n);
    expect(() => calculateNativeYpo(0n, 100n, 50n)).toThrow(/negative/);
  });
});
