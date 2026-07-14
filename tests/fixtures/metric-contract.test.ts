import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface MetricContract {
  status: string;
  metrics: Array<{ id: string; unit: string; source: string; formula: string }>;
  nonApplicableMetrics: string[];
}

describe("executable metric contract", () => {
  it("defines unique metrics with source, unit, and formula", async () => {
    const contract = JSON.parse(
      await readFile("config/metric-contract.v1.json", "utf8"),
    ) as MetricContract;
    const ids = contract.metrics.map((metric) => metric.id);

    expect(contract.status).toBe("candidate");
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      contract.metrics.every(
        (metric) => metric.unit && metric.source && metric.formula,
      ),
    ).toBe(true);
  });

  it("does not model native savings activity as lending", async () => {
    const contract = JSON.parse(
      await readFile("config/metric-contract.v1.json", "utf8"),
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
