import type { Pool } from "pg";
import type { ParallelAssetId } from "@/protocol/assets";
import { savingsChainAdapters } from "@/protocol/savings-chains";
import { ZERO_ADDRESS } from "./holders";

export type AnalyticsRangePreset = "7d" | "30d" | "90d" | "all" | "custom";

export interface AnalyticsRangeRequest {
  preset: AnalyticsRangePreset;
  chainIds: number[];
  assetIds: ParallelAssetId[];
  from?: Date;
  to?: Date;
  asOf?: Date;
}

export interface YieldInterval {
  id: string;
  chainId: number;
  windowStart: Date;
  windowEnd: Date;
  nativeYpo: string;
  reconciliationStatus: "candidate" | "verified" | "invalid";
  calculationVersion: string;
}

const presetMilliseconds: Record<
  Exclude<AnalyticsRangePreset, "all" | "custom">,
  number
> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export function parseRangeAnalyticsRequest(searchParams: URLSearchParams) {
  const presetValue = searchParams.get("range") ?? "7d";
  if (!["7d", "30d", "90d", "all"].includes(presetValue))
    throw new Error("range must be one of 7d, 30d, 90d, or all");
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");
  if ((fromValue && !toValue) || (!fromValue && toValue))
    throw new Error("from and to must be provided together");
  const parseDate = (value: string, name: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new Error(`${name} must be ISO-8601`);
    return date;
  };
  const chainValue = searchParams.get("chains") ?? "all";
  const requestedSlugs =
    chainValue === "all"
      ? savingsChainAdapters.map((adapter) => adapter.chainSlug)
      : [...new Set(chainValue.split(",").map((value) => value.trim()))].filter(
          Boolean,
        );
  const unknownChains = requestedSlugs.filter(
    (slug) =>
      !savingsChainAdapters.some((adapter) => adapter.chainSlug === slug),
  );
  if (unknownChains.length > 0)
    throw new Error(`Unknown savings chains: ${unknownChains.join(", ")}`);
  const assetValue = searchParams.get("assets") ?? "usdp,susdp";
  const assetIds = [
    ...new Set(assetValue.split(",").map((value) => value.trim())),
  ].filter(
    (value): value is ParallelAssetId => value === "usdp" || value === "susdp",
  );
  if (assetIds.length === 0 || assetIds.length !== assetValue.split(",").length)
    throw new Error("assets must contain only usdp and/or susdp");
  const asOfValue = searchParams.get("asOf");
  const from = fromValue ? parseDate(fromValue, "from") : undefined;
  const to = toValue ? parseDate(toValue, "to") : undefined;
  if (from && to && to <= from) throw new Error("to must be after from");
  return {
    preset:
      from && to ? ("custom" as const) : (presetValue as AnalyticsRangePreset),
    chainIds: requestedSlugs.map(
      (slug) =>
        savingsChainAdapters.find((adapter) => adapter.chainSlug === slug)!
          .chainId,
    ),
    assetIds,
    from,
    to,
    asOf: asOfValue ? parseDate(asOfValue, "asOf") : undefined,
  } satisfies AnalyticsRangeRequest;
}

export function aggregateContiguousYieldIntervals(options: {
  intervals: readonly YieldInterval[];
  rangeStart: Date;
  rangeEnd: Date;
  toleranceMilliseconds?: number;
}) {
  const tolerance = options.toleranceMilliseconds ?? 5 * 60_000;
  const ordered = [...options.intervals]
    .filter(
      (interval) =>
        interval.reconciliationStatus !== "invalid" &&
        interval.windowEnd > options.rangeStart &&
        interval.windowStart < options.rangeEnd,
    )
    .sort(
      (left, right) =>
        left.windowStart.getTime() - right.windowStart.getTime() ||
        right.windowEnd.getTime() - left.windowEnd.getTime(),
    );
  const selected: YieldInterval[] = [];
  let cursor = options.rangeStart.getTime();
  for (const interval of ordered) {
    const start = interval.windowStart.getTime();
    const end = interval.windowEnd.getTime();
    if (end <= cursor + tolerance) continue;
    if (Math.abs(start - cursor) > tolerance) {
      if (start > cursor + tolerance) break;
      continue;
    }
    selected.push(interval);
    cursor = end;
    if (cursor >= options.rangeEnd.getTime() - tolerance) break;
  }
  const complete =
    selected.length > 0 && cursor >= options.rangeEnd.getTime() - tolerance;
  const verified =
    complete &&
    selected.every((interval) => interval.reconciliationStatus === "verified");
  return {
    status: complete ? (verified ? "verified" : "candidate") : "unavailable",
    complete,
    verified,
    nativeYpo: complete
      ? selected.reduce(
          (total, interval) => total + BigInt(interval.nativeYpo),
          0n,
        )
      : null,
    intervalIds: selected.map((interval) => interval.id),
    coveredThrough: selected.at(-1)?.windowEnd ?? null,
    reason: complete ? null : "contiguous_yield_intervals_missing",
  } as const;
}

