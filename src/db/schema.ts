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
