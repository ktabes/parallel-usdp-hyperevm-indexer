import { describe, expect, it } from "vitest";
import { sumIncludedSupplyOutsideChains } from "@/analytics/usdp-supply-queries";

describe("USDp supply query helpers", () => {
  it("sums non-savings deployments from one aligned component set", () => {
    expect(
      sumIncludedSupplyOutsideChains(
        [
          { chainId: 1, included: true, totalSupply: "1000" },
          { chainId: 56, included: true, totalSupply: "88" },
          { chainId: 1329, included: true, totalSupply: "99" },
          { chainId: 10, included: false, totalSupply: "500" },
        ],
        new Set([1]),
      ),
    ).toBe(187n);
  });
});
