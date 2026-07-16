import type { Pool } from "pg";
import type { SavingsChainAdapter } from "@/protocol/savings-chains";
import { computeUpdatedAssets } from "@/protocol/savings-math";

interface ReconciliationInput {
  actualAssetsAtStart: bigint;
  actualAssetsAtEnd: bigint;
  totalAssetsAtStart: bigint;
  totalAssetsAtEnd: bigint;
  rateAtStart: bigint;
  rateAtEnd: bigint;
  lastUpdateAtStart: bigint;
  lastUpdateAtEnd: bigint;
  blockTimestampAtStart: bigint;
  blockTimestampAtEnd: bigint;
  accruedInterest: bigint;
  nativeYpo: bigint;
}

export function reconcileConstantRateWindow(input: ReconciliationInput) {
  const stableBasis =
    input.actualAssetsAtStart === input.actualAssetsAtEnd &&
    input.rateAtStart === input.rateAtEnd &&
    input.lastUpdateAtStart === input.lastUpdateAtEnd &&
    input.accruedInterest === 0n;
  if (!stableBasis)
    return {
      status: "candidate" as const,
      reason: "segmented_rate_reconciliation_required" as const,
    };
  const startElapsed = input.blockTimestampAtStart - input.lastUpdateAtStart;
  const endElapsed = input.blockTimestampAtEnd - input.lastUpdateAtEnd;
  if (startElapsed < 0n || endElapsed < startElapsed)
    return {
      status: "invalid" as const,
      reason: "invalid_boundary_time_order" as const,
    };
  const predictedTotalAssetsAtStart = computeUpdatedAssets(
    input.actualAssetsAtStart,
    input.rateAtStart,
    startElapsed,
  );
  const predictedTotalAssetsAtEnd = computeUpdatedAssets(
    input.actualAssetsAtEnd,
    input.rateAtEnd,
    endElapsed,
  );
  const independentlyIntegratedYpo =
    predictedTotalAssetsAtEnd - predictedTotalAssetsAtStart;
  const verified =
    predictedTotalAssetsAtStart === input.totalAssetsAtStart &&
    predictedTotalAssetsAtEnd === input.totalAssetsAtEnd &&
    independentlyIntegratedYpo === input.nativeYpo;
  return {
    status: verified ? ("verified" as const) : ("invalid" as const),
    reason: verified
      ? ("constant_rate_integration_exact" as const)
      : ("rate_integration_mismatch" as const),
    predictedTotalAssetsAtStart: predictedTotalAssetsAtStart.toString(),
    predictedTotalAssetsAtEnd: predictedTotalAssetsAtEnd.toString(),
    independentlyIntegratedYpo: independentlyIntegratedYpo.toString(),
    totalAssetsStartDelta: (
      predictedTotalAssetsAtStart - input.totalAssetsAtStart
    ).toString(),
    totalAssetsEndDelta: (
      predictedTotalAssetsAtEnd - input.totalAssetsAtEnd
    ).toString(),
    ypoDelta: (independentlyIntegratedYpo - input.nativeYpo).toString(),
  };
}

interface YieldReconciliationRow {
  id: string;
  native_ypo: string;
  accrued_interest: string;
  start_total_assets: string;
  start_actual_assets: string;
  start_rate: string;
  start_last_update: string;
  start_timestamp: Date;
  end_total_assets: string;
  end_actual_assets: string;
  end_rate: string;
  end_last_update: string;
  end_timestamp: Date;
}

export async function reconcileLatestSavingsYield(
  pool: Pool,
  adapter: SavingsChainAdapter,
) {
  const result = await pool.query<YieldReconciliationRow>(
    `select sya.id, sya.native_ypo, sya.accrued_interest,
            start.susdp_total_assets as start_total_assets,
            start.susdp_actual_assets as start_actual_assets,
            start.susdp_rate as start_rate,
            start.susdp_last_update as start_last_update,
            start.block_timestamp as start_timestamp,
            finish.susdp_total_assets as end_total_assets,
            finish.susdp_actual_assets as end_actual_assets,
            finish.susdp_rate as end_rate,
            finish.susdp_last_update as end_last_update,
            finish.block_timestamp as end_timestamp
       from savings_yield_aggregates sya
       join savings_chain_snapshots start on start.id = sya.start_snapshot_id
       join savings_chain_snapshots finish on finish.id = sya.end_snapshot_id
      where sya.chain_id = $1
      order by sya.window_end desc, sya.created_at desc limit 1`,
    [adapter.chainId],
  );
  const row = result.rows[0];
  if (!row)
    return {
      status: "unavailable" as const,
      reason: "historical_interval_missing" as const,
      chainId: adapter.chainId,
      chainSlug: adapter.chainSlug,
    };
  const seconds = (date: Date) => BigInt(Math.floor(date.getTime() / 1_000));
  const reconciliation = reconcileConstantRateWindow({
    actualAssetsAtStart: BigInt(row.start_actual_assets),
    actualAssetsAtEnd: BigInt(row.end_actual_assets),
    totalAssetsAtStart: BigInt(row.start_total_assets),
    totalAssetsAtEnd: BigInt(row.end_total_assets),
    rateAtStart: BigInt(row.start_rate),
    rateAtEnd: BigInt(row.end_rate),
    lastUpdateAtStart: BigInt(row.start_last_update),
    lastUpdateAtEnd: BigInt(row.end_last_update),
    blockTimestampAtStart: seconds(row.start_timestamp),
    blockTimestampAtEnd: seconds(row.end_timestamp),
    accruedInterest: BigInt(row.accrued_interest),
    nativeYpo: BigInt(row.native_ypo),
  });
  if (reconciliation.status === "verified")
    await pool.query(
      `update savings_yield_aggregates
          set reconciliation_status = 'verified'
        where id = $1`,
      [row.id],
    );
  else if (reconciliation.status === "invalid")
    await pool.query(
      `update savings_yield_aggregates
          set reconciliation_status = 'invalid'
        where id = $1`,
      [row.id],
    );
  return {
    ...reconciliation,
    savingsYieldId: row.id,
    chainId: adapter.chainId,
    chainSlug: adapter.chainSlug,
  };
}
