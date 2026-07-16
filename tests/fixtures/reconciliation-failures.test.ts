import { describe, expect, it } from "vitest";

import {
  evaluateCoreReconciliations,
  evaluateHealth,
  summarizeVerification,
  type CoreReconciliationInput,
  type HealthInput,
} from "../../src/verification/evaluators";

const healthyCore: CoreReconciliationInput = {
  startUsdpSupply: 1_000n,
  endUsdpSupply: 1_075n,
  usdpMinted: 100n,
  usdpBurned: 25n,
  startSusdpSupply: 500n,
  endSusdpSupply: 560n,
  susdpMinted: 80n,
  susdpBurned: 20n,
  startActualAssets: 500n,
  endActualAssets: 569n,
  depositedAssets: 80n,
  withdrawnAssets: 20n,
  accruedAssets: 10n,
  directUnderlyingNet: -1n,
  convertedTotalSupplyAssets: 570n,
  endTotalAssets: 570n,
  holderBalanceSum: 560n,
  holderHistoryComplete: true,
  rateIntegratedYpo: 10n,
  nativeYpo: 10n,
  indexedThroughBlock: 200n,
  requestedToBlock: 200n,
};

const healthyHealth: HealthInput = {
  checkpointAgeSeconds: 15,
  checkpointMaximumAgeSeconds: 120,
  coverageGapCount: 0,
  decodeFailureCount: 0,
  duplicateLogCount: 0,
  rpcRetryCount: 0,
  rpcFailureCount: 0,
  priceAgeSeconds: 30,
  priceMaximumAgeSeconds: 300,
  implementationMatchesManifest: true,
  nativeYpo: 10n,
  holderHistoryComplete: true,
};

describe("verification corruption fixtures", () => {
  it("passes a coherent fixture", () => {
    const results = evaluateCoreReconciliations(healthyCore);
    const findings = evaluateHealth(healthyHealth);
    expect(results.every((result) => result.status === "pass")).toBe(true);
    expect(findings.every((finding) => finding.status === "pass")).toBe(true);
    expect(summarizeVerification(results, findings).status).toBe("pass");
  });

  it("fails corrupted USDp total supply with an exact variance", () => {
    const result = evaluateCoreReconciliations({
      ...healthyCore,
      endUsdpSupply: 1_076n,
    }).find((item) => item.checkName === "usdp_supply_delta_vs_mint_burn");
    expect(result).toMatchObject({ status: "fail", variance: "1" });
  });

  it("fails a missing coverage block", () => {
    const finding = evaluateHealth({
      ...healthyHealth,
      coverageGapCount: 1,
    }).find((item) => item.checkName === "block_coverage_gaps");
    expect(finding).toMatchObject({
      status: "fail",
      severity: "critical",
      diagnostics: { gapCount: 1 },
    });
  });

  it("fails a duplicate raw-log identity", () => {
    const finding = evaluateHealth({
      ...healthyHealth,
      duplicateLogCount: 2,
    }).find((item) => item.checkName === "duplicate_logs");
    expect(finding).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("reports a stale price as a deterministic non-critical failure", () => {
    const finding = evaluateHealth({
      ...healthyHealth,
      priceAgeSeconds: 301,
    }).find((item) => item.checkName === "price_freshness");
    expect(finding).toMatchObject({ status: "fail", severity: "warning" });
  });

  it("fails an altered rate integration segment", () => {
    const result = evaluateCoreReconciliations({
      ...healthyCore,
      rateIntegratedYpo: 12n,
    }).find(
      (item) => item.checkName === "ypo_event_pending_vs_rate_integration",
    );
    expect(result).toMatchObject({ status: "fail", variance: "-2" });
  });
});
