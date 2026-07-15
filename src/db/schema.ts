import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const contractManifests = pgTable(
  "contract_manifests",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    manifestBlock: bigint("manifest_block", { mode: "bigint" }).notNull(),
    manifestBlockHash: text("manifest_block_hash").notNull(),
    status: text("status").notNull().default("candidate"),
    payload: jsonb("payload").notNull(),
    createdAt,
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "contract_manifests_status_check",
      sql`${table.status} in ('candidate', 'approved', 'superseded')`,
    ),
    uniqueIndex("contract_manifests_chain_block_unique").on(
      table.chainId,
      table.manifestBlock,
    ),
  ],
);

export const contractEras = pgTable(
  "contract_eras",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    manifestId: text("manifest_id")
      .notNull()
      .references(() => contractManifests.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    proxyAddress: text("proxy_address").notNull(),
    implementationAddress: text("implementation_address"),
    abiSourceCommit: text("abi_source_commit").notNull(),
    startBlock: bigint("start_block", { mode: "bigint" }).notNull(),
    endBlock: bigint("end_block", { mode: "bigint" }),
    decoderVersion: text("decoder_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("contract_eras_manifest_role_start_unique").on(
      table.manifestId,
      table.role,
      table.startBlock,
    ),
    index("contract_eras_address_range_idx").on(
      table.proxyAddress,
      table.startBlock,
      table.endBlock,
    ),
    check(
      "contract_eras_address_check",
      sql`${table.proxyAddress} ~ '^0x[0-9a-f]{40}$'`,
    ),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    chainId: integer("chain_id").notNull(),
    number: bigint("number", { mode: "bigint" }).notNull(),
    hash: text("hash").notNull(),
    parentHash: text("parent_hash").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    finalized: boolean("finalized").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.number] }),
    uniqueIndex("blocks_chain_hash_unique").on(table.chainId, table.hash),
    check("blocks_hash_check", sql`${table.hash} ~ '^0x[0-9a-f]{64}$'`),
  ],
);

export const indexerRuns = pgTable(
  "indexer_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runType: text("run_type").notNull(),
    chainId: integer("chain_id").notNull(),
    fromBlock: bigint("from_block", { mode: "bigint" }),
    toBlock: bigint("to_block", { mode: "bigint" }),
    status: text("status").notNull().default("running"),
    counters: jsonb("counters").notNull().default({}),
    failure: jsonb("failure"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "indexer_runs_status_check",
      sql`${table.status} in ('running', 'completed', 'failed', 'interrupted')`,
    ),
    index("indexer_runs_chain_started_idx").on(table.chainId, table.startedAt),
  ],
);

export const rawLogs = pgTable(
  "raw_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    transactionIndex: integer("transaction_index").notNull(),
    logIndex: integer("log_index").notNull(),
    contractAddress: text("contract_address").notNull(),
    topics: jsonb("topics").$type<string[]>().notNull(),
    data: text("data").notNull(),
    removed: boolean("removed").notNull().default(false),
    decoderVersion: text("decoder_version").notNull(),
    runId: uuid("run_id").references(() => indexerRuns.id, {
      onDelete: "set null",
    }),
    insertedAt: timestamp("inserted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.chainId, table.blockNumber],
      foreignColumns: [blocks.chainId, blocks.number],
      name: "raw_logs_block_fk",
    }).onDelete("restrict"),
    uniqueIndex("raw_logs_chain_tx_log_unique").on(
      table.chainId,
      table.transactionHash,
      table.logIndex,
    ),
    index("raw_logs_chain_block_idx").on(table.chainId, table.blockNumber),
    index("raw_logs_contract_block_idx").on(
      table.contractAddress,
      table.blockNumber,
    ),
    check(
      "raw_logs_contract_address_check",
      sql`${table.contractAddress} ~ '^0x[0-9a-f]{40}$'`,
    ),
  ],
);

