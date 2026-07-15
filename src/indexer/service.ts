import type { Pool, PoolClient } from "pg";
import type { Address, Block, Hex, Log } from "viem";
import { HYPEREVM_CHAIN_ID, hyperevmProtocol } from "@/protocol/hyperevm";
import { hyperevm } from "@/rpc/hyperevm-client";
import { createEvmClient, type EvmClient } from "@/rpc/evm-client";
import type { SavingsChainAdapter } from "@/protocol/savings-chains";
import {
  decodeProtocolLog,
  decoderVersionForAddress,
  isKnownProtocolEventTopic,
} from "./decoder";
import {
  classifyRpcError,
  planBlockRange,
  providerRangeLimit,
  reduceChunkSize,
  retryDelayMs,
  shouldRetryRpcError,
  type BlockRange,
} from "./planner";
import { providerErrorMessage } from "@/rpc/errors";

export const DEFAULT_INDEXER_SCOPE = "parallel-usdp-susdp-seven-day-v1";

const hyperevmAddresses: Address[] = [
  hyperevmProtocol.contracts.usdp.address,
  hyperevmProtocol.contracts.susdp.address,
  hyperevmProtocol.contracts.parallelizer.address,
];

export interface IngestionCounters {
  chunks: number;
  blocksCovered: string;
  logsFetched: number;
  rawLogsInserted: number;
  duplicateRawLogs: number;
  eventsDecoded: number;
  decodeFailures: number;
  rpcRetries: number;
  chunkReductions: number;
}

export interface IngestLogsOptions {
  pool: Pool;
  rpcUrl: string;
  fromBlock: bigint;
  toBlock: bigint;
  finalityLag: number;
  chunkSize: number;
  scope?: string;
  requestIntervalMs?: number;
  maxRetries?: number;
  retryRateLimitsIndefinitely?: boolean;
  anchorEveryChunks?: number;
  fetchConcurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: IngestionProgress) => void;
  adapter?: SavingsChainAdapter;
  addresses?: Address[];
}

export interface IngestionProgress {
  runId?: string;
  status: "noop" | "running" | "completed" | "failed" | "interrupted";
  scope: string;
  requestedFromBlock: string;
  requestedToBlock: string;
  nextBlock: string;
  finalizedHead: string;
  chunkSize: number;
  counters: IngestionCounters;
}

interface CheckpointRow {
  next_block: string;
  last_completed_block: string | null;
  last_completed_block_hash: string | null;
}

