import type { Pool } from "pg";
import {
  FLOW_CALCULATION_VERSION,
  aggregateNativeFlows,
  classifyProtocolTransactions,
  summarizeFlowParticipants,
  type ProtocolEventInput,
} from "./economic-events";
import { verifyCoverage } from "@/indexer/status";
import { hyperevmProtocol } from "@/protocol/hyperevm";
import { savingsChainAdapters } from "@/protocol/savings-chains";

interface ProtocolEventRow {
  id: string;
  chain_id: number;
  block_number: string;
  block_timestamp: Date;
  transaction_hash: string;
  log_index: number;
  contract_role: string;
  event_name: string;
  payload: unknown;
}

export interface RebuildFlowAnalyticsOptions {
  pool: Pool;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  chainId?: number;
  manifestVersion?: string;
  calculationVersion?: string;
}

export async function rebuildFlowAnalytics(
  options: RebuildFlowAnalyticsOptions,
) {
  const chainId = options.chainId ?? hyperevmProtocol.chainId;
  const coverage = await verifyCoverage(
    options.pool,
    options.scope,
    options.fromBlock,
    options.toBlock,
    chainId,
  );
  if (!coverage.complete)
    return {
      status: "unavailable" as const,
      reason: "coverage_incomplete" as const,
      coverage,
    };

  const manifestVersion =
    options.manifestVersion ??
    savingsChainAdapters.find((adapter) => adapter.chainId === chainId)
      ?.manifestVersion ??
    hyperevmProtocol.manifestVersion;
  const calculationVersion =
    options.calculationVersion ?? FLOW_CALCULATION_VERSION;
  const rows = await options.pool.query<ProtocolEventRow>(
    `select pe.id, pe.chain_id, pe.block_number, b.timestamp as block_timestamp,
            pe.transaction_hash, pe.log_index, pe.contract_role,
            pe.event_name, pe.payload
       from protocol_events pe
       join blocks b
         on b.chain_id = pe.chain_id and b.number = pe.block_number
      where pe.chain_id = $1 and pe.block_number between $2 and $3
      order by pe.transaction_hash, pe.log_index`,
    [chainId, options.fromBlock.toString(), options.toBlock.toString()],
  );
  const sourceEvents: ProtocolEventInput[] = rows.rows.map((row) => ({
    id: row.id,
    chainId: row.chain_id,
    blockNumber: row.block_number,
    blockTimestamp: new Date(row.block_timestamp),
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    contractRole: row.contract_role,
    eventName: row.event_name,
    payload: row.payload,
  }));
  const economicEvents = classifyProtocolTransactions(sourceEvents);
  const aggregates = [
    ...aggregateNativeFlows(economicEvents, "hour"),
    ...aggregateNativeFlows(economicEvents, "day"),
  ];
  const participants = summarizeFlowParticipants(economicEvents);

  const database = await options.pool.connect();
  try {
    await database.query("begin");
    await database.query(
      `delete from flow_aggregates
        where chain_id = $1 and source_from_block = $2 and source_to_block = $3
          and manifest_version = $4 and calculation_version = $5`,
      [
        chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
        manifestVersion,
        calculationVersion,
      ],
    );

    const batchSize = 500;
    for (let offset = 0; offset < economicEvents.length; offset += batchSize) {
      const batch = economicEvents.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const tuples = batch.map((event, index) => {
        const base = index * 15;
        values.push(
          event.id,
          event.chainId,
          event.blockNumber,
          event.transactionHash,
          event.logIndex,
          event.classification,
          event.amountBaseUnits,
          event.assetAddress,
          event.primaryParticipant,
          event.secondaryParticipant,
          JSON.stringify({
            eventCount: event.transactionEventCount,
            eventNames: event.transactionEventNames,
          }),
          options.fromBlock.toString(),
          options.toBlock.toString(),
          manifestVersion,
          calculationVersion,
        );
        return `(${Array.from({ length: 15 }, (_, position) => `$${base + position + 1}`).join(",")})`;
      });
      await database.query(
        `insert into economic_events
          (protocol_event_id, chain_id, block_number, transaction_hash,
           log_index, classification, amount_base_units, asset_address,
           primary_participant, secondary_participant, transaction_context,
           source_from_block, source_to_block, manifest_version,
           calculation_version)
         values ${tuples.join(",")}
         on conflict (protocol_event_id) do update set
           classification = excluded.classification,
           amount_base_units = excluded.amount_base_units,
           asset_address = excluded.asset_address,
           primary_participant = excluded.primary_participant,
           secondary_participant = excluded.secondary_participant,
           transaction_context = excluded.transaction_context,
           source_from_block = excluded.source_from_block,
           source_to_block = excluded.source_to_block,
           manifest_version = excluded.manifest_version,
           calculation_version = excluded.calculation_version,
           created_at = now()`,
        values,
      );
    }

    for (let offset = 0; offset < aggregates.length; offset += batchSize) {
      const batch = aggregates.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const tuples = batch.map((aggregate, index) => {
        const base = index * 11;
        values.push(
          chainId,
          aggregate.granularity,
          aggregate.bucketStart,
          aggregate.metric,
          aggregate.amountBaseUnits,
          aggregate.eventCount,
          aggregate.uniqueParticipants,
          options.fromBlock.toString(),
          options.toBlock.toString(),
          manifestVersion,
          calculationVersion,
        );
        return `(${Array.from({ length: 11 }, (_, position) => `$${base + position + 1}`).join(",")})`;
      });
      await database.query(
        `insert into flow_aggregates
          (chain_id, granularity, bucket_start, metric, amount_base_units,
           event_count, unique_participants, source_from_block,
           source_to_block, manifest_version, calculation_version)
         values ${tuples.join(",")}`,
        values,
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }

  return {
    status: "candidate" as const,
    reason: "manifest_owner_review_required" as const,
    coverage,
    sourceEvents: sourceEvents.length,
    economicEvents: economicEvents.length,
    aggregates: aggregates.length,
    participants,
    manifestVersion,
    calculationVersion,
  };
}
