import type { Pool } from "pg";
import { verifyCoverage } from "@/indexer/status";
import { hyperevmProtocol } from "@/protocol/hyperevm";
import { calculateNativeYpo } from "@/protocol/savings-math";

export const YPO_CALCULATION_VERSION = "parallel-usdp-native-ypo-v1-candidate";
export const YPO_WINDOW_CONVENTION = "(start_block,end_block]";

interface SnapshotRow {
  id: string;
  block_number: string;
  susdp_pending_yield: string;
  snapshot_status: "candidate" | "verified" | "invalid";
  manifest_version: string;
}

export interface CalculateYieldOptions {
  pool: Pool;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  manifestVersion?: string;
  calculationVersion?: string;
}

export async function calculateYieldForRange(options: CalculateYieldOptions) {
  if (options.toBlock <= options.fromBlock)
    throw new Error("YPO end block must be greater than its start block");
  const coverage = await verifyCoverage(
    options.pool,
    options.scope,
    options.fromBlock,
    options.toBlock,
  );
  if (!coverage.complete)
    return {
      status: "unavailable" as const,
      reason: "coverage_incomplete" as const,
      coverage,
    };

  const manifestVersion =
    options.manifestVersion ?? hyperevmProtocol.manifestVersion;
  const calculationVersion =
    options.calculationVersion ?? YPO_CALCULATION_VERSION;
  const snapshots = await options.pool.query<SnapshotRow>(
    `select distinct on (block_number)
            id, block_number, susdp_pending_yield, snapshot_status,
            manifest_version
       from vault_snapshots
      where chain_id = $1 and block_number in ($2,$3)
        and manifest_version = $4
      order by block_number, created_at desc`,
    [
      hyperevmProtocol.chainId,
      options.fromBlock.toString(),
      options.toBlock.toString(),
      manifestVersion,
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
      missing: {
        start: !start,
        end: !end,
      },
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
      hyperevmProtocol.chainId,
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
  const inserted = await options.pool.query<{ id: string }>(
    `insert into yield_aggregates
      (chain_id, start_snapshot_id, end_snapshot_id, from_block, to_block,
       accrued_interest, pending_yield_at_start, pending_yield_at_end,
       native_ypo, window_convention, manifest_version, calculation_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (chain_id, from_block, to_block, manifest_version,
                  calculation_version)
     do nothing returning id`,
    [
      hyperevmProtocol.chainId,
      start.id,
      end.id,
      options.fromBlock.toString(),
      options.toBlock.toString(),
      accruedInterest.toString(),
      pendingYieldAtStart.toString(),
      pendingYieldAtEnd.toString(),
      nativeYpo.toString(),
      YPO_WINDOW_CONVENTION,
      manifestVersion,
      calculationVersion,
    ],
  );
  let yieldAggregateId = inserted.rows[0]?.id;
  if (!yieldAggregateId) {
    const existing = await options.pool.query<{ id: string }>(
      `select id from yield_aggregates
        where chain_id = $1 and from_block = $2 and to_block = $3
          and manifest_version = $4 and calculation_version = $5`,
      [
        hyperevmProtocol.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
        manifestVersion,
        calculationVersion,
      ],
    );
    yieldAggregateId = existing.rows[0]!.id;
  }
  return {
    status: "candidate" as const,
    reason: "independent_rate_reconciliation_required" as const,
    yieldAggregateId,
    coverage,
    fromBlock: options.fromBlock.toString(),
    toBlock: options.toBlock.toString(),
    accruedInterest: accruedInterest.toString(),
    pendingYieldAtStart: pendingYieldAtStart.toString(),
    pendingYieldAtEnd: pendingYieldAtEnd.toString(),
    nativeYpo: nativeYpo.toString(),
    windowConvention: YPO_WINDOW_CONVENTION,
    manifestVersion,
    calculationVersion,
  };
}