interface CoverageRow {
  chain_id: number;
  asset_id: ParallelAssetId;
  source_scope: string;
  source_from_block: string;
  source_to_block: string;
  coverage_start: Date;
  coverage_end: Date;
  current_holders: string;
  history_complete: boolean;
  manifest_version: string;
  calculation_version: string;
}

interface ActivityRow {
  transfer_volume: string;
  minted_volume: string;
  burned_volume: string;
  transfer_count: string;
  unique_senders: string;
  unique_receivers: string;
  unique_participants: string;
}

interface RangeActivity {
  transferVolume: string;
  mintedVolume: string;
  burnedVolume: string;
  transferCount: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  uniqueParticipants: number;
  newHolders: number;
}

interface SavingsFlowRow {
  deposited_assets: string;
  withdrawn_assets: string;
  deposit_count: string;
  withdraw_count: string;
  unique_depositors: string;
  unique_withdrawers: string;
}

async function latestCoverage(
  pool: Pool,
  chainIds: readonly number[],
  assetIds: readonly ParallelAssetId[],
) {
  return pool.query<CoverageRow>(
    `select distinct on (aaa.chain_id, aaa.asset_id)
            aaa.chain_id, aaa.asset_id, aaa.source_scope,
            aaa.source_from_block, aaa.source_to_block,
            bf.timestamp as coverage_start, bt.timestamp as coverage_end,
            (select count(*)::text from holder_balances hb
              where hb.chain_id = aaa.chain_id and hb.asset_id = aaa.asset_id
                and hb.source_scope = aaa.source_scope
                and hb.history_complete and hb.balance <> '0') as current_holders,
            aaa.history_complete, aaa.manifest_version,
            aaa.calculation_version
       from asset_activity_aggregates aaa
       join blocks bf on bf.chain_id = aaa.chain_id
                     and bf.number = aaa.source_from_block
       join blocks bt on bt.chain_id = aaa.chain_id
                     and bt.number = aaa.source_to_block
      where aaa.chain_id = any($1::int[])
        and aaa.asset_id = any($2::text[])
        and aaa.history_complete
      order by aaa.chain_id, aaa.asset_id, aaa.source_to_block desc,
               aaa.created_at desc`,
    [chainIds, assetIds],
  );
}

async function activityForRange(
  pool: Pool,
  chainId: number,
  assetId: ParallelAssetId,
  rangeStart: Date,
  rangeEnd: Date,
  sourceScope: string,
) {
  const role = assetId === "usdp" ? "usdp-token" : "susdp-savings";
  const [activity, newHolders] = await Promise.all([
    pool.query<ActivityRow>(
      `with transfers as (
         select lower(pe.payload->>'from') as from_address,
                lower(pe.payload->>'to') as to_address,
                (pe.payload->>'value')::numeric as value
           from protocol_events pe
           join blocks b on b.chain_id = pe.chain_id
                        and b.number = pe.block_number
          where pe.chain_id = $1 and pe.contract_role = $2
            and pe.event_name = 'Transfer'
            and b.timestamp >= $3 and b.timestamp <= $4
       )
       select coalesce(sum(value) filter (
                where from_address <> $5 and to_address <> $5),0)::text
                as transfer_volume,
              coalesce(sum(value) filter (where from_address = $5),0)::text
                as minted_volume,
              coalesce(sum(value) filter (where to_address = $5),0)::text
                as burned_volume,
              count(*) filter (
                where from_address <> $5 and to_address <> $5)::text
                as transfer_count,
              count(distinct from_address) filter (where from_address <> $5)::text
                as unique_senders,
              count(distinct to_address) filter (where to_address <> $5)::text
                as unique_receivers,
              (select count(distinct participant)::text
                 from (select from_address as participant from transfers
                       where from_address <> $5
                       union all
                       select to_address from transfers where to_address <> $5) p)
                as unique_participants
         from transfers`,
      [chainId, role, rangeStart, rangeEnd, ZERO_ADDRESS],
    ),
    pool.query<{ value: string }>(
      `select count(*)::text as value
         from holder_balances hb
         join blocks b on b.chain_id = hb.chain_id
                      and b.number = hb.first_positive_block
        where hb.chain_id = $1 and hb.asset_id = $2
          and hb.source_scope = $5
          and hb.history_complete
          and b.timestamp >= $3 and b.timestamp <= $4`,
      [chainId, assetId, rangeStart, rangeEnd, sourceScope],
    ),
  ]);
  const row = activity.rows[0]!;
  return {
    transferVolume: row.transfer_volume,
    mintedVolume: row.minted_volume,
    burnedVolume: row.burned_volume,
    transferCount: Number(row.transfer_count),
    uniqueSenders: Number(row.unique_senders),
    uniqueReceivers: Number(row.unique_receivers),
    uniqueParticipants: Number(row.unique_participants),
    newHolders: Number(newHolders.rows[0]?.value ?? "0"),
  };
}

