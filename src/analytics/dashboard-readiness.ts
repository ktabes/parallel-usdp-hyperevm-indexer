import type { Pool } from "pg";

export const lifetimeDashboardRanges = [
  {
    chainId: 1,
    chainSlug: "ethereum",
    chainName: "Ethereum",
    scope: "parallel-assets-ethereum-lifetime-v1",
    coverageKind: "lifetime",
    fromBlock: 22_639_007n,
    goalBlock: 25_542_442n,
  },
  {
    chainId: 8453,
    chainSlug: "base",
    chainName: "Base",
    scope: "parallel-assets-base-lifetime-v1",
    coverageKind: "lifetime",
    fromBlock: 31_200_853n,
    goalBlock: 48_691_161n,
  },
  {
    chainId: 146,
    chainSlug: "sonic",
    chainName: "Sonic",
    scope: "parallel-assets-sonic-lifetime-v1",
    coverageKind: "lifetime",
    fromBlock: 32_199_398n,
    goalBlock: 76_014_565n,
  },
  {
    chainId: 43114,
    chainSlug: "avalanche",
    chainName: "Avalanche",
    scope: "parallel-assets-avalanche-lifetime-v1",
    coverageKind: "lifetime",
    fromBlock: 63_383_232n,
    goalBlock: 90_424_055n,
  },
  {
    chainId: 999,
    chainSlug: "hyperevm",
    chainName: "HyperEVM",
    scope: "parallel-savings-hyperevm-1783558757-1784163557-v1",
    coverageKind: "window",
    fromBlock: 39_958_147n,
    goalBlock: 40_572_940n,
  },
] as const;

export interface LifetimeActivityMetric {
  assetId: "usdp" | "susdp";
  windowStart: string;
  windowEnd: string;
  transferVolume: string;
  mintedVolume: string;
  burnedVolume: string;
  transferCount: number;
  uniqueParticipants: number;
  newHolders: number;
  activeHolders: number;
  sourceFromBlock: string;
  sourceToBlock: string;
  calculationVersion: string;
}

export interface LifetimeFlowMetric {
  depositedAssets: string;
  withdrawnAssets: string;
  depositCount: number;
  withdrawCount: number;
}

export interface LifetimeDashboardRow {
  chainId: number;
  chainSlug: string;
  chainName: string;
  scope: string;
  coverageKind: "lifetime" | "window";
  fromBlock: string;
  goalBlock: string;
  nextBlock: string | null;
  updatedAt: string | null;
  progressPercent: number;
  publicationStatus:
    "not_started" | "indexing" | "deriving" | "published" | "window_only";
  publishedAssets: number;
  assets: Partial<Record<"usdp" | "susdp", LifetimeActivityMetric>>;
  flows: LifetimeFlowMetric | null;
}

interface CheckpointRow {
  chain_id: number;
  scope: string;
  next_block: string;
  updated_at: Date;
}

interface ActivityRow {
  chain_id: number;
  asset_id: "usdp" | "susdp";
  window_start: Date;
  window_end: Date;
  transfer_volume: string;
  minted_volume: string;
  burned_volume: string;
  transfer_count: number;
  unique_participants: number;
  new_holders: number;
  active_holders: number;
  source_from_block: string;
  source_to_block: string;
  calculation_version: string;
}

interface FlowRow {
  chain_id: number;
  source_from_block: string;
  source_to_block: string;
  deposited_assets: string;
  withdrawn_assets: string;
  deposit_count: string;
  withdraw_count: string;
}

export function lifetimeProgressPercent(
  fromBlock: bigint,
  goalBlock: bigint,
  nextBlock: bigint | null,
) {
  if (nextBlock === null || nextBlock <= fromBlock) return 0;
  const total = goalBlock - fromBlock + 1n;
  const covered = nextBlock > goalBlock ? total : nextBlock - fromBlock;
  return Number((covered * 10_000n) / total) / 100;
}

export function lifetimePublicationStatus(options: {
  nextBlock: bigint | null;
  goalBlock: bigint;
  publishedAssets: number;
  coverageKind?: "lifetime" | "window";
}): LifetimeDashboardRow["publicationStatus"] {
  if (
    options.coverageKind === "window" &&
    options.nextBlock !== null &&
    options.nextBlock > options.goalBlock
  )
    return "window_only";
  if (options.publishedAssets >= 2) return "published";
  if (options.nextBlock !== null && options.nextBlock > options.goalBlock)
    return "deriving";
  if (options.nextBlock !== null) return "indexing";
  return "not_started";
}

