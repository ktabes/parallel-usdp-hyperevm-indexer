import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface MetricContract {
  schemaVersion: number;
  status: string;
  assetScope: string;
  metrics: Array<{
    id: string;
    scope: string;
    unit: string;
    source: string;
    formula: string;
  }>;
  nonApplicableMetrics: string[];
}

const metricContractPath = "config/metric-contract.v2.json";

describe("executable metric contract", () => {
  it("defines unique metrics with source, unit, and formula", async () => {
    const contract = JSON.parse(
      await readFile(metricContractPath, "utf8"),
    ) as MetricContract;
    const ids = contract.metrics.map((metric) => metric.id);

    expect(contract.status).toBe("candidate");
    expect(contract.schemaVersion).toBe(2);
    expect(contract.assetScope).toBe("cross-chain");
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      contract.metrics.every(
        (metric) =>
          metric.scope && metric.unit && metric.source && metric.formula,
      ),
    ).toBe(true);
  });

  it("defines distinct chain and global asset metrics", async () => {
    const contract = JSON.parse(
      await readFile(metricContractPath, "utf8"),
    ) as MetricContract;
    const metrics = new Map(
      contract.metrics.map((metric) => [metric.id, metric]),
    );

    expect(metrics.get("usdp_chain_total_supply")?.scope).toBe("chain");
    expect(metrics.get("usdp_global_total_supply")?.scope).toBe("global");
    expect(metrics.get("susdp_global_tvl_usd")?.scope).toBe("global");
    expect(metrics.get("susdp_global_tvl_weighted_apy")?.formula).toContain(
      "chain_tvl_usd * chain_apy",
    );
  });

  it("does not model native savings activity as lending", async () => {
    const contract = JSON.parse(
      await readFile(metricContractPath, "utf8"),
    ) as MetricContract;

    expect(contract.nonApplicableMetrics).toEqual(
      expect.arrayContaining([
        "native_borrowers",
        "native_borrows",
        "native_repays",
        "native_liquidations",
      ]),
    );
  });
});
