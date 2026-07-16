import type { Pool } from "pg";

import { verifyCoverage } from "@/indexer/status";
import { protocolEventTopics, savingsAbi } from "@/protocol/abis";
import type { SavingsChainAdapter } from "@/protocol/savings-chains";
import { createEvmClient } from "@/rpc/evm-client";
import {
  integrateSegmentedRateWindow,
  type SavingsRateSegmentEvent,
} from "@/analytics/yield-reconciliation";
import {
  evaluateCoreReconciliations,
  evaluateHealth,
  summarizeVerification,
} from "./evaluators";

export const VERIFICATION_CALCULATION_VERSION =
  "parallel-reconciliation-health-v1";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_IMPLEMENTATION = ZERO_ADDRESS;

interface BoundarySnapshotRow {
  block_number: string;
  block_hash: string;
  block_timestamp: Date;
  usdp_total_supply: string;
  susdp_total_supply: string;
  susdp_total_assets: string;
  susdp_actual_assets: string;
  susdp_rate: string;
  susdp_last_update: string;
  usdp_implementation: string;
  susdp_implementation: string;
}

interface EventTotalsRow {
  usdp_minted: string;
  usdp_burned: string;
  susdp_minted: string;
  susdp_burned: string;
  deposited_assets: string;
  withdrawn_assets: string;
  accrued_assets: string;
}

interface YieldRow {
  native_ypo: string;
  reconciliation_status: string;
}

interface RateEventRow {
  block_timestamp: Date;
  log_index: number;
  event_name: "Accrued" | "Deposit" | "Withdraw" | "RateUpdated";
  payload: Record<string, string>;
}

function optionalBigint(value: string | null | undefined) {
  return value === null || value === undefined ? undefined : BigInt(value);
}

function secondsBetween(now: Date, then: Date | undefined) {
  return then === undefined
    ? undefined
    : Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1_000));
}

async function readBoundarySnapshots(
  pool: Pool,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<BoundarySnapshotRow>(
    `select distinct on (scs.block_number)
            scs.block_number, scs.block_hash, scs.block_timestamp,
            usdp.total_supply as usdp_total_supply,
            susdp.total_supply as susdp_total_supply,
            scs.susdp_total_assets, scs.susdp_actual_assets,
            scs.susdp_rate, scs.susdp_last_update,
            scs.usdp_implementation, scs.susdp_implementation
       from savings_chain_snapshots scs
       join asset_chain_snapshots usdp on usdp.id = scs.usdp_snapshot_id
       join asset_chain_snapshots susdp on susdp.id = scs.susdp_snapshot_id
      where scs.chain_id = $1 and scs.block_number in ($2,$3)
      order by scs.block_number, scs.created_at desc`,
    [chainId, fromBlock.toString(), toBlock.toString()],
  );
  const rows = new Map(result.rows.map((row) => [row.block_number, row]));
  return {
    start: rows.get(fromBlock.toString()),
    end: rows.get(toBlock.toString()),
  };
}

async function readRateEvents(
  pool: Pool,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<RateEventRow>(
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
    [chainId, fromBlock.toString(), toBlock.toString()],
  );
  return result.rows.map((row): SavingsRateSegmentEvent => {
    const common = {
      timestamp: BigInt(Math.floor(row.block_timestamp.getTime() / 1_000)),
      logIndex: row.log_index,
    };
    if (row.event_name === "Accrued")
      return {
        ...common,
        eventName: "Accrued",
        interest: BigInt(row.payload.interest ?? "0"),
      };
    if (row.event_name === "Deposit")
      return {
        ...common,
        eventName: "Deposit",
        assets: BigInt(row.payload.assets ?? "0"),
      };
    if (row.event_name === "Withdraw")
      return {
        ...common,
        eventName: "Withdraw",
        assets: BigInt(row.payload.assets ?? "0"),
      };
    return {
      ...common,
      eventName: "RateUpdated",
      newRate: BigInt(row.payload.newRate ?? "0"),
    };
  });
}

