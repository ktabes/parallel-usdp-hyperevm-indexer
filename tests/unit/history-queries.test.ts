import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { readLatestSavingsHistory } from "@/analytics/history-queries";

const windowStart = new Date("2026-07-09T03:00:00.000Z");
const windowEnd = new Date("2026-07-16T03:00:00.000Z");

function chainRow() {
  return {
    id: "7",
    chain_id: 1,
    from_block: "100",
    to_block: "200",
    window_start: windowStart,
    window_end: windowEnd,
    accrued_interest: "10",
    pending_yield_at_start: "2",
    pending_yield_at_end: "4",
    native_ypo: "12",
    coverage_scope: "seven-day-scope",
    window_convention: "(start_block,end_block]",
    reconciliation_status: "verified",
    manifest_version: "test-manifest",
    calculation_version: "test-calculation",
  };
}

describe("readLatestSavingsHistory", () => {
  it("binds chain components to the exact latest global seven-day window", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            window_start: windowStart,
            window_end: windowEnd,
            expected_chain_count: 5,
            included_chain_count: 5,
            coverage_status: "complete",
            native_ypo: "12",
            included_chain_ids: [1],
            missing_chain_ids: [],
            unreconciled_chain_ids: [],
            calculation_version: "global-test",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [chainRow()] });
    const result = await readLatestSavingsHistory({
      query,
    } as unknown as Pool);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("where coverage_scope like $1");
    expect(query.mock.calls[1]?.[1]).toEqual(["%-1783566000-1784170800-v1"]);
    expect(result.chains[0]?.nativeYpo).toBe("12");
  });

  it("falls back only to exact seven-day rows when no global row exists", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [chainRow()] });
    await readLatestSavingsHistory({ query } as unknown as Pool);
    expect(query.mock.calls[1]?.[0]).toContain(
      "between interval '6 days 23 hours'",
    );
  });
});
