import type { Pool } from "pg";
import { usdpSupplyAdapters } from "@/protocol/usdp-chains";

interface GlobalRow {
  id: string;
  as_of: Date;
  expected_chain_count: number;
  included_chain_count: number;
  coverage_status: "complete" | "partial" | "unavailable";
  accounting_status: "candidate" | "verified";
  candidate_total_supply: string;
  verified_total_supply: string | null;
  oldest_component_timestamp: Date | null;
  newest_component_timestamp: Date | null;
  maximum_component_age_seconds: string | null;
  component_skew_seconds: string | null;
  alignment_maximum_skew_seconds: number;
  included_chain_ids: number[];
  missing_chain_ids: number[];
  stale_chain_ids: number[];
  failed_chain_ids: number[];
  manifest_version: string;
  calculation_version: string;
}

interface ComponentRow {
  chain_id: number;
  block_number: string;
  block_hash: string;
  block_timestamp: Date;
  total_supply: string;
  snapshot_status: string;
  included: boolean;
  exclusion_reason: string | null;
  code_hash: string;
  observed_name: string;
  observed_symbol: string;
  observed_decimals: number;
  metadata_verified: boolean;
  finality_mode: string;
  rpc_source: string;
}

export async function readLatestGlobalUsdpSupply(
  pool: Pool,
  maximumAgeSeconds: number,
) {
  const latest = await pool.query<GlobalRow>(
    `select * from global_usdp_supply_snapshots
      order by as_of desc, created_at desc limit 1`,
  );
  const snapshot = latest.rows[0];
  if (!snapshot)
    return {
      status: "unavailable" as const,
      reason: "global_usdp_supply_snapshot_missing" as const,
      expectedChainIds: usdpSupplyAdapters.map((adapter) => adapter.chain.id),
    };
  const components = await pool.query<ComponentRow>(
    `select gusc.chain_id, acs.block_number, acs.block_hash,
            acs.block_timestamp, acs.total_supply, acs.snapshot_status,
            gusc.included, gusc.exclusion_reason, use.code_hash,
            use.observed_name, use.observed_symbol, use.observed_decimals,
            use.metadata_verified, use.finality_mode, use.rpc_source
       from global_usdp_supply_snapshot_components gusc
       join asset_chain_snapshots acs on acs.id = gusc.asset_snapshot_id
       join usdp_supply_snapshot_evidence use
         on use.asset_snapshot_id = acs.id
      where gusc.global_snapshot_id = $1
      order by gusc.chain_id`,
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
  const stale =
    currentMaximumAgeSeconds === null ||
    currentMaximumAgeSeconds > maximumAgeSeconds;
  return {
    status: stale ? ("stale" as const) : snapshot.coverage_status,
    snapshotStatus: snapshot.coverage_status,
    accountingStatus: snapshot.accounting_status,
    globalSnapshotId: snapshot.id,
    asOf: snapshot.as_of.toISOString(),
    candidateTotalSupply: snapshot.candidate_total_supply,
    verifiedTotalSupply: snapshot.verified_total_supply,
    freshness: {
      checkedAt: now.toISOString(),
      maximumAllowedAgeSeconds: maximumAgeSeconds,
      currentMaximumAgeSeconds,
      stale,
    },
    coverage: {
      expectedChainCount: snapshot.expected_chain_count,
      includedChainCount: snapshot.included_chain_count,
      expectedChainIds: usdpSupplyAdapters.map((adapter) => adapter.chain.id),
      includedChainIds: snapshot.included_chain_ids,
      missingChainIds: snapshot.missing_chain_ids,
      staleChainIds: snapshot.stale_chain_ids,
      failedChainIds: snapshot.failed_chain_ids,
      oldestComponentTimestamp:
        snapshot.oldest_component_timestamp?.toISOString() ?? null,
      newestComponentTimestamp:
        snapshot.newest_component_timestamp?.toISOString() ?? null,
      maximumComponentAgeSeconds:
        snapshot.maximum_component_age_seconds ?? null,
      componentSkewSeconds: snapshot.component_skew_seconds ?? null,
      alignmentMaximumSkewSeconds: snapshot.alignment_maximum_skew_seconds,
    },
    components: components.rows.map((component) => {
      const adapter = usdpSupplyAdapters.find(
        (candidate) => candidate.chain.id === component.chain_id,
      );
      return {
        chainId: component.chain_id,
        chainSlug: adapter?.deployment.chainSlug ?? "unknown",
        chainName: adapter?.deployment.chainName ?? "Unknown",
        blockNumber: component.block_number,
        blockHash: component.block_hash,
        blockTimestamp: component.block_timestamp.toISOString(),
        totalSupply: component.total_supply,
        status: component.snapshot_status,
        included: component.included,
        exclusionReason: component.exclusion_reason,
        metadata: {
          name: component.observed_name,
          symbol: component.observed_symbol,
          decimals: component.observed_decimals,
          verified: component.metadata_verified,
        },
        codeHash: component.code_hash,
        finalityMode: component.finality_mode,
        rpcSource: component.rpc_source,
      };
    }),
    methodology: {
      formula: "sum(USDp.totalSupply at aligned finalized chain blocks)",
      bridgeFlowsAddedToSupply: false,
      promotionGate:
        "candidate until bridge deployment, peer, and message reconciliation is complete",
    },
    manifestVersion: snapshot.manifest_version,
    calculationVersion: snapshot.calculation_version,
  };
}