async function readEventTotals(
  pool: Pool,
  adapter: SavingsChainAdapter,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<EventTotalsRow>(
    `select
       coalesce(sum(case when contract_role = 'usdp-token'
                          and event_name = 'Transfer'
                          and lower(payload->>'from') = $4
                         then (payload->>'value')::numeric else 0 end),0)::text as usdp_minted,
       coalesce(sum(case when contract_role = 'usdp-token'
                          and event_name = 'Transfer'
                          and lower(payload->>'to') = $4
                         then (payload->>'value')::numeric else 0 end),0)::text as usdp_burned,
       coalesce(sum(case when contract_role = 'susdp-savings'
                          and event_name = 'Transfer'
                          and lower(payload->>'from') = $4
                         then (payload->>'value')::numeric else 0 end),0)::text as susdp_minted,
       coalesce(sum(case when contract_role = 'susdp-savings'
                          and event_name = 'Transfer'
                          and lower(payload->>'to') = $4
                         then (payload->>'value')::numeric else 0 end),0)::text as susdp_burned,
       coalesce(sum(case when contract_role = 'susdp-savings'
                          and event_name = 'Deposit'
                         then (payload->>'assets')::numeric else 0 end),0)::text as deposited_assets,
       coalesce(sum(case when contract_role = 'susdp-savings'
                          and event_name = 'Withdraw'
                         then (payload->>'assets')::numeric else 0 end),0)::text as withdrawn_assets,
       coalesce(sum(case when contract_role = 'susdp-savings'
                          and event_name = 'Accrued'
                         then (payload->>'interest')::numeric else 0 end),0)::text as accrued_assets
       from protocol_events
      where chain_id = $1 and block_number > $2 and block_number <= $3`,
    [adapter.chainId, fromBlock.toString(), toBlock.toString(), ZERO_ADDRESS],
  );
  return result.rows[0];
}

async function readDirectUnderlyingNet(
  pool: Pool,
  adapter: SavingsChainAdapter,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<{ value: string }>(
    `select coalesce(sum(
       case when lower(event.payload->>'to') = $4 then (event.payload->>'value')::numeric
            when lower(event.payload->>'from') = $4 then -(event.payload->>'value')::numeric
            else 0 end),0)::text as value
       from protocol_events event
      where event.chain_id = $1
        and event.block_number > $2 and event.block_number <= $3
        and event.contract_role = 'usdp-token' and event.event_name = 'Transfer'
        and (lower(event.payload->>'to') = $4 or lower(event.payload->>'from') = $4)
        and not exists (
          select 1 from protocol_events vault
           where vault.chain_id = event.chain_id
             and vault.transaction_hash = event.transaction_hash
             and vault.contract_role = 'susdp-savings'
             and vault.event_name in ('Deposit','Withdraw','Accrued')
        )`,
    [
      adapter.chainId,
      fromBlock.toString(),
      toBlock.toString(),
      adapter.susdp.address.toLowerCase(),
    ],
  );
  return BigInt(result.rows[0]?.value ?? "0");
}

