import type { Pool } from "pg";
import { savingsChainAdapters } from "@/protocol/savings-chains";

interface GlobalSavingsRow {
  id: string;
  as_of: Date;
  expected_chain_count: number;
  included_chain_count: number;
  coverage_status: "complete" | "partial" | "unavailable";
  usdp_supply_on_savings_chains: string;
  susdp_total_assets: string;
  susdp_total_supply: string;
  susdp_weighted_estimated_apy: string | null;
  oldest_component_timestamp: Date | null;
  newest_component_timestamp: Date | null;
  maximum_component_age_seconds: string | null;
  included_chain_ids: number[];
  missing_chain_ids: number[];
  stale_chain_ids: number[];
  calculation_version: string;
  created_at: Date;
}

interface ComponentRow {
  chain_id: number;
  block_number: string;
  block_hash: string;
  block_timestamp: Date;
  snapshot_status: string;
  usdp_total_supply: string;
  susdp_total_supply: string;
  susdp_total_assets: string;
  susdp_actual_assets: string;
  susdp_pending_yield: string;
  susdp_share_price_usdp: string;
  susdp_estimated_apy: string;
  susdp_pause_state: number;
  asset_relationship_verified: boolean;
  usdp_implementation: string;
  susdp_implementation: string;
  manifest_version: string;
  calculation_version: string;
}

export async function readLatestGlobalSavings(
  pool: Pool,
  maximumAgeSeconds: number,
) {
  const latest = await pool.query<GlobalSavingsRow>(
    `select * from global_savings_snapshots
      order by as_of desc, created_at desc limit 1`,
  );
  const snapshot = latest.rows[0];
  if (!snapshot)
    return {
      status: "unavailable" as const,
      reason: "global_snapshot_missing" as const,
      expectedChainIds: savingsChainAdapters.map(({ chainId }) => chainId),
    };
  const components = await pool.query<ComponentRow>(
    `select scs.chain_id, scs.block_number, scs.block_hash,
            scs.block_timestamp, scs.snapshot_status,
            us.total_supply as usdp_total_supply,
            ss.total_supply as susdp_total_supply,
            scs.susdp_total_assets, scs.susdp_actual_assets,
            scs.susdp_pending_yield, scs.susdp_share_price_usdp,
            scs.susdp_estimated_apy, scs.susdp_pause_state,
            scs.asset_relationship_verified, scs.usdp_implementation,
            scs.susdp_implementation, scs.manifest_version,
            scs.calculation_version
       from global_savings_snapshot_components gsc
       join savings_chain_snapshots scs on scs.id = gsc.savings_snapshot_id
       join asset_chain_snapshots us on us.id = scs.usdp_snapshot_id
       join asset_chain_snapshots ss on ss.id = scs.susdp_snapshot_id
      where gsc.global_snapshot_id = $1
      order by scs.chain_id`,
    [snapshot.id],
  );
  const now = new Date();
  const currentMaximumAgeSeconds = snapshot.oldest_component_timestamp
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - snapshot.oldest_component_timestamp.getTime()) /
            1_000,
        ),
      )
    : null;
  const currentlyStale =
    currentMaximumAgeSeconds === null ||
    currentMaximumAgeSeconds > maximumAgeSeconds;

  return {
    status: currentlyStale ? ("stale" as const) : snapshot.coverage_status,
    snapshotStatus: snapshot.coverage_status,
    globalSnapshotId: snapshot.id,
    asOf: snapshot.as_of.toISOString(),
    freshness: {
      checkedAt: now.toISOString(),
      maximumAllowedAgeSeconds: maximumAgeSeconds,
      currentMaximumAgeSeconds,
      stale: currentlyStale,
    },
    coverage: {
      expectedChainCount: snapshot.expected_chain_count,
      includedChainCount: snapshot.included_chain_count,
      expectedChainIds: savingsChainAdapters.map(({ chainId }) => chainId),
      includedChainIds: snapshot.included_chain_ids,
      missingChainIds: snapshot.missing_chain_ids,
      staleChainIds: snapshot.stale_chain_ids,
      oldestComponentTimestamp:
        snapshot.oldest_component_timestamp?.toISOString() ?? null,
      newestComponentTimestamp:
        snapshot.newest_component_timestamp?.toISOString() ?? null,
      maximumComponentAgeSeconds:
        snapshot.maximum_component_age_seconds ?? null,
    },
    usdp: {
      supplyOnSavingsChains: snapshot.usdp_supply_on_savings_chains,
      scope: "five_savings_chains_only" as const,
      globalSupplyStatus: "partial_until_24_chains" as const,
    },
    susdp: {
      totalAssetsUsdp: snapshot.susdp_total_assets,
      totalSupply: snapshot.susdp_total_supply,
      weightedEstimatedApy: snapshot.susdp_weighted_estimated_apy,
      coverageStatus: snapshot.coverage_status,
    },
    components: components.rows.map((component) => ({
      chainId: component.chain_id,
      chainSlug:
        savingsChainAdapters.find(
          (adapter) => adapter.chainId === component.chain_id,
        )?.chainSlug ?? "unknown",
      blockNumber: component.block_number,
      blockHash: component.block_hash,
      blockTimestamp: component.block_timestamp.toISOString(),
      status: component.snapshot_status,
      usdpTotalSupply: component.usdp_total_supply,
      susdpTotalAssets: component.susdp_total_assets,
      susdpActualAssets: component.susdp_actual_assets,
      susdpPendingYield: component.susdp_pending_yield,
      susdpTotalSupply: component.susdp_total_supply,
      susdpSharePriceUsdp: component.susdp_share_price_usdp,
      susdpEstimatedApy: component.susdp_estimated_apy,
      susdpPauseState: component.susdp_pause_state,
      assetRelationshipVerified: component.asset_relationship_verified,
      implementations: {
        usdp: component.usdp_implementation,
        susdp: component.susdp_implementation,
      },
      manifestVersion: component.manifest_version,
      calculationVersion: component.calculation_version,
    })),
    calculationVersion: snapshot.calculation_version,
  };
}
