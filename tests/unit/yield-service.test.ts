import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { calculateYieldForRange } from "@/analytics/yield";

function poolWithQuery(
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>,
) {
  return { query } as unknown as Pool;
}

describe("coverage-gated YPO service", () => {
  it("returns unavailable and writes nothing when coverage has gaps", async () => {
    let queries = 0;
    const pool = poolWithQuery(async () => {
      queries += 1;
      return { rows: [] };
    });

    await expect(
      calculateYieldForRange({
        pool,
        scope: "test",
        fromBlock: 100n,
        toBlock: 200n,
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "coverage_incomplete",
    });
    expect(queries).toBe(1);
  });

  it("requires snapshots at both exact interval boundaries", async () => {
    const pool = poolWithQuery(async (sql) => {
      if (sql.includes("from indexer_coverage"))
        return { rows: [{ from_block: "100", to_block: "200" }] };
      if (sql.includes("from vault_snapshots"))
        return {
          rows: [
            {
              id: "1",
              block_number: "100",
              susdp_pending_yield: "40",
              snapshot_status: "candidate",
              manifest_version: "hyperevm-usdp-candidate-v1",
            },
          ],
        };
      throw new Error("Unexpected query");
    });

    await expect(
      calculateYieldForRange({
        pool,
        scope: "test",
        fromBlock: 100n,
        toBlock: 200n,
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "boundary_snapshot_missing",
      missing: { start: false, end: true },
    });
  });

  it("combines accrued events with pending-yield boundary movement once", async () => {
    const pool = poolWithQuery(async (sql) => {
      if (sql.includes("from indexer_coverage"))
        return { rows: [{ from_block: "100", to_block: "200" }] };
      if (sql.includes("from vault_snapshots"))
        return {
          rows: [
            {
              id: "1",
              block_number: "100",
              susdp_pending_yield: "40",
              snapshot_status: "candidate",
              manifest_version: "hyperevm-usdp-candidate-v1",
            },
            {
              id: "2",
              block_number: "200",
              susdp_pending_yield: "65",
              snapshot_status: "candidate",
              manifest_version: "hyperevm-usdp-candidate-v1",
            },
          ],
        };
      if (sql.includes("from protocol_events"))
        return { rows: [{ value: "100" }] };
      if (sql.includes("insert into yield_aggregates"))
        return { rows: [{ id: "3" }] };
      throw new Error("Unexpected query");
    });

    await expect(
      calculateYieldForRange({
        pool,
        scope: "test",
        fromBlock: 100n,
        toBlock: 200n,
      }),
    ).resolves.toMatchObject({
      status: "candidate",
      accruedInterest: "100",
      pendingYieldAtStart: "40",
      pendingYieldAtEnd: "65",
      nativeYpo: "125",
      windowConvention: "(start_block,end_block]",
    });
  });
});
