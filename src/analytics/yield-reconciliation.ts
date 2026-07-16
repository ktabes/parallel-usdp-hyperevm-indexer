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

export type SavingsRateSegmentEvent =
  | {
      timestamp: bigint;
      logIndex: number;
      eventName: "Accrued";
      interest: bigint;
    }
  | {
      timestamp: bigint;
      logIndex: number;
      eventName: "Deposit";
      assets: bigint;
    }
  | {
      timestamp: bigint;
      logIndex: number;
      eventName: "Withdraw";
      assets: bigint;
    }
  | {
      timestamp: bigint;
      logIndex: number;
      eventName: "RateUpdated";
      newRate: bigint;
    };

export function integrateSegmentedRateWindow(input: {
  actualAssetsAtStart: bigint;
  totalAssetsAtStart: bigint;
  rateAtStart: bigint;
  lastUpdateAtStart: bigint;
  blockTimestampAtStart: bigint;
  blockTimestampAtEnd: bigint;
  events: readonly SavingsRateSegmentEvent[];
}) {
  if (
    input.blockTimestampAtEnd < input.blockTimestampAtStart ||
    input.lastUpdateAtStart > input.blockTimestampAtStart
  )
    throw new Error("Invalid segmented-rate boundary ordering");
  let actualAssets = input.actualAssetsAtStart;
  let rate = input.rateAtStart;
  let lastUpdate = input.lastUpdateAtStart;
  let integratedYpo = -(input.totalAssetsAtStart - actualAssets);
  let predictedAccruedInterest = 0n;
  let emittedAccruedInterest = 0n;
  const events = [...input.events].sort(
    (left, right) =>
      Number(left.timestamp - right.timestamp) ||
      left.logIndex - right.logIndex,
  );

  for (const event of events) {
    if (
      event.timestamp < input.blockTimestampAtStart ||
      event.timestamp > input.blockTimestampAtEnd ||
      event.timestamp < lastUpdate
    )
      throw new Error("Segmented-rate event is outside ordered boundaries");
    if (event.eventName === "Accrued") {
      const predictedAssets = computeUpdatedAssets(
        actualAssets,
        rate,
        event.timestamp - lastUpdate,
      );
      const predictedInterest = predictedAssets - actualAssets;
      predictedAccruedInterest += predictedInterest;
      emittedAccruedInterest += event.interest;
      integratedYpo += predictedInterest;
      actualAssets += event.interest;
      lastUpdate = event.timestamp;
    } else if (event.eventName === "Deposit") {
      actualAssets += event.assets;
    } else if (event.eventName === "Withdraw") {
      if (event.assets > actualAssets)
        throw new Error("Segmented-rate withdrawal exceeds actual assets");
      actualAssets -= event.assets;
    } else {
      rate = event.newRate;
    }
  }

  const predictedTotalAssetsAtEnd = computeUpdatedAssets(
    actualAssets,
    rate,
    input.blockTimestampAtEnd - lastUpdate,
  );
  const predictedPendingYieldAtEnd = predictedTotalAssetsAtEnd - actualAssets;
  integratedYpo += predictedPendingYieldAtEnd;
  return {
    integratedYpo,
    predictedAccruedInterest,
    emittedAccruedInterest,
    accruedVariance: emittedAccruedInterest - predictedAccruedInterest,
    predictedPendingYieldAtEnd,
    predictedTotalAssetsAtEnd,
    actualAssetsAtEnd: actualAssets,
    rateAtEnd: rate,
    lastUpdateAtEnd: lastUpdate,
  };
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
  from_block: string;
  to_block: string;
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

export async function reconcileSavingsYield(
  pool: Pool,
  adapter: SavingsChainAdapter,
  savingsYieldId?: string,
) {
  const result = await pool.query<YieldReconciliationRow>(
    `select sya.id, sya.from_block, sya.to_block,
            sya.native_ypo, sya.accrued_interest,
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
        and ($2::bigint is null or sya.id = $2::bigint)
      order by sya.window_end desc, sya.created_at desc limit 1`,
    [adapter.chainId, savingsYieldId ?? null],
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
  let resolvedReconciliation:
    | typeof reconciliation
    | {
        status: "verified" | "invalid";
        reason:
          | "segmented_rate_integration_exact"
          | "event_pending_and_rate_state_exact"
          | "rate_state_integration_mismatch";
        independentlyIntegratedYpo: string;
        ypoDelta: string;
        predictedTotalAssetsAtEnd: string;
        totalAssetsEndDelta: string;
        predictedActualAssetsAtEnd: string;
        actualAssetsEndDelta: string;
        predictedRateAtEnd: string;
        rateEndDelta: string;
        predictedLastUpdateAtEnd: string;
        lastUpdateEndDelta: string;
        accruedVariance: string;
      } = reconciliation;
  if (reconciliation.status === "candidate") {
    const events = await pool.query<{
      block_timestamp: Date;
      log_index: number;
      event_name: "Accrued" | "Deposit" | "Withdraw" | "RateUpdated";
      payload: Record<string, string>;
    }>(
      `select block.timestamp as block_timestamp, event.log_index,
              event.event_name, event.payload
         from protocol_events event
         join blocks block on block.chain_id = event.chain_id
                          and block.number = event.block_number
        where event.chain_id = $1
          and event.block_number > $2 and event.block_number <= $3
          and event.contract_role = 'susdp-savings'
          and event.event_name in ('Accrued','Deposit','Withdraw','RateUpdated')
        order by event.block_number, event.log_index`,
      [adapter.chainId, row.from_block, row.to_block],
    );
    const segmentedEvents = events.rows.map(
      (event): SavingsRateSegmentEvent => {
        const common = {
          timestamp: BigInt(
            Math.floor(event.block_timestamp.getTime() / 1_000),
          ),
          logIndex: event.log_index,
        };
        if (event.event_name === "Accrued")
          return {
            ...common,
            eventName: "Accrued",
            interest: BigInt(event.payload.interest ?? "0"),
          };
        if (event.event_name === "Deposit")
          return {
            ...common,
            eventName: "Deposit",
            assets: BigInt(event.payload.assets ?? "0"),
          };
        if (event.event_name === "Withdraw")
          return {
            ...common,
            eventName: "Withdraw",
            assets: BigInt(event.payload.assets ?? "0"),
          };
        return {
          ...common,
          eventName: "RateUpdated",
          newRate: BigInt(event.payload.newRate ?? "0"),
        };
      },
    );
    const integrated = integrateSegmentedRateWindow({
      actualAssetsAtStart: BigInt(row.start_actual_assets),
      totalAssetsAtStart: BigInt(row.start_total_assets),
      rateAtStart: BigInt(row.start_rate),
      lastUpdateAtStart: BigInt(row.start_last_update),
      blockTimestampAtStart: seconds(row.start_timestamp),
      blockTimestampAtEnd: seconds(row.end_timestamp),
      events: segmentedEvents,
    });
    const nativeYpo = BigInt(row.native_ypo);
    const stateExact =
      integrated.predictedTotalAssetsAtEnd === BigInt(row.end_total_assets) &&
      integrated.actualAssetsAtEnd === BigInt(row.end_actual_assets) &&
      integrated.rateAtEnd === BigInt(row.end_rate) &&
      integrated.emittedAccruedInterest === BigInt(row.accrued_interest);
    const ypoExact = integrated.integratedYpo === nativeYpo;
    resolvedReconciliation = {
      status: stateExact ? "verified" : "invalid",
      reason: stateExact
        ? ypoExact
          ? "segmented_rate_integration_exact"
          : "event_pending_and_rate_state_exact"
        : "rate_state_integration_mismatch",
      independentlyIntegratedYpo: integrated.integratedYpo.toString(),
      ypoDelta: (integrated.integratedYpo - nativeYpo).toString(),
      predictedTotalAssetsAtEnd:
        integrated.predictedTotalAssetsAtEnd.toString(),
      totalAssetsEndDelta: (
        integrated.predictedTotalAssetsAtEnd - BigInt(row.end_total_assets)
      ).toString(),
      predictedActualAssetsAtEnd: integrated.actualAssetsAtEnd.toString(),
      actualAssetsEndDelta: (
        integrated.actualAssetsAtEnd - BigInt(row.end_actual_assets)
      ).toString(),
      predictedRateAtEnd: integrated.rateAtEnd.toString(),
      rateEndDelta: (integrated.rateAtEnd - BigInt(row.end_rate)).toString(),
      predictedLastUpdateAtEnd: integrated.lastUpdateAtEnd.toString(),
      lastUpdateEndDelta: (
        integrated.lastUpdateAtEnd - BigInt(row.end_last_update)
      ).toString(),
      accruedVariance: (
        integrated.emittedAccruedInterest - BigInt(row.accrued_interest)
      ).toString(),
    };
  }
  if (resolvedReconciliation.status === "verified")
    await pool.query(
      `update savings_yield_aggregates
          set reconciliation_status = 'verified'
        where id = $1`,
      [row.id],
    );
  else if (resolvedReconciliation.status === "invalid")
    await pool.query(
      `update savings_yield_aggregates
          set reconciliation_status = 'invalid'
        where id = $1`,
      [row.id],
    );
  return {
    ...resolvedReconciliation,
    savingsYieldId: row.id,
    chainId: adapter.chainId,
    chainSlug: adapter.chainSlug,
  };
}

export async function reconcileLatestSavingsYield(
  pool: Pool,
  adapter: SavingsChainAdapter,
) {
  return reconcileSavingsYield(pool, adapter);
}