async function readDecodeFailures(
  pool: Pool,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const topics = Object.values(protocolEventTopics).map((topic) =>
    topic.toLowerCase(),
  );
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from raw_logs raw
       left join protocol_events event on event.raw_log_id = raw.id
      where raw.chain_id = $1 and raw.block_number > $2 and raw.block_number <= $3
        and lower(raw.topics->>0) = any($4::text[])
        and event.id is null`,
    [chainId, fromBlock.toString(), toBlock.toString(), topics],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function readDuplicateLogs(
  pool: Pool,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from (
       select transaction_hash, log_index
         from raw_logs
        where chain_id = $1 and block_number > $2 and block_number <= $3
        group by transaction_hash, log_index having count(*) > 1
     ) duplicates`,
    [chainId, fromBlock.toString(), toBlock.toString()],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function persistVerification(input: {
  pool: Pool;
  adapter: SavingsChainAdapter;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  observedAt: Date;
  results: ReturnType<typeof evaluateCoreReconciliations>;
  findings: ReturnType<typeof evaluateHealth>;
}) {
  const summary = summarizeVerification(input.results, input.findings);
  const database = await input.pool.connect();
  try {
    await database.query("begin");
    const run = await database.query<{ id: string }>(
      `insert into reconciliation_runs
        (chain_id, scope, from_block, to_block, manifest_version,
         calculation_version, status, summary, finished_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) returning id`,
      [
        input.adapter.chainId,
        input.scope,
        input.fromBlock.toString(),
        input.toBlock.toString(),
        input.adapter.manifestVersion,
        VERIFICATION_CALCULATION_VERSION,
        summary.status,
        JSON.stringify(summary),
      ],
    );
    const runId = run.rows[0]!.id;
    for (const result of input.results)
      await database.query(
        `insert into reconciliation_results
          (run_id, check_name, status, expected_value, actual_value, variance,
           tolerance, block_number, observed_at, diagnostics)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          runId,
          result.checkName,
          result.status,
          result.expectedValue,
          result.actualValue,
          result.variance,
          result.tolerance,
          input.toBlock.toString(),
          input.observedAt,
          JSON.stringify(result.diagnostics),
        ],
      );
    for (const finding of input.findings)
      await database.query(
        `insert into health_findings
          (run_id, chain_id, scope, check_name, severity, status, message,
           block_number, observed_at, diagnostics)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          runId,
          input.adapter.chainId,
          input.scope,
          finding.checkName,
          finding.severity,
          finding.status,
          finding.message,
          input.toBlock.toString(),
          input.observedAt,
          JSON.stringify(finding.diagnostics),
        ],
      );
    await database.query("commit");
    return { runId, summary };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

export interface RunVerificationSuiteOptions {
  pool: Pool;
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  checkpointMaximumAgeSeconds?: number;
  priceMaximumAgeSeconds?: number;
  now?: Date;
}

export async function runVerificationSuite(
  options: RunVerificationSuiteOptions,
) {
  const now = options.now ?? new Date();
  const [
    boundaries,
    eventTotals,
    directUnderlyingNet,
    coverage,
    lifetimeCoverage,
    checkpoint,
    decodeFailureCount,
    duplicateLogCount,
    rpcState,
    latestPrice,
    yieldResult,
    rateEvents,
  ] = await Promise.all([
    readBoundarySnapshots(
      options.pool,
      options.adapter.chainId,
      options.fromBlock,
      options.toBlock,
    ),
    readEventTotals(
      options.pool,
      options.adapter,
      options.fromBlock,
      options.toBlock,
    ),
    readDirectUnderlyingNet(
      options.pool,
      options.adapter,
      options.fromBlock,
      options.toBlock,
    ),
    verifyCoverage(
      options.pool,
      options.scope,
      options.fromBlock,
      options.toBlock,
      options.adapter.chainId,
    ),
    verifyCoverage(
      options.pool,
      `parallel-assets-${options.adapter.chainSlug}-lifetime-v1`,
      options.fromBlock,
      options.toBlock,
      options.adapter.chainId,
    ),
    options.pool.query<{
      next_block: string;
      last_completed_block: string | null;
      updated_at: Date;
    }>(
      `select next_block, last_completed_block, updated_at
         from indexer_checkpoints where chain_id = $1 and scope = $2`,
      [options.adapter.chainId, options.scope],
    ),
    readDecodeFailures(
      options.pool,
      options.adapter.chainId,
      options.fromBlock,
      options.toBlock,
    ),
    readDuplicateLogs(
      options.pool,
      options.adapter.chainId,
      options.fromBlock,
      options.toBlock,
    ),
    options.pool.query<{
      retries: string;
      failures: string;
    }>(
      `select
         coalesce(sum(coalesce((counters->>'rpcRetries')::int,0)),0)::text as retries,
         count(*) filter (where status = 'failed')::text as failures
       from indexer_runs
      where chain_id = $1 and to_block >= $2 and from_block <= $3`,
      [
        options.adapter.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
      ],
    ),
    options.pool.query<{ observed_at: Date }>(
      `select observed_at from price_observations
        where chain_id = $1 order by observed_at desc limit 1`,
      [options.adapter.chainId],
    ),
    options.pool.query<YieldRow>(
      `select native_ypo, reconciliation_status
         from savings_yield_aggregates
        where chain_id = $1 and from_block = $2 and to_block = $3
        order by created_at desc limit 1`,
      [
        options.adapter.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
      ],
    ),
    readRateEvents(
      options.pool,
      options.adapter.chainId,
      options.fromBlock,
      options.toBlock,
    ),
  ]);

  const start = boundaries.start;
  const end = boundaries.end;
  const totals = eventTotals;
  const checkpointRow = checkpoint.rows[0];
  const indexedThroughBlock = optionalBigint(
    checkpointRow?.last_completed_block,
  );
  const complete =
    indexedThroughBlock !== undefined &&
    indexedThroughBlock >= options.toBlock &&
    coverage.complete;
  const nativeYpo = optionalBigint(yieldResult.rows[0]?.native_ypo);
  let convertedTotalSupplyAssets: bigint | undefined;
  if (end) {
    try {
      const client = createEvmClient(options.adapter.chain, options.rpcUrl, {
        retryCount: 1,
      });
      const [block, rpcTotalSupply, rpcTotalAssets, rpcConvertedAssets] =
        await Promise.all([
          client.getBlock({ blockNumber: options.toBlock }),
          client.readContract({
            address: options.adapter.susdp.address,
            abi: savingsAbi,
            functionName: "totalSupply",
            blockNumber: options.toBlock,
          } as never) as Promise<bigint>,
          client.readContract({
            address: options.adapter.susdp.address,
            abi: savingsAbi,
            functionName: "totalAssets",
            blockNumber: options.toBlock,
          } as never) as Promise<bigint>,
          client.readContract({
            address: options.adapter.susdp.address,
            abi: savingsAbi,
            functionName: "convertToAssets",
            args: [BigInt(end.susdp_total_supply)],
            blockNumber: options.toBlock,
          } as never) as Promise<bigint>,
        ]);
      const historicalStateMatchesSnapshot =
        block.hash?.toLowerCase() === end.block_hash.toLowerCase() &&
        rpcTotalSupply === BigInt(end.susdp_total_supply) &&
        rpcTotalAssets === BigInt(end.susdp_total_assets);
      convertedTotalSupplyAssets = historicalStateMatchesSnapshot
        ? rpcConvertedAssets
        : undefined;
    } catch {
      convertedTotalSupplyAssets = undefined;
    }
  }
  const implementationsPresent =
    start !== undefined &&
    end !== undefined &&
    start.usdp_implementation !== ZERO_IMPLEMENTATION &&
    start.susdp_implementation !== ZERO_IMPLEMENTATION &&
    end.usdp_implementation !== ZERO_IMPLEMENTATION &&
    end.susdp_implementation !== ZERO_IMPLEMENTATION;
  const implementationMatchesManifest = implementationsPresent
    ? start!.usdp_implementation === end!.usdp_implementation &&
      start!.susdp_implementation === end!.susdp_implementation
    : undefined;
  let rateIntegratedYpo: bigint | undefined;
  if (start && end) {
    try {
      rateIntegratedYpo = integrateSegmentedRateWindow({
        actualAssetsAtStart: BigInt(start.susdp_actual_assets),
        totalAssetsAtStart: BigInt(start.susdp_total_assets),
        rateAtStart: BigInt(start.susdp_rate),
        lastUpdateAtStart: BigInt(start.susdp_last_update),
        blockTimestampAtStart: BigInt(
          Math.floor(start.block_timestamp.getTime() / 1_000),
        ),
        blockTimestampAtEnd: BigInt(
          Math.floor(end.block_timestamp.getTime() / 1_000),
        ),
        events: rateEvents,
      }).integratedYpo;
    } catch {
      rateIntegratedYpo = undefined;
    }
  }

  const results = evaluateCoreReconciliations({
    startUsdpSupply: optionalBigint(start?.usdp_total_supply),
    endUsdpSupply: optionalBigint(end?.usdp_total_supply),
    usdpMinted: lifetimeCoverage.complete
      ? optionalBigint(totals?.usdp_minted)
      : undefined,
    usdpBurned: lifetimeCoverage.complete
      ? optionalBigint(totals?.usdp_burned)
      : undefined,
    startSusdpSupply: optionalBigint(start?.susdp_total_supply),
    endSusdpSupply: optionalBigint(end?.susdp_total_supply),
    susdpMinted: coverage.complete
      ? optionalBigint(totals?.susdp_minted)
      : undefined,
    susdpBurned: coverage.complete
      ? optionalBigint(totals?.susdp_burned)
      : undefined,
    startActualAssets: optionalBigint(start?.susdp_actual_assets),
    endActualAssets: optionalBigint(end?.susdp_actual_assets),
    depositedAssets: coverage.complete
      ? optionalBigint(totals?.deposited_assets)
      : undefined,
    withdrawnAssets: coverage.complete
      ? optionalBigint(totals?.withdrawn_assets)
      : undefined,
    accruedAssets: coverage.complete
      ? optionalBigint(totals?.accrued_assets)
      : undefined,
    directUnderlyingNet: coverage.complete ? directUnderlyingNet : undefined,
    convertedTotalSupplyAssets,
    endTotalAssets: optionalBigint(end?.susdp_total_assets),
    holderBalanceSum: undefined,
    holderHistoryComplete: false,
    rateIntegratedYpo,
    nativeYpo,
    indexedThroughBlock,
    requestedToBlock: options.toBlock,
  });
  const recordedFailures = Number(rpcState.rows[0]?.failures ?? "0");
  const findings = evaluateHealth({
    checkpointAgeSeconds: complete
      ? 0
      : secondsBetween(now, checkpointRow?.updated_at),
    checkpointMaximumAgeSeconds: options.checkpointMaximumAgeSeconds ?? 30 * 60,
    coverageGapCount: coverage.gaps.length,
    decodeFailureCount,
    duplicateLogCount,
    rpcRetryCount: Number(rpcState.rows[0]?.retries ?? "0"),
    rpcFailureCount: complete ? 0 : recordedFailures,
    priceAgeSeconds: secondsBetween(now, latestPrice.rows[0]?.observed_at),
    priceMaximumAgeSeconds: options.priceMaximumAgeSeconds ?? 60 * 60,
    implementationMatchesManifest,
    nativeYpo,
    holderHistoryComplete: false,
  });
  const persisted = await persistVerification({
    pool: options.pool,
    adapter: options.adapter,
    scope: options.scope,
    fromBlock: options.fromBlock,
    toBlock: options.toBlock,
    observedAt: now,
    results,
    findings,
  });
  return {
    status: persisted.summary.status,
    runId: persisted.runId,
    chainId: options.adapter.chainId,
    chainSlug: options.adapter.chainSlug,
    scope: options.scope,
    fromBlock: options.fromBlock.toString(),
    toBlock: options.toBlock.toString(),
    coverage,
    summary: persisted.summary,
    reconciliations: results,
    health: findings,
  };
}
