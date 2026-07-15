import type { Pool } from "pg";
import { HYPEREVM_CHAIN_ID } from "@/protocol/hyperevm";
import { providerErrorMessage } from "@/rpc/errors";
import { coverageGaps, type BlockRange } from "./planner";

export async function verifyCoverage(
  pool: Pool,
  scope: string,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<{ from_block: string; to_block: string }>(
    `select from_block, to_block from indexer_coverage
     where chain_id = $1 and scope = $2
       and to_block >= $3 and from_block <= $4
     order by from_block`,
    [HYPEREVM_CHAIN_ID, scope, fromBlock.toString(), toBlock.toString()],
  );
  const ranges: BlockRange[] = result.rows.map((row) => ({
    fromBlock: BigInt(row.from_block),
    toBlock: BigInt(row.to_block),
  }));
  const gaps = coverageGaps(ranges, fromBlock, toBlock);
  return {
    scope,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    complete: gaps.length === 0,
    rangeRows: ranges.length,
    gaps: gaps.map((gap) => ({
      fromBlock: gap.fromBlock.toString(),
      toBlock: gap.toBlock.toString(),
    })),
  };
}

export async function indexerStatus(pool: Pool, scope: string) {
  const [checkpoint, totals, runs] = await Promise.all([
    pool.query(
      `select next_block, last_completed_block, last_completed_block_hash, updated_at
       from indexer_checkpoints where chain_id = $1 and scope = $2`,
      [HYPEREVM_CHAIN_ID, scope],
    ),
    pool.query(
      `select
         (select count(*) from raw_logs where chain_id = $1) as raw_logs,
         (select count(*) from protocol_events where chain_id = $1) as protocol_events,
         (select count(*) from indexer_coverage where chain_id = $1 and scope = $2) as coverage_ranges`,
      [HYPEREVM_CHAIN_ID, scope],
    ),
    pool.query(
      `select id, run_type, from_block, to_block, status, counters, failure,
              started_at, finished_at
       from indexer_runs where chain_id = $1
       order by started_at desc limit 5`,
      [HYPEREVM_CHAIN_ID],
    ),
  ]);
  return {
    scope,
    checkpoint: checkpoint.rows[0] ?? null,
    totals: totals.rows[0] ?? null,
    recentRuns: runs.rows.map((run) => {
      const failure = run.failure as { message?: unknown } | null;
      return {
        ...run,
        failure:
          failure && "message" in failure
            ? { ...failure, message: providerErrorMessage(failure.message) }
            : failure,
      };
    }),
  };
}