async function savingsFlowsForRange(
  pool: Pool,
  chainId: number,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const result = await pool.query<SavingsFlowRow>(
    `select coalesce(sum((pe.payload->>'assets')::numeric)
                filter (where pe.event_name = 'Deposit'),0)::text
              as deposited_assets,
            coalesce(sum((pe.payload->>'assets')::numeric)
                filter (where pe.event_name = 'Withdraw'),0)::text
              as withdrawn_assets,
            count(*) filter (where pe.event_name = 'Deposit')::text
              as deposit_count,
            count(*) filter (where pe.event_name = 'Withdraw')::text
              as withdraw_count,
            count(distinct lower(pe.payload->>'owner'))
                filter (where pe.event_name = 'Deposit')::text
              as unique_depositors,
            count(distinct lower(pe.payload->>'owner'))
                filter (where pe.event_name = 'Withdraw')::text
              as unique_withdrawers
       from protocol_events pe
       join blocks b on b.chain_id = pe.chain_id
                    and b.number = pe.block_number
      where pe.chain_id = $1 and pe.contract_role = 'susdp-savings'
        and pe.event_name in ('Deposit','Withdraw')
        and b.timestamp >= $2 and b.timestamp <= $3`,
    [chainId, rangeStart, rangeEnd],
  );
  const row = result.rows[0]!;
  return {
    depositedAssets: row.deposited_assets,
    withdrawnAssets: row.withdrawn_assets,
    netFlow: (
      BigInt(row.deposited_assets) - BigInt(row.withdrawn_assets)
    ).toString(),
    depositCount: Number(row.deposit_count),
    withdrawCount: Number(row.withdraw_count),
    uniqueDepositors: Number(row.unique_depositors),
    uniqueWithdrawers: Number(row.unique_withdrawers),
  };
}

async function yieldIntervals(pool: Pool, chainIds: readonly number[]) {
  const result = await pool.query<{
    id: string;
    chain_id: number;
    window_start: Date;
    window_end: Date;
    native_ypo: string;
    reconciliation_status: YieldInterval["reconciliationStatus"];
    calculation_version: string;
  }>(
    `select distinct on (chain_id, window_start, window_end)
            id, chain_id, window_start, window_end, native_ypo,
            reconciliation_status, calculation_version
       from savings_yield_aggregates
      where chain_id = any($1::int[])
      order by chain_id, window_start, window_end, created_at desc`,
    [chainIds],
  );
  return result.rows.map((row) => ({
    id: row.id,
    chainId: row.chain_id,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    nativeYpo: row.native_ypo,
    reconciliationStatus: row.reconciliation_status,
    calculationVersion: row.calculation_version,
  }));
}

function rangeStartForPreset(
  preset: AnalyticsRangeRequest["preset"],
  end: Date,
) {
  if (preset === "all" || preset === "custom") return null;
  return new Date(end.getTime() - presetMilliseconds[preset]);
}