export async function readLifetimeDashboard(pool: Pool) {
  const scopes = lifetimeDashboardRanges.map((range) => range.scope);
  const chainIds = lifetimeDashboardRanges.map((range) => range.chainId);
  const [checkpoints, activity, flows] = await Promise.all([
    pool.query<CheckpointRow>(
      `select chain_id, scope, next_block, updated_at
         from indexer_checkpoints
        where scope = any($1::text[])`,
      [scopes],
    ),
    pool.query<ActivityRow>(
      `select distinct on (chain_id, asset_id)
              chain_id, asset_id, window_start, window_end,
              transfer_volume, minted_volume, burned_volume,
              transfer_count, unique_participants, new_holders, active_holders,
              source_from_block, source_to_block, calculation_version
         from asset_activity_aggregates
        where source_scope = any($1::text[]) and history_complete
        order by chain_id, asset_id, source_to_block desc, created_at desc`,
      [scopes],
    ),
    pool.query<FlowRow>(
      `select chain_id, source_from_block::text, source_to_block::text,
              coalesce(sum(amount_base_units::numeric)
                filter (where metric = 'susdp_deposited'),0)::text
                as deposited_assets,
              coalesce(sum(amount_base_units::numeric)
                filter (where metric = 'susdp_withdrawn'),0)::text
                as withdrawn_assets,
              coalesce(sum(event_count)
                filter (where metric = 'susdp_deposited'),0)::text
                as deposit_count,
              coalesce(sum(event_count)
                filter (where metric = 'susdp_withdrawn'),0)::text
                as withdraw_count
         from flow_aggregates
        where chain_id = any($1::int[]) and granularity = 'day'
        group by chain_id, source_from_block, source_to_block`,
      [chainIds],
    ),
  ]);

  return lifetimeDashboardRanges.map((range): LifetimeDashboardRow => {
    const checkpoint = checkpoints.rows.find(
      (row) => row.chain_id === range.chainId && row.scope === range.scope,
    );
    const assetRows = activity.rows.filter(
      (row) =>
        row.chain_id === range.chainId &&
        BigInt(row.source_from_block) === range.fromBlock &&
        BigInt(row.source_to_block) === range.goalBlock,
    );
    const assets = Object.fromEntries(
      assetRows.map((row) => [
        row.asset_id,
        {
          assetId: row.asset_id,
          windowStart: row.window_start.toISOString(),
          windowEnd: row.window_end.toISOString(),
          transferVolume: row.transfer_volume,
          mintedVolume: row.minted_volume,
          burnedVolume: row.burned_volume,
          transferCount: row.transfer_count,
          uniqueParticipants: row.unique_participants,
          newHolders: row.new_holders,
          activeHolders: row.active_holders,
          sourceFromBlock: row.source_from_block,
          sourceToBlock: row.source_to_block,
          calculationVersion: row.calculation_version,
        } satisfies LifetimeActivityMetric,
      ]),
    ) as LifetimeDashboardRow["assets"];
    const flow = flows.rows.find(
      (row) =>
        row.chain_id === range.chainId &&
        BigInt(row.source_from_block) === range.fromBlock &&
        BigInt(row.source_to_block) === range.goalBlock,
    );
    const nextBlock = checkpoint ? BigInt(checkpoint.next_block) : null;
    return {
      chainId: range.chainId,
      chainSlug: range.chainSlug,
      chainName: range.chainName,
      scope: range.scope,
      coverageKind: range.coverageKind,
      fromBlock: range.fromBlock.toString(),
      goalBlock: range.goalBlock.toString(),
      nextBlock: nextBlock?.toString() ?? null,
      updatedAt: checkpoint?.updated_at.toISOString() ?? null,
      progressPercent: lifetimeProgressPercent(
        range.fromBlock,
        range.goalBlock,
        nextBlock,
      ),
      publicationStatus: lifetimePublicationStatus({
        nextBlock,
        goalBlock: range.goalBlock,
        publishedAssets: assetRows.length,
        coverageKind: range.coverageKind,
      }),
      publishedAssets: assetRows.length,
      assets,
      flows: flow
        ? {
            depositedAssets: flow.deposited_assets,
            withdrawnAssets: flow.withdrawn_assets,
            depositCount: Number(flow.deposit_count),
            withdrawCount: Number(flow.withdraw_count),
          }
        : null,
    };
  });
}
