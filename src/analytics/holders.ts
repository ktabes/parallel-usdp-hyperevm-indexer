import type { Pool } from "pg";

import { verifyCoverage } from "@/indexer/status";
import type { ParallelAssetId } from "@/protocol/assets";
import type { SavingsChainAdapter } from "@/protocol/savings-chains";

export const HOLDER_CALCULATION_VERSION = "parallel-holder-replay-v1";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface TransferReplayEvent {
  assetId: ParallelAssetId;
  blockNumber: bigint;
  blockTimestamp: Date;
  logIndex: number;
  from: string;
  to: string;
  value: bigint;
}

export interface ReplayedHolderBalance {
  assetId: ParallelAssetId;
  holderAddress: string;
  balance: bigint;
  firstPositiveBlock: bigint | null;
  lastChangedBlock: bigint;
}

export interface ReplayedAssetActivity {
  assetId: ParallelAssetId;
  windowStart: Date;
  windowEnd: Date;
  transferVolume: bigint;
  mintedVolume: bigint;
  burnedVolume: bigint;
  transferCount: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  uniqueParticipants: number;
  newHolders: number;
  activeHolders: number;
}

function normalizedAddress(value: string) {
  const address = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address))
    throw new Error(`Invalid transfer address: ${value}`);
  return address;
}

export function replayHolderTransfers(
  events: readonly TransferReplayEvent[],
  fallbackWindow: { start: Date; end: Date },
) {
  const states = new Map<
    string,
    {
      assetId: ParallelAssetId;
      holderAddress: string;
      balance: bigint;
      firstPositiveBlock: bigint | null;
      lastChangedBlock: bigint;
    }
  >();
  const metrics = new Map<
    ParallelAssetId,
    {
      transferVolume: bigint;
      mintedVolume: bigint;
      burnedVolume: bigint;
      transferCount: number;
      senders: Set<string>;
      receivers: Set<string>;
      participants: Set<string>;
      newHolders: number;
      windowStart: Date;
      windowEnd: Date;
    }
  >();
  const ordered = [...events].sort(
    (left, right) =>
      Number(left.blockNumber - right.blockNumber) ||
      left.logIndex - right.logIndex,
  );

  for (const event of ordered) {
    if (event.value < 0n) throw new Error("Transfer value cannot be negative");
    const from = normalizedAddress(event.from);
    const to = normalizedAddress(event.to);
    const metric = metrics.get(event.assetId) ?? {
      transferVolume: 0n,
      mintedVolume: 0n,
      burnedVolume: 0n,
      transferCount: 0,
      senders: new Set<string>(),
      receivers: new Set<string>(),
      participants: new Set<string>(),
      newHolders: 0,
      windowStart: event.blockTimestamp,
      windowEnd: event.blockTimestamp,
    };
    if (event.blockTimestamp < metric.windowStart)
      metric.windowStart = event.blockTimestamp;
    if (event.blockTimestamp > metric.windowEnd)
      metric.windowEnd = event.blockTimestamp;

    const update = (holderAddress: string, delta: bigint) => {
      if (holderAddress === ZERO_ADDRESS) return;
      const key = `${event.assetId}:${holderAddress}`;
      const state = states.get(key) ?? {
        assetId: event.assetId,
        holderAddress,
        balance: 0n,
        firstPositiveBlock: null,
        lastChangedBlock: event.blockNumber,
      };
      const nextBalance = state.balance + delta;
      if (nextBalance < 0n)
        throw new Error(
          `${event.assetId} holder ${holderAddress} became negative at block ${event.blockNumber}`,
        );
      if (state.firstPositiveBlock === null && nextBalance > 0n) {
        state.firstPositiveBlock = event.blockNumber;
        metric.newHolders += 1;
      }
      state.balance = nextBalance;
      state.lastChangedBlock = event.blockNumber;
      states.set(key, state);
    };

    update(from, -event.value);
    update(to, event.value);
    if (from === ZERO_ADDRESS) metric.mintedVolume += event.value;
    else {
      metric.senders.add(from);
      metric.participants.add(from);
    }
    if (to === ZERO_ADDRESS) metric.burnedVolume += event.value;
    else {
      metric.receivers.add(to);
      metric.participants.add(to);
    }
    if (from !== ZERO_ADDRESS && to !== ZERO_ADDRESS) {
      metric.transferVolume += event.value;
      metric.transferCount += 1;
    }
    metrics.set(event.assetId, metric);
  }

  const balances = [...states.values()].sort(
    (left, right) =>
      left.assetId.localeCompare(right.assetId) ||
      left.holderAddress.localeCompare(right.holderAddress),
  );
  const activity = (["usdp", "susdp"] as const).map((assetId) => {
    const metric = metrics.get(assetId);
    const assetBalances = balances.filter((row) => row.assetId === assetId);
    return {
      assetId,
      windowStart: metric?.windowStart ?? fallbackWindow.start,
      windowEnd: metric?.windowEnd ?? fallbackWindow.end,
      transferVolume: metric?.transferVolume ?? 0n,
      mintedVolume: metric?.mintedVolume ?? 0n,
      burnedVolume: metric?.burnedVolume ?? 0n,
      transferCount: metric?.transferCount ?? 0,
      uniqueSenders: metric?.senders.size ?? 0,
      uniqueReceivers: metric?.receivers.size ?? 0,
      uniqueParticipants: metric?.participants.size ?? 0,
      newHolders: metric?.newHolders ?? 0,
      activeHolders: assetBalances.filter((row) => row.balance > 0n).length,
    } satisfies ReplayedAssetActivity;
  });
  return { balances, activity };
}