export async function readRangeAnalytics(
  pool: Pool,
  request: AnalyticsRangeRequest,
) {
  const coverageResult = await latestCoverage(
    pool,
    request.chainIds,
    request.assetIds,
  );
  const coverageByKey = new Map(
    coverageResult.rows.map((row) => [`${row.chain_id}:${row.asset_id}`, row]),
  );
  const defaultEnd = coverageResult.rows.length
    ? new Date(
        Math.min(
          ...coverageResult.rows.map((row) => row.coverage_end.getTime()),
        ),
      )
    : new Date();
  const rangeEnd = request.to ?? request.asOf ?? defaultEnd;
  const sharedRangeStart =
    request.from ?? rangeStartForPreset(request.preset, rangeEnd);
  const intervals = await yieldIntervals(pool, request.chainIds);
  const chains: Array<{
    chainId: number;
    chainSlug: string;
    chainName: string;
    assets: Record<string, unknown>;
    savings: {
      flows: Awaited<ReturnType<typeof savingsFlowsForRange>> | null;
      ypo: {
        status: string;
        complete: boolean;
        verified: boolean;
        nativeYpo: string | null;
        intervalIds: string[];
        coveredThrough: string | null;
        reason: string | null;
      };
    };
  }> = [];
  for (const chainId of request.chainIds) {
    const adapter = savingsChainAdapters.find(
      (item) => item.chainId === chainId,
    )!;
    const assets: Record<string, unknown> = {};
    for (const assetId of request.assetIds) {
      const coverage = coverageByKey.get(`${chainId}:${assetId}`);
      const rangeStart = sharedRangeStart ?? coverage?.coverage_start ?? null;
      const covered = Boolean(
        coverage &&
        rangeStart &&
        coverage.coverage_start <= rangeStart &&
        coverage.coverage_end >= rangeEnd,
      );
      assets[assetId] =
        coverage && rangeStart && covered
          ? {
              status: "available",
              rangeStart: rangeStart.toISOString(),
              rangeEnd: rangeEnd.toISOString(),
              coverage: {
                scope: coverage.source_scope,
                fromBlock: coverage.source_from_block,
                toBlock: coverage.source_to_block,
                start: coverage.coverage_start.toISOString(),
                end: coverage.coverage_end.toISOString(),
                historyComplete: coverage.history_complete,
              },
              activity: await activityForRange(
                pool,
                chainId,
                assetId,
                rangeStart,
                rangeEnd,
                coverage.source_scope,
              ),
              currentHoldersAtCoverageEnd: Number(coverage.current_holders),
              manifestVersion: coverage.manifest_version,
              calculationVersion: coverage.calculation_version,
            }
          : {
              status: "unavailable",
              reason: coverage
                ? "requested_range_outside_complete_history"
                : "lifetime_history_not_backfilled",
              requestedStart: rangeStart?.toISOString() ?? null,
              requestedEnd: rangeEnd.toISOString(),
              availableStart: coverage?.coverage_start.toISOString() ?? null,
              availableEnd: coverage?.coverage_end.toISOString() ?? null,
            };
    }
    const susdpCoverage = coverageByKey.get(`${chainId}:susdp`);
    const ypoStart = sharedRangeStart ?? susdpCoverage?.coverage_start ?? null;
    const ypo = ypoStart
      ? aggregateContiguousYieldIntervals({
          intervals: intervals.filter(
            (interval) => interval.chainId === chainId,
          ),
          rangeStart: ypoStart,
          rangeEnd,
        })
      : {
          status: "unavailable" as const,
          complete: false,
          verified: false,
          nativeYpo: null,
          intervalIds: [],
          coveredThrough: null,
          reason: "range_start_unavailable",
        };
    const susdpAsset = assets.susdp as
      { status?: string; rangeStart?: string } | undefined;
    const savingsFlows =
      susdpAsset?.status === "available" && susdpAsset.rangeStart
        ? await savingsFlowsForRange(
            pool,
            chainId,
            new Date(susdpAsset.rangeStart),
            rangeEnd,
          )
        : null;
    chains.push({
      chainId,
      chainSlug: adapter.chainSlug,
      chainName: adapter.chainName,
      assets,
      savings: {
        flows: savingsFlows,
        ypo: {
          ...ypo,
          nativeYpo: ypo.nativeYpo?.toString() ?? null,
          coveredThrough: ypo.coveredThrough?.toISOString() ?? null,
        },
      },
    });
  }
  const requestedComponents = request.chainIds.length * request.assetIds.length;
  const availableComponents = chains.reduce(
    (total, chain) =>
      total +
      Object.values(chain.assets).filter(
        (asset) => (asset as { status?: string }).status === "available",
      ).length,
    0,
  );
  const availableYpo = chains.filter((chain) => chain.savings.ypo.complete);
  const globalYpoComplete =
    request.assetIds.includes("susdp") &&
    availableYpo.length === request.chainIds.length;
  const globalYpoVerified =
    globalYpoComplete &&
    availableYpo.every((chain) => chain.savings.ypo.verified);
  const status =
    availableComponents === requestedComponents
      ? "complete"
      : availableComponents > 0
        ? "partial"
        : "unavailable";
  const globalActivity = Object.fromEntries(
    request.assetIds.map((assetId) => {
      const available = chains.flatMap((chain) => {
        const asset = chain.assets[assetId] as {
          status?: string;
          activity?: RangeActivity;
        };
        return asset.status === "available" && asset.activity
          ? [{ chainId: chain.chainId, activity: asset.activity }]
          : [];
      });
      return [
        assetId,
        {
          status:
            available.length === request.chainIds.length
              ? "complete"
              : available.length > 0
                ? "partial"
                : "unavailable",
          includedChainIds: available.map((item) => item.chainId),
          missingChainIds: request.chainIds.filter(
            (chainId) => !available.some((item) => item.chainId === chainId),
          ),
          transferVolume: available
            .reduce(
              (total, item) => total + BigInt(item.activity.transferVolume),
              0n,
            )
            .toString(),
          mintedVolume: available
            .reduce(
              (total, item) => total + BigInt(item.activity.mintedVolume),
              0n,
            )
            .toString(),
          burnedVolume: available
            .reduce(
              (total, item) => total + BigInt(item.activity.burnedVolume),
              0n,
            )
            .toString(),
          transferCount: available.reduce(
            (total, item) => total + item.activity.transferCount,
            0,
          ),
          chainSummedUniqueParticipants: available.reduce(
            (total, item) => total + item.activity.uniqueParticipants,
            0,
          ),
          chainSummedNewHolders: available.reduce(
            (total, item) => total + item.activity.newHolders,
            0,
          ),
          participantAggregation:
            "chain-summed; cross-chain address deduplication not assumed",
        },
      ];
    }),
  );
  const availableSavingsFlows = chains.filter(
    (chain) => chain.savings.flows !== null,
  );
  return {
    status,
    range: {
      preset: request.preset,
      start: sharedRangeStart?.toISOString() ?? "per-deployment",
      end: rangeEnd.toISOString(),
      convention: "[start_timestamp,end_timestamp]",
    },
    coverage: {
      requestedChainIds: request.chainIds,
      requestedAssetIds: request.assetIds,
      requestedComponents,
      availableComponents,
      missingComponents: requestedComponents - availableComponents,
    },
    chains,
    global: {
      activity: globalActivity,
      savingsFlows: {
        status:
          availableSavingsFlows.length === request.chainIds.length
            ? "complete"
            : availableSavingsFlows.length > 0
              ? "partial"
              : "unavailable",
        includedChainIds: availableSavingsFlows.map((chain) => chain.chainId),
        depositedAssets: availableSavingsFlows
          .reduce(
            (total, chain) =>
              total + BigInt(chain.savings.flows!.depositedAssets),
            0n,
          )
          .toString(),
        withdrawnAssets: availableSavingsFlows
          .reduce(
            (total, chain) =>
              total + BigInt(chain.savings.flows!.withdrawnAssets),
            0n,
          )
          .toString(),
        netFlow: availableSavingsFlows
          .reduce(
            (total, chain) => total + BigInt(chain.savings.flows!.netFlow),
            0n,
          )
          .toString(),
        depositCount: availableSavingsFlows.reduce(
          (total, chain) => total + chain.savings.flows!.depositCount,
          0,
        ),
        withdrawCount: availableSavingsFlows.reduce(
          (total, chain) => total + chain.savings.flows!.withdrawCount,
          0,
        ),
      },
      ypo: globalYpoComplete
        ? {
            status: globalYpoVerified ? "verified" : "candidate",
            nativeYpo: availableYpo
              .reduce(
                (total, chain) =>
                  total + BigInt(chain.savings.ypo.nativeYpo ?? "0"),
                0n,
              )
              .toString(),
            includedChainIds: availableYpo.map((chain) => chain.chainId),
          }
        : {
            status: "unavailable",
            nativeYpo: null,
            reason: "complete_contiguous_chain_intervals_missing",
            includedChainIds: availableYpo.map((chain) => chain.chainId),
          },
    },
  };
}
