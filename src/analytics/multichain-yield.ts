import type { Pool } from "pg";
import { verifyCoverage } from "@/indexer/status";
import type { SavingsChainAdapter } from "@/protocol/savings-chains";
import { savingsChainAdapters } from "@/protocol/savings-chains";
import { calculateNativeYpo } from "@/protocol/savings-math";

export const SAVINGS_YPO_CALCULATION_VERSION =
  "parallel-savings-native-ypo-v1-candidate";
export const GLOBAL_SAVINGS_YPO_CALCULATION_VERSION =
  "parallel-global-savings-native-ypo-v1-candidate";
export const SAVINGS_YPO_WINDOW_CONVENTION = "(start_block,end_block]";

interface SavingsSnapshotRow {
  id: string;
  block_number: string;
  block_timestamp: Date;
  susdp_pending_yield: string;
  snapshot_status: "candidate" | "verified" | "invalid";
}

export interface CalculateSavingsYieldOptions {
  pool: Pool;
  adapter: SavingsChainAdapter;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  calculationVersion?: string;
}

export async function calculateSavingsYieldForRange(
  options: CalculateSavingsYieldOptions,
) {
  if (options.toBlock <= options.fromBlock)
    throw new Error("YPO end block must be greater than its start block");
  const coverage = await verifyCoverage(
    options.pool,
    options.scope,
    options.fromBlock,
    options.toBlock,
    options.adapter.chainId,
  );
  if (!coverage.complete)
    return {
      status: "unavailable" as const,
      reason: "coverage_incomplete" as const,
      coverage,
    };

  const snapshots = await options.pool.query<SavingsSnapshotRow>(
    `select distinct on (block_number)
            id, block_number, block_timestamp, susdp_pending_yield,
            snapshot_status
       from savings_chain_snapshots
      where chain_id = $1 and block_number in ($2,$3)
        and manifest_version = $4
      order by block_number, created_at desc`,
    [
      options.adapter.chainId,
      options.fromBlock.toString(),
      options.toBlock.toString(),
      options.adapter.manifestVersion,
    ],
  );
  const byBlock = new Map(
    snapshots.rows.map((snapshot) => [snapshot.block_number, snapshot]),
  );
  const start = byBlock.get(options.fromBlock.toString());
  const end = byBlock.get(options.toBlock.toString());
  if (!start || !end)
    return {
      status: "unavailable" as const,
      reason: "boundary_snapshot_missing" as const,
      coverage,
      missing: { start: !start, end: !end },
    };
  if (start.snapshot_status === "invalid" || end.snapshot_status === "invalid")
    return {
      status: "unavailable" as const,
      reason: "boundary_snapshot_invalid" as const,
      coverage,
    };

  const accrued = await options.pool.query<{ value: string }>(
    `select coalesce(sum((payload->>'interest')::numeric),0)::text as value
       from protocol_events
      where chain_id = $1 and contract_role = 'susdp-savings'
        and event_name = 'Accrued'
        and block_number > $2 and block_number <= $3`,
    [
      options.adapter.chainId,
      options.fromBlock.toString(),
      options.toBlock.toString(),
    ],
  );
  const accruedInterest = BigInt(accrued.rows[0]?.value ?? "0");
  const pendingYieldAtStart = BigInt(start.susdp_pending_yield);
  const pendingYieldAtEnd = BigInt(end.susdp_pending_yield);
  const nativeYpo = calculateNativeYpo(
    accruedInterest,
    pendingYieldAtStart,
    pendingYieldAtEnd,
  );
  const calculationVersion =
    options.calculationVersion ?? SAVINGS_YPO_CALCULATION_VERSION;
  const inserted = await options.pool.query<{ id: string }>(
    `insert into savings_yield_aggregates
      (chain_id, start_snapshot_id, end_snapshot_id, from_block, to_block,
       window_start, window_end, accrued_interest, pending_yield_at_start,
       pending_yield_at_end, native_ypo, coverage_scope, window_convention,
       reconciliation_status, manifest_version, calculation_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'candidate',$14,$15)
     on conflict (chain_id, from_block, to_block, manifest_version,
                  calculation_version)
     do nothing returning id`,
    [
      options.adapter.chainId,
      start.id,
      end.id,
      options.fromBlock.toString(),
      options.toBlock.toString(),
      start.block_timestamp,
      end.block_timestamp,
      accruedInterest.toString(),
      pendingYieldAtStart.toString(),
      pendingYieldAtEnd.toString(),
      nativeYpo.toString(),
      options.scope,
      SAVINGS_YPO_WINDOW_CONVENTION,
      options.adapter.manifestVersion,
      calculationVersion,
    ],
  );
  let savingsYieldId = inserted.rows[0]?.id;
  if (!savingsYieldId) {
    const existing = await options.pool.query<{ id: string }>(
      `select id from savings_yield_aggregates
        where chain_id = $1 and from_block = $2 and to_block = $3
          and manifest_version = $4 and calculation_version = $5`,
      [
        options.adapter.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
        options.adapter.manifestVersion,
        calculationVersion,
      ],
    );
    savingsYieldId = existing.rows[0]!.id;
  }
  return {
    status: "candidate" as const,
    reason: "independent_rate_reconciliation_required" as const,
    savingsYieldId,
    chainId: options.adapter.chainId,
    chainSlug: options.adapter.chainSlug,
    coverage,
    fromBlock: options.fromBlock.toString(),
    toBlock: options.toBlock.toString(),
    windowStart: start.block_timestamp.toISOString(),
    windowEnd: end.block_timestamp.toISOString(),
    accruedInterest: accruedInterest.toString(),
    pendingYieldAtStart: pendingYieldAtStart.toString(),
    pendingYieldAtEnd: pendingYieldAtEnd.toString(),
    nativeYpo: nativeYpo.toString(),
    windowConvention: SAVINGS_YPO_WINDOW_CONVENTION,
    manifestVersion: options.adapter.manifestVersion,
    calculationVersion,
  };
}