export const protocolEvents = pgTable(
  "protocol_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    rawLogId: bigint("raw_log_id", { mode: "bigint" })
      .notNull()
      .references(() => rawLogs.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    contractRole: text("contract_role").notNull(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").notNull(),
    decoderVersion: text("decoder_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("protocol_events_raw_log_unique").on(table.rawLogId),
    index("protocol_events_chain_block_idx").on(
      table.chainId,
      table.blockNumber,
    ),
    index("protocol_events_name_block_idx").on(
      table.eventName,
      table.blockNumber,
    ),
  ],
);

export const indexerCoverage = pgTable(
  "indexer_coverage",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    scope: text("scope").notNull(),
    fromBlock: bigint("from_block", { mode: "bigint" }).notNull(),
    toBlock: bigint("to_block", { mode: "bigint" }).notNull(),
    runId: uuid("run_id").references(() => indexerRuns.id, {
      onDelete: "set null",
    }),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("indexer_coverage_scope_range_unique").on(
      table.chainId,
      table.scope,
      table.fromBlock,
      table.toBlock,
    ),
    index("indexer_coverage_scope_from_idx").on(
      table.chainId,
      table.scope,
      table.fromBlock,
    ),
    check(
      "indexer_coverage_range_check",
      sql`${table.toBlock} >= ${table.fromBlock}`,
    ),
  ],
);

export const indexerCheckpoints = pgTable(
  "indexer_checkpoints",
  {
    chainId: integer("chain_id").notNull(),
    scope: text("scope").notNull(),
    nextBlock: bigint("next_block", { mode: "bigint" }).notNull(),
    lastCompletedBlock: bigint("last_completed_block", { mode: "bigint" }),
    lastCompletedBlockHash: text("last_completed_block_hash"),
    manifestId: text("manifest_id").references(() => contractManifests.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.scope] })],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    assetAddress: text("asset_address").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    priceUsdAtomic: text("price_usd_atomic").notNull(),
    priceDecimals: integer("price_decimals").notNull(),
    source: text("source").notNull(),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    stale: boolean("stale").notNull().default(false),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.chainId, table.blockNumber],
      foreignColumns: [blocks.chainId, blocks.number],
      name: "price_observations_block_fk",
    }).onDelete("restrict"),
    uniqueIndex("price_observations_asset_block_source_unique").on(
      table.chainId,
      table.assetAddress,
      table.blockNumber,
      table.source,
    ),
    check(
      "price_observations_decimals_check",
      sql`${table.priceDecimals} between 0 and 36`,
    ),
  ],
);

export const economicEvents = pgTable(
  "economic_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    protocolEventId: bigint("protocol_event_id", { mode: "bigint" })
      .notNull()
      .references(() => protocolEvents.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    classification: text("classification").notNull(),
    amountBaseUnits: text("amount_base_units"),
    assetAddress: text("asset_address"),
    primaryParticipant: text("primary_participant"),
    secondaryParticipant: text("secondary_participant"),
    transactionContext: jsonb("transaction_context").notNull().default({}),
    sourceFromBlock: bigint("source_from_block", { mode: "bigint" }).notNull(),
    sourceToBlock: bigint("source_to_block", { mode: "bigint" }).notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("economic_events_protocol_event_unique").on(
      table.protocolEventId,
    ),
    index("economic_events_chain_block_idx").on(
      table.chainId,
      table.blockNumber,
    ),
    index("economic_events_classification_block_idx").on(
      table.classification,
      table.blockNumber,
    ),
    check(
      "economic_events_source_range_check",
      sql`${table.sourceToBlock} >= ${table.sourceFromBlock}`,
    ),
    check(
      "economic_events_amount_check",
      sql`${table.amountBaseUnits} is null or ${table.amountBaseUnits} ~ '^[0-9]+$'`,
    ),
  ],
);

export const flowAggregates = pgTable(
  "flow_aggregates",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    granularity: text("granularity").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    metric: text("metric").notNull(),
    amountBaseUnits: text("amount_base_units").notNull(),
    eventCount: integer("event_count").notNull(),
    uniqueParticipants: integer("unique_participants").notNull(),
    sourceFromBlock: bigint("source_from_block", { mode: "bigint" }).notNull(),
    sourceToBlock: bigint("source_to_block", { mode: "bigint" }).notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("flow_aggregates_provenance_bucket_unique").on(
      table.chainId,
      table.granularity,
      table.bucketStart,
      table.metric,
      table.sourceFromBlock,
      table.sourceToBlock,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("flow_aggregates_chain_bucket_idx").on(
      table.chainId,
      table.bucketStart,
    ),
    check(
      "flow_aggregates_granularity_check",
      sql`${table.granularity} in ('hour', 'day')`,
    ),
    check(
      "flow_aggregates_amount_check",
      sql`${table.amountBaseUnits} ~ '^[0-9]+$'`,
    ),
    check(
      "flow_aggregates_source_range_check",
      sql`${table.sourceToBlock} >= ${table.sourceFromBlock}`,
    ),
    check(
      "flow_aggregates_counts_check",
      sql`${table.eventCount} >= 0 and ${table.uniqueParticipants} >= 0`,
    ),
  ],
);

