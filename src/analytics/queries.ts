import type { Pool } from "pg";
import { hyperevmProtocol } from "@/protocol/hyperevm";

async function latestSnapshot(pool: Pool) {
  const result = await pool.query(
    `select vs.*,
            up.price_usd_atomic as usdp_price_usd_atomic,
            up.price_decimals as usdp_price_decimals,
            up.source as usdp_price_source,
            up.stale as usdp_price_stale,
            up.source_metadata as usdp_price_metadata,
            sp.price_usd_atomic as susdp_price_usd_atomic,
            sp.price_decimals as susdp_price_decimals,
            sp.source as susdp_price_source,
            sp.stale as susdp_price_stale,
            sp.source_metadata as susdp_price_metadata
       from vault_snapshots vs
       join price_observations up on up.id = vs.usdp_price_observation_id
       join price_observations sp on sp.id = vs.susdp_price_observation_id
      where vs.chain_id = $1
      order by vs.block_number desc, vs.created_at desc
      limit 1`,
    [hyperevmProtocol.chainId],
  );
  return result.rows[0] ?? null;
}

export async function readState(pool: Pool) {
  const snapshot = await latestSnapshot(pool);
  if (!snapshot)
    return {
      status: "unavailable" as const,
      reason: "snapshot_missing" as const,
    };
  return { status: snapshot.snapshot_status, snapshot };
}

export async function readRates(pool: Pool) {
  const snapshot = await latestSnapshot(pool);
  if (!snapshot)
    return {
      status: "unavailable" as const,
      reason: "snapshot_missing" as const,
    };
  return {
    status: snapshot.snapshot_status,
    blockNumber: snapshot.block_number,
    blockTimestamp: snapshot.block_timestamp,
    rate: snapshot.susdp_rate,
    lastUpdate: snapshot.susdp_last_update,
    estimatedApr: snapshot.susdp_estimated_apr,
    maxRate: snapshot.susdp_max_rate,
    pauseState: snapshot.susdp_pause_state,
    manifestVersion: snapshot.manifest_version,
    calculationVersion: snapshot.calculation_version,
  };
}

export async function readPrices(pool: Pool) {
  const snapshot = await latestSnapshot(pool);
  if (!snapshot)
    return {
      status: "unavailable" as const,
      reason: "snapshot_missing" as const,
    };
  return {
    status: snapshot.snapshot_status,
    blockNumber: snapshot.block_number,
    blockTimestamp: snapshot.block_timestamp,
    usdp: {
      priceUsdAtomic: snapshot.usdp_price_usd_atomic,
      decimals: snapshot.usdp_price_decimals,
      source: snapshot.usdp_price_source,
      stale: snapshot.usdp_price_stale,
      metadata: snapshot.usdp_price_metadata,
    },
    susdp: {
      priceUsdAtomic: snapshot.susdp_price_usd_atomic,
      decimals: snapshot.susdp_price_decimals,
      source: snapshot.susdp_price_source,
      stale: snapshot.susdp_price_stale,
      metadata: snapshot.susdp_price_metadata,
    },
  };
}

export async function readLatestYield(pool: Pool) {
  const result = await pool.query(
    `select * from yield_aggregates
      where chain_id = $1
      order by to_block desc, created_at desc limit 1`,
    [hyperevmProtocol.chainId],
  );
  const aggregate = result.rows[0];
  if (!aggregate)
    return {
      status: "unavailable" as const,
      reason: "reconciled_interval_missing" as const,
    };
  return {
    status: "candidate" as const,
    reason: "independent_rate_reconciliation_required" as const,
    aggregate,
  };
}
