import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { reuseSavingsHistoryCoverage } from "@/analytics/savings-history";
import { savingsChainAdapters } from "@/protocol/savings-chains";

describe("aligned savings history coverage reuse", () => {
  it("preserves original run provenance while clipping proven lifetime rows", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    let coverageRead = 0;
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (text.includes("select from_block, to_block")) {
          coverageRead += 1;
          return {
            rows:
              coverageRead === 1
                ? [
                    { from_block: "1", to_block: "50" },
                    { from_block: "51", to_block: "100" },
                  ]
                : [{ from_block: "20", to_block: "80" }],
          };
        }
        return { rows: [], rowCount: 2 };
      },
    } as unknown as Pool;
    const adapter = savingsChainAdapters.find(
      (candidate) => candidate.chainId === 8453,
    )!;
    const result = await reuseSavingsHistoryCoverage({
      pool,
      adapter,
      sourceScope: "parallel-assets-base-lifetime-v1",
      targetScope: "parallel-savings-base-window-v1",
      fromBlock: 20n,
      toBlock: 80n,
    });

    expect(result.status).toBe("complete");
    const reuse = queries.find((query) =>
      query.text.includes("insert into indexer_coverage"),
    )!;
    expect(reuse.text).toContain("run_id, scanned_at");
    expect(reuse.text).toContain("greatest(from_block");
    expect(reuse.text).toContain("least(to_block");
    expect(reuse.values).toEqual([
      8453,
      "parallel-assets-base-lifetime-v1",
      "parallel-savings-base-window-v1",
      "20",
      "80",
    ]);
  });

  it("refuses to reuse a source scope with a gap", async () => {
    const adapter = savingsChainAdapters.find(
      (candidate) => candidate.chainId === 8453,
    )!;
    const pool = {
      query: async () => ({ rows: [{ from_block: "20", to_block: "49" }] }),
    } as unknown as Pool;
    await expect(
      reuseSavingsHistoryCoverage({
        pool,
        adapter,
        sourceScope: "source",
        targetScope: "target",
        fromBlock: 20n,
        toBlock: 80n,
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "source_coverage_incomplete",
    });
  });
});
