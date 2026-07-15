import type { Pool } from "pg";
import { savingsChainAdapters } from "@/protocol/savings-chains";

interface ChainYieldRow {
  id: string;
  chain_id: number;
  from_block: string;
  to_block: string;
  window_start: Date;
  window_end: Date;
  accrued_interest: string;
  pending_yield_at_start: string;
  pending_yield_at_end: string;
  native_ypo: string;
  coverage_scope: string;
  window_convention: string;
  reconciliation_status: string;
  manifest_version: string;
  calculation_version: string;
}

interface GlobalYieldRow {
  id: string;
  window_start: Date;
  window_end: Date;
  expected_chain_count: number;
  included_chain_count: number;
  coverage_status: string;
  native_ypo: string;
  included_chain_ids: number[];
  missing_chain_ids: number[];
  unreconciled_chain_ids: number[];
  calculation_version: string;
}

export async function readLatestSavingsHistory(pool: Pool) {
  const [chains, global] = await Promise.all([
    pool.query<ChainYieldRow>(
      `select distinct on (chain_id) *
         from savings_yield_aggregates
        order by chain_id, window_end desc, created_at desc`,
    ),
    pool.query<GlobalYieldRow>(
      `select * from global_savings_yield_aggregates
        order by window_end desc, created_at desc limit 1`,
    ),
  ]);
  if (chains.rows.length === 0)
    return {
      status: "unavailable" as const,
      reason: "historical_intervals_missing" as const,
      expectedChainIds: savingsChainAdapters.map(({ chainId }) => chainId),
      chains: [],
      global: null,
    };
  const globalRow = global.rows[0];
  return {
    status: globalRow?.coverage_status ?? ("partial" as const),
    chains: chains.rows.map((row) => ({
      savingsYieldId: row.id,
      chainId: row.chain_id,
      chainSlug:
        savingsChainAdapters.find((adapter) => adapter.chainId === row.chain_id)
          ?.chainSlug ?? "unknown",
      fromBlock: row.from_block,
      toBlock: row.to_block,
      windowStart: row.window_start.toISOString(),
      windowEnd: row.window_end.toISOString(),
      accruedInterest: row.accrued_interest,
      pendingYieldAtStart: row.pending_yield_at_start,
      pendingYieldAtEnd: row.pending_yield_at_end,
      nativeYpo: row.native_ypo,
      coverageScope: row.coverage_scope,
      windowConvention: row.window_convention,
      reconciliationStatus: row.reconciliation_status,
      manifestVersion: row.manifest_version,
      calculationVersion: row.calculation_version,
    })),
    global: globalRow
      ? {
          globalYieldId: globalRow.id,
          windowStart: globalRow.window_start.toISOString(),
          windowEnd: globalRow.window_end.toISOString(),
          expectedChainCount: globalRow.expected_chain_count,
          includedChainCount: globalRow.included_chain_count,
          coverageStatus: globalRow.coverage_status,
          nativeYpo: globalRow.native_ypo,
          includedChainIds: globalRow.included_chain_ids,
          missingChainIds: globalRow.missing_chain_ids,
          unreconciledChainIds: globalRow.unreconciled_chain_ids,
          calculationVersion: globalRow.calculation_version,
        }
      : null,
  };
}
