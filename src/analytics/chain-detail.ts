import type { Pool } from "pg";
import type { LifetimeDashboardRow } from "./dashboard-readiness";

export interface ChainHolderRow {
  assetId: "usdp" | "susdp";
  holderAddress: string;
  balance: string;
  firstPositiveBlock: string | null;
  firstPositiveAt: string | null;
  lastChangedBlock: string;
  lastChangedAt: string | null;
}

interface HolderDatabaseRow {
  asset_id: "usdp" | "susdp";
  holder_address: string;
  balance: string;
  first_positive_block: string | null;
  first_positive_at: Date | null;
  last_changed_block: string;
  last_changed_at: Date | null;
}

export async function readChainHolders(
  pool: Pool,
  lifetime: LifetimeDashboardRow | undefined,
) {
  if (!lifetime || lifetime.publicationStatus !== "published")
    return {
      status: "unavailable" as const,
      reason: "complete_holder_replay_not_available" as const,
      rows: [] as ChainHolderRow[],
    };

  const result = await pool.query<HolderDatabaseRow>(
    `select hb.asset_id, hb.holder_address, hb.balance,
            hb.first_positive_block::text,
            first_block.timestamp as first_positive_at,
            hb.last_changed_block::text,
            last_block.timestamp as last_changed_at
       from holder_balances hb
       left join blocks first_block
         on first_block.chain_id = hb.chain_id
        and first_block.number = hb.first_positive_block
       left join blocks last_block
         on last_block.chain_id = hb.chain_id
        and last_block.number = hb.last_changed_block
      where hb.chain_id = $1 and hb.source_scope = $2
        and hb.history_complete and hb.balance <> '0'
      order by hb.asset_id, hb.balance::numeric desc, hb.holder_address`,
    [lifetime.chainId, lifetime.scope],
  );

  return {
    status: "complete" as const,
    reason: null,
    rows: result.rows.map((row) => ({
      assetId: row.asset_id,
      holderAddress: row.holder_address,
      balance: row.balance,
      firstPositiveBlock: row.first_positive_block,
      firstPositiveAt: row.first_positive_at?.toISOString() ?? null,
      lastChangedBlock: row.last_changed_block,
      lastChangedAt: row.last_changed_at?.toISOString() ?? null,
    })),
  };
}