export const assetDeployments = pgTable(
  "asset_deployments",
  {
    assetId: text("asset_id").notNull(),
    chainId: integer("chain_id").notNull(),
    chainSlug: text("chain_slug").notNull(),
    chainName: text("chain_name").notNull(),
    contractAddress: text("contract_address").notNull(),
    deploymentTier: text("deployment_tier").notNull(),
    adapterStatus: text("adapter_status").notNull(),
    officialSource: text("official_source").notNull(),
    sourceCheckedAt: timestamp("source_checked_at", {
      withTimezone: true,
    }).notNull(),
    createdAt,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.chainId] }),
    uniqueIndex("asset_deployments_chain_address_unique").on(
      table.chainId,
      table.contractAddress,
    ),
    check(
      "asset_deployments_asset_check",
      sql`${table.assetId} in ('usdp', 'susdp')`,
    ),
    check(
      "asset_deployments_tier_check",
      sql`${table.deploymentTier} in ('savings', 'distribution')`,
    ),
    check(
      "asset_deployments_status_check",
      sql`${table.adapterStatus} in ('planned', 'verified', 'disabled')`,
    ),
    check(
      "asset_deployments_address_check",
      sql`${table.contractAddress} ~ '^0x[0-9a-f]{40}$'`,
    ),
  ],
);

export const assetChainSnapshots = pgTable(
  "asset_chain_snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    assetId: text("asset_id").notNull(),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash").notNull(),
    blockTimestamp: timestamp("block_timestamp", {
      withTimezone: true,
    }).notNull(),
    finalized: boolean("finalized").notNull(),
    totalSupply: text("total_supply").notNull(),
    snapshotStatus: text("snapshot_status").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.assetId, table.chainId],
      foreignColumns: [assetDeployments.assetId, assetDeployments.chainId],
      name: "asset_chain_snapshots_deployment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.chainId, table.blockNumber],
      foreignColumns: [blocks.chainId, blocks.number],
      name: "asset_chain_snapshots_block_fk",
    }).onDelete("restrict"),
    uniqueIndex("asset_chain_snapshots_provenance_unique").on(
      table.assetId,
      table.chainId,
      table.blockNumber,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("asset_chain_snapshots_latest_idx").on(
      table.assetId,
      table.chainId,
      table.blockNumber,
    ),
    check(
      "asset_chain_snapshots_status_check",
      sql`${table.snapshotStatus} in ('candidate', 'verified', 'invalid')`,
    ),
    check(
      "asset_chain_snapshots_supply_check",
      sql`${table.totalSupply} ~ '^[0-9]+$'`,
    ),
  ],
);