interface YieldComponentInput {
  id: string;
  chainId: number;
  nativeYpo: string;
  reconciliationStatus: string;
}

export function aggregateSavingsYieldComponents(
  components: readonly YieldComponentInput[],
  expectedChainIds: readonly number[],
) {
  const componentByChain = new Map(
    components.map((component) => [component.chainId, component]),
  );
  const missingChainIds = expectedChainIds.filter(
    (chainId) => !componentByChain.has(chainId),
  );
  const unreconciledChainIds = components
    .filter((component) => component.reconciliationStatus !== "verified")
    .map((component) => component.chainId);
  const included = components.filter(
    (component) => component.reconciliationStatus === "verified",
  );
  const includedChainIds = included.map((component) => component.chainId);
  const coverageStatus =
    included.length === expectedChainIds.length
      ? ("complete" as const)
      : included.length > 0
        ? ("partial" as const)
        : ("unavailable" as const);
  const nativeYpo = included.reduce(
    (total, component) => total + BigInt(component.nativeYpo),
    0n,
  );
  return {
    coverageStatus,
    included,
    includedChainIds,
    missingChainIds,
    unreconciledChainIds,
    nativeYpo,
  };
}

export async function createGlobalSavingsYield(
  pool: Pool,
  windowStart: Date,
  windowEnd: Date,
) {
  const expectedChainIds = savingsChainAdapters.map(({ chainId }) => chainId);
  const result = await pool.query<{
    id: string;
    chain_id: number;
    native_ypo: string;
    reconciliation_status: string;
  }>(
    `select distinct on (chain_id)
            id, chain_id, native_ypo, reconciliation_status
       from savings_yield_aggregates
      where chain_id = any($1::int[])
        and window_start >= $2 - interval '5 minutes'
        and window_start <= $2 + interval '5 minutes'
        and window_end >= $3 - interval '5 minutes'
        and window_end <= $3 + interval '5 minutes'
      order by chain_id, created_at desc`,
    [expectedChainIds, windowStart, windowEnd],
  );
  const components: YieldComponentInput[] = result.rows.map((row) => ({
    id: row.id,
    chainId: row.chain_id,
    nativeYpo: row.native_ypo,
    reconciliationStatus: row.reconciliation_status,
  }));
  const aggregate = aggregateSavingsYieldComponents(
    components,
    expectedChainIds,
  );
  const database = await pool.connect();
  try {
    await database.query("begin");
    const inserted = await database.query<{ id: string }>(
      `insert into global_savings_yield_aggregates
        (window_start, window_end, expected_chain_count, included_chain_count,
         coverage_status, native_ypo, included_chain_ids, missing_chain_ids,
         unreconciled_chain_ids, calculation_version)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
       on conflict (window_start, window_end, calculation_version)
       do update set
         included_chain_count = excluded.included_chain_count,
         coverage_status = excluded.coverage_status,
         native_ypo = excluded.native_ypo,
         included_chain_ids = excluded.included_chain_ids,
         missing_chain_ids = excluded.missing_chain_ids,
         unreconciled_chain_ids = excluded.unreconciled_chain_ids,
         created_at = now()
       returning id`,
      [
        windowStart,
        windowEnd,
        expectedChainIds.length,
        aggregate.included.length,
        aggregate.coverageStatus,
        aggregate.nativeYpo.toString(),
        JSON.stringify(aggregate.includedChainIds),
        JSON.stringify(aggregate.missingChainIds),
        JSON.stringify(aggregate.unreconciledChainIds),
        GLOBAL_SAVINGS_YPO_CALCULATION_VERSION,
      ],
    );
    const globalYieldId = inserted.rows[0]!.id;
    await database.query(
      "delete from global_savings_yield_components where global_yield_id = $1",
      [globalYieldId],
    );
    for (const component of aggregate.included) {
      await database.query(
        `insert into global_savings_yield_components
          (global_yield_id, savings_yield_id, chain_id)
         values ($1,$2,$3)`,
        [globalYieldId, component.id, component.chainId],
      );
    }
    await database.query("commit");
    return {
      status: aggregate.coverageStatus,
      globalYieldId,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      expectedChainIds,
      includedChainIds: aggregate.includedChainIds,
      missingChainIds: aggregate.missingChainIds,
      unreconciledChainIds: aggregate.unreconciledChainIds,
      nativeYpo: aggregate.nativeYpo.toString(),
      calculationVersion: GLOBAL_SAVINGS_YPO_CALCULATION_VERSION,
    };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}