interface TransferRow {
  asset_id: ParallelAssetId;
  block_number: string;
  block_timestamp: Date;
  log_index: number;
  from_address: string;
  to_address: string;
  value: string;
}

export interface RebuildHolderLedgerOptions {
  pool: Pool;
  adapter: SavingsChainAdapter;
  scope: string;
  fromBlock: bigint;
  toBlock: bigint;
  calculationVersion?: string;
}

export async function rebuildHolderLedger(options: RebuildHolderLedgerOptions) {
  const coverage = await verifyCoverage(
    options.pool,
    options.scope,
    options.fromBlock,
    options.toBlock,
    options.adapter.chainId,
  );
  if (!coverage.complete)
    return {
      status: "unavailable" as const,
      reason: "lifetime_coverage_incomplete" as const,
      coverage,
    };
  const [transfers, boundaries] = await Promise.all([
    options.pool.query<TransferRow>(
      `select case when contract_role = 'usdp-token' then 'usdp'
                   else 'susdp' end as asset_id,
              event.block_number, block.timestamp as block_timestamp,
              event.log_index, lower(event.payload->>'from') as from_address,
              lower(event.payload->>'to') as to_address,
              event.payload->>'value' as value
         from protocol_events event
         join blocks block on block.chain_id = event.chain_id
                          and block.number = event.block_number
        where event.chain_id = $1
          and event.block_number >= $2 and event.block_number <= $3
          and event.event_name = 'Transfer'
          and event.contract_role in ('usdp-token','susdp-savings')
        order by event.block_number, event.log_index`,
      [
        options.adapter.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
      ],
    ),
    options.pool.query<{ number: string; timestamp: Date }>(
      `select number, timestamp from blocks
        where chain_id = $1 and number in ($2,$3) order by number`,
      [
        options.adapter.chainId,
        options.fromBlock.toString(),
        options.toBlock.toString(),
      ],
    ),
  ]);
  const boundaryByBlock = new Map(
    boundaries.rows.map((row) => [row.number, row.timestamp]),
  );
  const replay = replayHolderTransfers(
    transfers.rows.map((row) => ({
      assetId: row.asset_id,
      blockNumber: BigInt(row.block_number),
      blockTimestamp: row.block_timestamp,
      logIndex: row.log_index,
      from: row.from_address,
      to: row.to_address,
      value: BigInt(row.value),
    })),
    {
      start: boundaryByBlock.get(options.fromBlock.toString()) ?? new Date(0),
      end: boundaryByBlock.get(options.toBlock.toString()) ?? new Date(0),
    },
  );
  const calculationVersion =
    options.calculationVersion ?? HOLDER_CALCULATION_VERSION;
  const database = await options.pool.connect();
  try {
    await database.query("begin");
    const batchSize = 500;
    for (let offset = 0; offset < replay.balances.length; offset += batchSize) {
      const batch = replay.balances.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const tuples = batch.map((row, index) => {
        const base = index * 12;
        values.push(
          options.adapter.chainId,
          row.assetId,
          row.holderAddress,
          row.balance.toString(),
          row.firstPositiveBlock?.toString() ?? null,
          row.lastChangedBlock.toString(),
          options.scope,
          options.fromBlock.toString(),
          options.toBlock.toString(),
          options.adapter.manifestVersion,
          calculationVersion,
          true,
        );
        return `(${Array.from({ length: 12 }, (_, position) => `$${base + position + 1}`).join(",")})`;
      });
      await database.query(
        `insert into holder_balances
          (chain_id, asset_id, holder_address, balance, first_positive_block,
           last_changed_block, source_scope, source_from_block, source_to_block,
           manifest_version, calculation_version, history_complete)
         values ${tuples.join(",")}
         on conflict (chain_id, source_scope, asset_id, holder_address)
         do update set balance = excluded.balance,
           first_positive_block = excluded.first_positive_block,
           last_changed_block = excluded.last_changed_block,
           source_from_block = excluded.source_from_block,
           source_to_block = excluded.source_to_block,
           manifest_version = excluded.manifest_version,
           calculation_version = excluded.calculation_version,
           history_complete = excluded.history_complete,
           updated_at = now()`,
        values,
      );
    }
    for (const activity of replay.activity)
      await database.query(
        `insert into asset_activity_aggregates
          (chain_id, asset_id, window_start, window_end, transfer_volume,
           minted_volume, burned_volume, transfer_count, unique_senders,
           unique_receivers, unique_participants, new_holders, active_holders,
           source_scope, source_from_block, source_to_block, history_complete,
           manifest_version, calculation_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18)
         on conflict (chain_id, asset_id, source_scope, source_from_block,
                      source_to_block, calculation_version)
         do update set window_start = excluded.window_start,
           window_end = excluded.window_end,
           transfer_volume = excluded.transfer_volume,
           minted_volume = excluded.minted_volume,
           burned_volume = excluded.burned_volume,
           transfer_count = excluded.transfer_count,
           unique_senders = excluded.unique_senders,
           unique_receivers = excluded.unique_receivers,
           unique_participants = excluded.unique_participants,
           new_holders = excluded.new_holders,
           active_holders = excluded.active_holders,
           history_complete = excluded.history_complete,
           manifest_version = excluded.manifest_version`,
        [
          options.adapter.chainId,
          activity.assetId,
          activity.windowStart,
          activity.windowEnd,
          activity.transferVolume.toString(),
          activity.mintedVolume.toString(),
          activity.burnedVolume.toString(),
          activity.transferCount,
          activity.uniqueSenders,
          activity.uniqueReceivers,
          activity.uniqueParticipants,
          activity.newHolders,
          activity.activeHolders,
          options.scope,
          options.fromBlock.toString(),
          options.toBlock.toString(),
          options.adapter.manifestVersion,
          calculationVersion,
        ],
      );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
  return {
    status: "complete" as const,
    coverage,
    chainId: options.adapter.chainId,
    chainSlug: options.adapter.chainSlug,
    scope: options.scope,
    fromBlock: options.fromBlock.toString(),
    toBlock: options.toBlock.toString(),
    transferEvents: transfers.rows.length,
    holderRows: replay.balances.length,
    activity: replay.activity.map((item) => ({
      ...item,
      transferVolume: item.transferVolume.toString(),
      mintedVolume: item.mintedVolume.toString(),
      burnedVolume: item.burnedVolume.toString(),
    })),
    calculationVersion,
  };
}