export const savingsChainSnapshots = pgTable(
  "savings_chain_snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash").notNull(),
    blockTimestamp: timestamp("block_timestamp", {
      withTimezone: true,
    }).notNull(),
    usdpSnapshotId: bigint("usdp_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => assetChainSnapshots.id, { onDelete: "restrict" }),
    susdpSnapshotId: bigint("susdp_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => assetChainSnapshots.id, { onDelete: "restrict" }),
    susdpTotalAssets: text("susdp_total_assets").notNull(),
    susdpActualAssets: text("susdp_actual_assets").notNull(),
    susdpPendingYield: text("susdp_pending_yield").notNull(),
    susdpSharePriceUsdp: text("susdp_share_price_usdp").notNull(),
    susdpRate: text("susdp_rate").notNull(),
    susdpLastUpdate: bigint("susdp_last_update", { mode: "bigint" }).notNull(),
    susdpEstimatedApy: text("susdp_estimated_apy").notNull(),
    susdpMaxRate: text("susdp_max_rate").notNull(),
    susdpPauseState: integer("susdp_pause_state").notNull(),
    usdpImplementation: text("usdp_implementation").notNull(),
    susdpImplementation: text("susdp_implementation").notNull(),
    assetRelationshipVerified: boolean("asset_relationship_verified").notNull(),
    snapshotStatus: text("snapshot_status").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.chainId, table.blockNumber],
      foreignColumns: [blocks.chainId, blocks.number],
      name: "savings_chain_snapshots_block_fk",
    }).onDelete("restrict"),
    uniqueIndex("savings_chain_snapshots_provenance_unique").on(
      table.chainId,
      table.blockNumber,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("savings_chain_snapshots_latest_idx").on(
      table.chainId,
      table.blockNumber,
    ),
    check(
      "savings_chain_snapshots_status_check",
      sql`${table.snapshotStatus} in ('candidate', 'verified', 'invalid')`,
    ),
    check(
      "savings_chain_snapshots_amounts_check",
      sql`${table.susdpTotalAssets} ~ '^[0-9]+$'
        and ${table.susdpActualAssets} ~ '^[0-9]+$'
        and ${table.susdpPendingYield} ~ '^[0-9]+$'
        and ${table.susdpSharePriceUsdp} ~ '^[0-9]+$'
        and ${table.susdpRate} ~ '^[0-9]+$'
        and ${table.susdpEstimatedApy} ~ '^[0-9]+$'
        and ${table.susdpMaxRate} ~ '^[0-9]+$'`,
    ),
    check(
      "savings_chain_snapshots_pause_check",
      sql`${table.susdpPauseState} between 0 and 255`,
    ),
    check(
      "savings_chain_snapshots_usdp_impl_check",
      sql`${table.usdpImplementation} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "savings_chain_snapshots_susdp_impl_check",
      sql`${table.susdpImplementation} ~ '^0x[0-9a-f]{40}$'`,
    ),
  ],
);

export const globalSavingsSnapshots = pgTable(
  "global_savings_snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    expectedChainCount: integer("expected_chain_count").notNull(),
    includedChainCount: integer("included_chain_count").notNull(),
    coverageStatus: text("coverage_status").notNull(),
    usdpSupplyOnSavingsChains: text("usdp_supply_on_savings_chains").notNull(),
    susdpTotalAssets: text("susdp_total_assets").notNull(),
    susdpTotalSupply: text("susdp_total_supply").notNull(),
    susdpWeightedEstimatedApy: text("susdp_weighted_estimated_apy"),
    oldestComponentTimestamp: timestamp("oldest_component_timestamp", {
      withTimezone: true,
    }),
    newestComponentTimestamp: timestamp("newest_component_timestamp", {
      withTimezone: true,
    }),
    maximumComponentAgeSeconds: bigint("maximum_component_age_seconds", {
      mode: "bigint",
    }),
    includedChainIds: jsonb("included_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    missingChainIds: jsonb("missing_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    staleChainIds: jsonb("stale_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    index("global_savings_snapshots_as_of_idx").on(table.asOf),
    check(
      "global_savings_snapshots_status_check",
      sql`${table.coverageStatus} in ('complete', 'partial', 'unavailable')`,
    ),
    check(
      "global_savings_snapshots_counts_check",
      sql`${table.expectedChainCount} >= 0
        and ${table.includedChainCount} >= 0
        and ${table.includedChainCount} <= ${table.expectedChainCount}`,
    ),
    check(
      "global_savings_snapshots_amounts_check",
      sql`${table.usdpSupplyOnSavingsChains} ~ '^[0-9]+$'
        and ${table.susdpTotalAssets} ~ '^[0-9]+$'
        and ${table.susdpTotalSupply} ~ '^[0-9]+$'
        and (${table.susdpWeightedEstimatedApy} is null
          or ${table.susdpWeightedEstimatedApy} ~ '^[0-9]+$')`,
    ),
  ],
);

export const globalSavingsSnapshotComponents = pgTable(
  "global_savings_snapshot_components",
  {
    globalSnapshotId: bigint("global_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => globalSavingsSnapshots.id, { onDelete: "cascade" }),
    savingsSnapshotId: bigint("savings_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => savingsChainSnapshots.id, { onDelete: "restrict" }),
    chainId: integer("chain_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.globalSnapshotId, table.savingsSnapshotId],
    }),
    uniqueIndex("global_savings_components_chain_unique").on(
      table.globalSnapshotId,
      table.chainId,
    ),
  ],
);

export const vaultSnapshots = pgTable(
  "vault_snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash").notNull(),
    blockTimestamp: timestamp("block_timestamp", {
      withTimezone: true,
    }).notNull(),
    finalized: boolean("finalized").notNull(),
    usdpTotalSupply: text("usdp_total_supply").notNull(),
    susdpTotalAssets: text("susdp_total_assets").notNull(),
    susdpActualAssets: text("susdp_actual_assets").notNull(),
    susdpTotalSupply: text("susdp_total_supply").notNull(),
    susdpPendingYield: text("susdp_pending_yield").notNull(),
    susdpSharePriceUsdp: text("susdp_share_price_usdp").notNull(),
    susdpRate: text("susdp_rate").notNull(),
    susdpLastUpdate: bigint("susdp_last_update", { mode: "bigint" }).notNull(),
    susdpEstimatedApr: text("susdp_estimated_apr").notNull(),
    susdpMaxRate: text("susdp_max_rate").notNull(),
    susdpPauseState: integer("susdp_pause_state").notNull(),
    usdpImplementation: text("usdp_implementation").notNull(),
    susdpImplementation: text("susdp_implementation").notNull(),
    usdpPriceObservationId: bigint("usdp_price_observation_id", {
      mode: "bigint",
    })
      .notNull()
      .references(() => priceObservations.id, { onDelete: "restrict" }),
    susdpPriceObservationId: bigint("susdp_price_observation_id", {
      mode: "bigint",
    })
      .notNull()
      .references(() => priceObservations.id, { onDelete: "restrict" }),
    snapshotStatus: text("snapshot_status").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("vault_snapshots_provenance_block_unique").on(
      table.chainId,
      table.blockNumber,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("vault_snapshots_chain_block_idx").on(
      table.chainId,
      table.blockNumber,
    ),
    check(
      "vault_snapshots_status_check",
      sql`${table.snapshotStatus} in ('candidate', 'verified', 'invalid')`,
    ),
    check(
      "vault_snapshots_amounts_check",
      sql`${table.usdpTotalSupply} ~ '^[0-9]+$'
        and ${table.susdpTotalAssets} ~ '^[0-9]+$'
        and ${table.susdpActualAssets} ~ '^[0-9]+$'
        and ${table.susdpTotalSupply} ~ '^[0-9]+$'
        and ${table.susdpPendingYield} ~ '^[0-9]+$'
        and ${table.susdpSharePriceUsdp} ~ '^[0-9]+$'
        and ${table.susdpRate} ~ '^[0-9]+$'
        and ${table.susdpEstimatedApr} ~ '^[0-9]+$'
        and ${table.susdpMaxRate} ~ '^[0-9]+$'`,
    ),
    check(
      "vault_snapshots_pause_check",
      sql`${table.susdpPauseState} between 0 and 255`,
    ),
  ],
);

export const yieldAggregates = pgTable(
  "yield_aggregates",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    startSnapshotId: bigint("start_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => vaultSnapshots.id, { onDelete: "restrict" }),
    endSnapshotId: bigint("end_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => vaultSnapshots.id, { onDelete: "restrict" }),
    fromBlock: bigint("from_block", { mode: "bigint" }).notNull(),
    toBlock: bigint("to_block", { mode: "bigint" }).notNull(),
    accruedInterest: text("accrued_interest").notNull(),
    pendingYieldAtStart: text("pending_yield_at_start").notNull(),
    pendingYieldAtEnd: text("pending_yield_at_end").notNull(),
    nativeYpo: text("native_ypo").notNull(),
    windowConvention: text("window_convention").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("yield_aggregates_provenance_range_unique").on(
      table.chainId,
      table.fromBlock,
      table.toBlock,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("yield_aggregates_chain_range_idx").on(
      table.chainId,
      table.fromBlock,
      table.toBlock,
    ),
    check(
      "yield_aggregates_range_check",
      sql`${table.toBlock} > ${table.fromBlock}`,
    ),
    check(
      "yield_aggregates_amounts_check",
      sql`${table.accruedInterest} ~ '^[0-9]+$'
        and ${table.pendingYieldAtStart} ~ '^[0-9]+$'
        and ${table.pendingYieldAtEnd} ~ '^[0-9]+$'
        and ${table.nativeYpo} ~ '^[0-9]+$'`,
    ),
  ],
);

export const savingsYieldAggregates = pgTable(
  "savings_yield_aggregates",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    chainId: integer("chain_id").notNull(),
    startSnapshotId: bigint("start_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => savingsChainSnapshots.id, { onDelete: "restrict" }),
    endSnapshotId: bigint("end_snapshot_id", { mode: "bigint" })
      .notNull()
      .references(() => savingsChainSnapshots.id, { onDelete: "restrict" }),
    fromBlock: bigint("from_block", { mode: "bigint" }).notNull(),
    toBlock: bigint("to_block", { mode: "bigint" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    accruedInterest: text("accrued_interest").notNull(),
    pendingYieldAtStart: text("pending_yield_at_start").notNull(),
    pendingYieldAtEnd: text("pending_yield_at_end").notNull(),
    nativeYpo: text("native_ypo").notNull(),
    coverageScope: text("coverage_scope").notNull(),
    windowConvention: text("window_convention").notNull(),
    reconciliationStatus: text("reconciliation_status").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("savings_yield_provenance_range_unique").on(
      table.chainId,
      table.fromBlock,
      table.toBlock,
      table.manifestVersion,
      table.calculationVersion,
    ),
    index("savings_yield_chain_window_idx").on(
      table.chainId,
      table.windowStart,
      table.windowEnd,
    ),
    check(
      "savings_yield_range_check",
      sql`${table.toBlock} > ${table.fromBlock}`,
    ),
    check(
      "savings_yield_window_check",
      sql`${table.windowEnd} > ${table.windowStart}`,
    ),
    check(
      "savings_yield_amounts_check",
      sql`${table.accruedInterest} ~ '^[0-9]+$'
        and ${table.pendingYieldAtStart} ~ '^[0-9]+$'
        and ${table.pendingYieldAtEnd} ~ '^[0-9]+$'
        and ${table.nativeYpo} ~ '^[0-9]+$'`,
    ),
    check(
      "savings_yield_reconciliation_status_check",
      sql`${table.reconciliationStatus} in ('candidate', 'verified', 'invalid')`,
    ),
  ],
);

export const globalSavingsYieldAggregates = pgTable(
  "global_savings_yield_aggregates",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    expectedChainCount: integer("expected_chain_count").notNull(),
    includedChainCount: integer("included_chain_count").notNull(),
    coverageStatus: text("coverage_status").notNull(),
    nativeYpo: text("native_ypo").notNull(),
    includedChainIds: jsonb("included_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    missingChainIds: jsonb("missing_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    unreconciledChainIds: jsonb("unreconciled_chain_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    calculationVersion: text("calculation_version").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("global_savings_yield_window_version_unique").on(
      table.windowStart,
      table.windowEnd,
      table.calculationVersion,
    ),
    index("global_savings_yield_window_idx").on(
      table.windowStart,
      table.windowEnd,
    ),
    check(
      "global_savings_yield_window_check",
      sql`${table.windowEnd} > ${table.windowStart}`,
    ),
    check(
      "global_savings_yield_status_check",
      sql`${table.coverageStatus} in ('complete', 'partial', 'unavailable')`,
    ),
    check(
      "global_savings_yield_counts_check",
      sql`${table.expectedChainCount} >= 0
        and ${table.includedChainCount} >= 0
        and ${table.includedChainCount} <= ${table.expectedChainCount}`,
    ),
    check(
      "global_savings_yield_amount_check",
      sql`${table.nativeYpo} ~ '^[0-9]+$'`,
    ),
  ],
);

export const globalSavingsYieldComponents = pgTable(
  "global_savings_yield_components",
  {
    globalYieldId: bigint("global_yield_id", { mode: "bigint" })
      .notNull()
      .references(() => globalSavingsYieldAggregates.id, {
        onDelete: "cascade",
      }),
    savingsYieldId: bigint("savings_yield_id", { mode: "bigint" })
      .notNull()
      .references(() => savingsYieldAggregates.id, { onDelete: "restrict" }),
    chainId: integer("chain_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.globalYieldId, table.savingsYieldId] }),
    uniqueIndex("global_savings_yield_component_chain_unique").on(
      table.globalYieldId,
      table.chainId,
    ),
  ],
);