interface StoredBlock {
  number: bigint;
  hash: Hex;
  parentHash: Hex;
  timestamp: bigint;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function blankCounters(): IngestionCounters {
  return {
    chunks: 0,
    blocksCovered: "0",
    logsFetched: 0,
    rawLogsInserted: 0,
    duplicateRawLogs: 0,
    eventsDecoded: 0,
    decodeFailures: 0,
    rpcRetries: 0,
    chunkReductions: 0,
  };
}

function asStoredBlock(block: Block): StoredBlock {
  if (block.number === null || !block.hash)
    throw new Error("RPC returned an unmined block");
  return {
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
  };
}

async function fetchLogsWithPolicy(
  client: EvmClient,
  addresses: Address[],
  fromBlock: bigint,
  requestedToBlock: bigint,
  initialChunkSize: number,
  maxRetries: number,
  counters: IngestionCounters,
  retryRateLimitsIndefinitely: boolean,
  signal?: AbortSignal,
) {
  let chunkSize = initialChunkSize;
  let attempt = 0;

  while (true) {
    if (signal?.aborted) throw new Error("Indexer interrupted");
    const range = planBlockRange(fromBlock, requestedToBlock, chunkSize);
    try {
      const logs = await client.getLogs({
        address: addresses,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
      });
      return { range, logs, chunkSize };
    } catch (error) {
      const errorClass = classifyRpcError(error);
      if (errorClass === "range" && chunkSize > 1) {
        const advertisedLimit = providerRangeLimit(error);
        chunkSize = advertisedLimit
          ? Math.min(advertisedLimit, chunkSize - 1)
          : reduceChunkSize(chunkSize);
        counters.chunkReductions += 1;
        attempt = 0;
        continue;
      }
      if (
        shouldRetryRpcError(
          errorClass,
          attempt,
          maxRetries,
          retryRateLimitsIndefinitely,
        )
      ) {
        attempt += 1;
        counters.rpcRetries += 1;
        await wait(retryDelayMs(attempt, errorClass));
        continue;
      }
      throw error;
    }
  }
}

async function insertBlock(
  client: PoolClient,
  chainId: number,
  block: StoredBlock,
) {
  const existing = await client.query<{ hash: string }>(
    `select hash from blocks where chain_id = $1 and number = $2`,
    [chainId, block.number.toString()],
  );
  const existingHash = existing.rows[0]?.hash;
  if (existingHash && existingHash.toLowerCase() !== block.hash.toLowerCase())
    throw new Error(
      `Block hash drift at ${block.number}: stored ${existingHash}, RPC ${block.hash}`,
    );
  await client.query(
    `insert into blocks
      (chain_id, number, hash, parent_hash, timestamp, finalized)
     values ($1, $2, $3, $4, $5, true)
     on conflict (chain_id, number) do nothing`,
    [
      chainId,
      block.number.toString(),
      block.hash.toLowerCase(),
      block.parentHash.toLowerCase(),
      new Date(Number(block.timestamp) * 1_000),
    ],
  );
}

async function persistChunk(
  pool: Pool,
  chainId: number,
  scope: string,
  runId: string,
  range: BlockRange,
  logs: Log[],
  blocksByNumber: Map<bigint, StoredBlock>,
  anchor: StoredBlock | undefined,
  counters: IngestionCounters,
) {
  const database = await pool.connect();
  try {
    await database.query("begin");
    for (const block of blocksByNumber.values())
      await insertBlock(database, chainId, block);
    if (anchor) await insertBlock(database, chainId, anchor);

    for (const log of logs) {
      if (
        log.blockNumber === null ||
        !log.blockHash ||
        !log.transactionHash ||
        log.transactionIndex === null ||
        log.logIndex === null
      )
        throw new Error("RPC returned an incomplete mined log");
      const decoderVersion = decoderVersionForAddress(chainId, log.address);
      const inserted = await database.query<{ id: string }>(
        `insert into raw_logs
          (chain_id, block_number, block_hash, transaction_hash,
           transaction_index, log_index, contract_address, topics, data,
           removed, decoder_version, run_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
         on conflict (chain_id, transaction_hash, log_index) do nothing
         returning id`,
        [
          chainId,
          log.blockNumber.toString(),
          log.blockHash.toLowerCase(),
          log.transactionHash.toLowerCase(),
          Number(log.transactionIndex),
          Number(log.logIndex),
          log.address.toLowerCase(),
          JSON.stringify(log.topics),
          log.data,
          Boolean(log.removed),
          decoderVersion,
          runId,
        ],
      );
      const rawLogId = inserted.rows[0]?.id;
      if (!rawLogId) {
        counters.duplicateRawLogs += 1;
        continue;
      }
      counters.rawLogsInserted += 1;
      const decoded = decodeProtocolLog(chainId, {
        address: log.address,
        data: log.data,
        topics: log.topics as readonly Hex[],
      });
      if (!decoded) {
        if (isKnownProtocolEventTopic(log.topics[0]))
          counters.decodeFailures += 1;
        continue;
      }
      await database.query(
        `insert into protocol_events
          (raw_log_id, chain_id, block_number, transaction_hash, log_index,
           contract_role, event_name, payload, decoder_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         on conflict (raw_log_id) do nothing`,
        [
          rawLogId,
          chainId,
          log.blockNumber.toString(),
          log.transactionHash.toLowerCase(),
          Number(log.logIndex),
          decoded.contractRole,
          decoded.eventName,
          JSON.stringify(decoded.payload),
          decoded.decoderVersion,
        ],
      );
      counters.eventsDecoded += 1;
    }

    await database.query(
      `insert into indexer_coverage
        (chain_id, scope, from_block, to_block, run_id)
       values ($1,$2,$3,$4,$5)
       on conflict (chain_id, scope, from_block, to_block) do nothing`,
      [
        chainId,
        scope,
        range.fromBlock.toString(),
        range.toBlock.toString(),
        runId,
      ],
    );
    await database.query(
      `insert into indexer_checkpoints
        (chain_id, scope, next_block, last_completed_block,
         last_completed_block_hash, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (chain_id, scope) do update set
         next_block = excluded.next_block,
         last_completed_block = coalesce(excluded.last_completed_block, indexer_checkpoints.last_completed_block),
         last_completed_block_hash = coalesce(excluded.last_completed_block_hash, indexer_checkpoints.last_completed_block_hash),
         updated_at = now()`,
      [
        chainId,
        scope,
        (range.toBlock + 1n).toString(),
        anchor?.number.toString() ?? null,
        anchor?.hash.toLowerCase() ?? null,
      ],
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function updateRun(
  pool: Pool,
  runId: string,
  status: "running" | "completed" | "failed" | "interrupted",
  counters: IngestionCounters,
  failure?: unknown,
) {
  await pool.query(
    `update indexer_runs set
       status = $2,
       counters = $3::jsonb,
       failure = $4::jsonb,
       finished_at = case when $2 = 'running' then null else now() end
     where id = $1`,
    [
      runId,
      status,
      JSON.stringify(counters),
      failure === undefined
        ? null
        : JSON.stringify({
            message: providerErrorMessage(failure),
          }),
    ],
  );
}

export async function ingestLogs(
  options: IngestLogsOptions,
): Promise<IngestionProgress> {
  const scope = options.scope ?? DEFAULT_INDEXER_SCOPE;
  const counters = blankCounters();
  const chainId = options.adapter?.chainId ?? HYPEREVM_CHAIN_ID;
  const chain = options.adapter?.chain ?? hyperevm;
  const addresses =
    options.addresses ??
    (options.adapter
      ? [options.adapter.usdp.address, options.adapter.susdp.address]
      : hyperevmAddresses);
  const client = createEvmClient(chain, options.rpcUrl, {
    minRequestIntervalMs: options.requestIntervalMs ?? 650,
    retryCount: 0,
  });
  const finalizedBlock =
    options.adapter?.finality === "rpc-finalized"
      ? await client.getBlock({ blockTag: "finalized" })
      : await client.getBlock({
          blockNumber:
            (await client.getBlockNumber()) - BigInt(options.finalityLag),
        });
  if (finalizedBlock.number === null)
    throw new Error("RPC returned an unmined finalized block");
  const finalizedHead = finalizedBlock.number;
  if (options.toBlock > finalizedHead)
    throw new Error(
      `Requested end block ${options.toBlock} exceeds finalized head ${finalizedHead}`,
    );
  if (options.fromBlock > options.toBlock)
    throw new Error("fromBlock must not exceed toBlock");

  const checkpoint = await options.pool.query<CheckpointRow>(
    `select next_block, last_completed_block, last_completed_block_hash
     from indexer_checkpoints where chain_id = $1 and scope = $2`,
    [chainId, scope],
  );
  const stored = checkpoint.rows[0];
  if (stored?.last_completed_block && stored.last_completed_block_hash) {
    const anchor = await client.getBlock({
      blockNumber: BigInt(stored.last_completed_block),
    });
    if (
      anchor.hash?.toLowerCase() !==
      stored.last_completed_block_hash.toLowerCase()
    )
      throw new Error(
        `Checkpoint hash drift at block ${stored.last_completed_block}`,
      );
  }
  let nextBlock = stored
    ? BigInt(stored.next_block) > options.fromBlock
      ? BigInt(stored.next_block)
      : options.fromBlock
    : options.fromBlock;
  const baseProgress = {
    scope,
    requestedFromBlock: options.fromBlock.toString(),
    requestedToBlock: options.toBlock.toString(),
    finalizedHead: finalizedHead.toString(),
  };
  if (nextBlock > options.toBlock) {
    return {
      ...baseProgress,
      status: "noop",
      nextBlock: nextBlock.toString(),
      chunkSize: options.chunkSize,
      counters,
    };
  }

  const run = await options.pool.query<{ id: string }>(
    `insert into indexer_runs (run_type, chain_id, from_block, to_block)
     values ('backfill', $1, $2, $3) returning id`,
    [chainId, nextBlock.toString(), options.toBlock.toString()],
  );
  const runId = run.rows[0]!.id;
  let activeChunkSize = options.chunkSize;
  const anchorEveryChunks = options.anchorEveryChunks ?? 1_000;

  const progress = (
    status: IngestionProgress["status"],
  ): IngestionProgress => ({
    ...baseProgress,
    runId,
    status,
    nextBlock: nextBlock.toString(),
    chunkSize: activeChunkSize,
    counters: { ...counters },
  });

  try {
    while (nextBlock <= options.toBlock) {
      if (options.signal?.aborted) {
        await updateRun(options.pool, runId, "interrupted", counters);
        return progress("interrupted");
      }
      const plannedRanges: BlockRange[] = [];
      let plannedFrom = nextBlock;
      const fetchConcurrency = Math.max(1, options.fetchConcurrency ?? 50);
      while (
        plannedFrom <= options.toBlock &&
        plannedRanges.length < fetchConcurrency
      ) {
        const range = planBlockRange(
          plannedFrom,
          options.toBlock,
          activeChunkSize,
        );
        plannedRanges.push(range);
        plannedFrom = range.toBlock + 1n;
      }
      const fetchedBatch = plannedRanges.map(async (range) => {
        try {
          return {
            ok: true as const,
            value: await fetchLogsWithPolicy(
              client,
              addresses,
              range.fromBlock,
              range.toBlock,
              activeChunkSize,
              options.maxRetries ?? 5,
              counters,
              options.retryRateLimitsIndefinitely ?? false,
              options.signal,
            ),
          };
        } catch (error) {
          return { ok: false as const, error };
        }
      });

      for (let index = 0; index < fetchedBatch.length; index += 1) {
        const fetchedResult = await fetchedBatch[index]!;
        if (!fetchedResult.ok) throw fetchedResult.error;
        const fetched = fetchedResult.value;
        const planned = plannedRanges[index]!;
        activeChunkSize = fetched.chunkSize;
        const blocksByNumber = new Map<bigint, StoredBlock>();
        for (const blockNumber of new Set(
          fetched.logs
            .map((log) => log.blockNumber)
            .filter((number): number is bigint => number !== null),
        )) {
          blocksByNumber.set(
            blockNumber,
            asStoredBlock(await client.getBlock({ blockNumber })),
          );
        }
        const isFinalChunk = fetched.range.toBlock === options.toBlock;
        const shouldAnchor =
          isFinalChunk || (counters.chunks + 1) % anchorEveryChunks === 0;
        const anchor = shouldAnchor
          ? asStoredBlock(
              await client.getBlock({ blockNumber: fetched.range.toBlock }),
            )
          : undefined;

        counters.logsFetched += fetched.logs.length;
        await persistChunk(
          options.pool,
          chainId,
          scope,
          runId,
          fetched.range,
          fetched.logs,
          blocksByNumber,
          anchor,
          counters,
        );
        counters.chunks += 1;
        counters.blocksCovered = (
          BigInt(counters.blocksCovered) +
          fetched.range.toBlock -
          fetched.range.fromBlock +
          1n
        ).toString();
        nextBlock = fetched.range.toBlock + 1n;
        await updateRun(options.pool, runId, "running", counters);
        options.onProgress?.(progress("running"));
        if (fetched.range.toBlock !== planned.toBlock) break;
      }
    }
    await updateRun(options.pool, runId, "completed", counters);
    return progress("completed");
  } catch (error) {
    if (options.signal?.aborted) {
      await updateRun(options.pool, runId, "interrupted", counters);
      options.onProgress?.(progress("interrupted"));
      return progress("interrupted");
    }
    await updateRun(options.pool, runId, "failed", counters, error);
    options.onProgress?.(progress("failed"));
    throw error;
  }
}

export async function findBlockAtOrAfterTimestamp(
  client: EvmClient,
  targetTimestamp: bigint,
  high: bigint,
) {
  let low = 0n;
  let upper = high;
  while (low < upper) {
    const middle = (low + upper) / 2n;
    const block = await client.getBlock({ blockNumber: middle });
    if (block.timestamp < targetTimestamp) low = middle + 1n;
    else upper = middle;
  }
  return low;
}

export async function resolveSevenDayRange(
  rpcUrl: string,
  finalityLag: number,
  requestIntervalMs = 650,
) {
  const client = createEvmClient(hyperevm, rpcUrl, {
    minRequestIntervalMs: requestIntervalMs,
  });
  const head = await client.getBlockNumber();
  const toBlock = head - BigInt(finalityLag);
  const finalizedBlock = await client.getBlock({ blockNumber: toBlock });
  const targetTimestamp = finalizedBlock.timestamp - 7n * 24n * 60n * 60n;
  const fromBlock = await findBlockAtOrAfterTimestamp(
    client,
    targetTimestamp,
    toBlock,
  );
  return { fromBlock, toBlock, finalizedTimestamp: finalizedBlock.timestamp };
}

export async function resolveSavingsHistoryRange(
  adapter: SavingsChainAdapter,
  rpcUrl: string,
  finalityLag: number,
  days = 7,
  requestIntervalMs = 650,
) {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("History days must be an integer between 1 and 365");
  const client = createEvmClient(adapter.chain, rpcUrl, {
    minRequestIntervalMs: requestIntervalMs,
  });
  const finalizedBlock =
    adapter.finality === "rpc-finalized"
      ? await client.getBlock({ blockTag: "finalized" })
      : await client.getBlock({
          blockNumber: (await client.getBlockNumber()) - BigInt(finalityLag),
        });
  if (finalizedBlock.number === null)
    throw new Error(`${adapter.chainName} finalized block is incomplete`);
  const targetTimestamp =
    finalizedBlock.timestamp - BigInt(days) * 24n * 60n * 60n;
  const fromBlock = await findBlockAtOrAfterTimestamp(
    client,
    targetTimestamp,
    finalizedBlock.number,
  );
  return {
    chainId: adapter.chainId,
    chainSlug: adapter.chainSlug,
    fromBlock,
    toBlock: finalizedBlock.number,
    targetTimestamp,
    finalizedTimestamp: finalizedBlock.timestamp,
  };
}
