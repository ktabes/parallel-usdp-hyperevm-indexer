import type { Pool } from "pg";
import type { RuntimeEnv } from "@/config/env";
import { rebuildFlowAnalytics } from "./service";
import { captureSavingsChainSnapshot } from "./multichain-snapshots";
import { calculateSavingsYieldForRange } from "./multichain-yield";
import {
  configuredSavingsChainAdapters,
  type SavingsChainAdapter,
} from "@/protocol/savings-chains";
import { createEvmClient, type EvmClient } from "@/rpc/evm-client";
import { findBlockAtOrAfterTimestamp, ingestLogs } from "@/indexer/service";

export interface AlignedSavingsHistoryRange {
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  fromBlock: bigint;
  toBlock: bigint;
  fromTimestamp: bigint;
  toTimestamp: bigint;
  targetWindowStart: bigint;
  targetWindowEnd: bigint;
}

interface FinalizedChain {
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  client: EvmClient;
  finalizedBlockNumber: bigint;
  finalizedTimestamp: bigint;
}

const defaultChunkSizes: Record<number, number> = {
  1: 2_000,
  8453: 10_000,
  146: 5_000,
  999: 50,
  43114: 2_048,
};

async function finalizedChain(
  adapter: SavingsChainAdapter,
  rpcUrl: string,
  finalityLag: number,
  requestIntervalMs: number,
): Promise<FinalizedChain> {
  const client = createEvmClient(adapter.chain, rpcUrl, {
    minRequestIntervalMs: requestIntervalMs,
  });
  const block =
    adapter.finality === "rpc-finalized"
      ? await client.getBlock({ blockTag: "finalized" })
      : await client.getBlock({
          blockNumber: (await client.getBlockNumber()) - BigInt(finalityLag),
        });
  if (block.number === null)
    throw new Error(`${adapter.chainName} finalized block is incomplete`);
  return {
    adapter,
    rpcUrl,
    client,
    finalizedBlockNumber: block.number,
    finalizedTimestamp: block.timestamp,
  };
}

export async function resolveAlignedSavingsHistoryRanges(
  env: RuntimeEnv,
  chainSlugs: readonly string[],
  days = 7,
  pinnedWindowEnd?: bigint,
) {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("History days must be an integer between 1 and 365");
  const requested = new Set(chainSlugs);
  const configured = configuredSavingsChainAdapters(env).filter(
    (adapter) => requested.has(adapter.chainSlug) && adapter.rpcUrl,
  );
  const missing = chainSlugs.filter(
    (slug) => !configured.some((adapter) => adapter.chainSlug === slug),
  );
  if (missing.length > 0)
    throw new Error(`Missing RPC configuration for: ${missing.join(", ")}`);

  const chains = await Promise.all(
    configured.map((adapter) =>
      finalizedChain(
        adapter,
        adapter.rpcUrl!,
        env.FINALITY_LAG,
        env.RPC_REQUEST_INTERVAL_MS,
      ),
    ),
  );
  const latestCommonWindowEnd = chains.reduce(
    (oldest, chain) =>
      chain.finalizedTimestamp < oldest ? chain.finalizedTimestamp : oldest,
    chains[0]!.finalizedTimestamp,
  );
  if (pinnedWindowEnd !== undefined && pinnedWindowEnd > latestCommonWindowEnd)
    throw new Error(
      `Pinned history window end ${pinnedWindowEnd} exceeds latest common finalized timestamp ${latestCommonWindowEnd}`,
    );
  const targetWindowEnd = pinnedWindowEnd ?? latestCommonWindowEnd;
  const targetWindowStart = targetWindowEnd - BigInt(days) * 24n * 60n * 60n;

  return Promise.all(
    chains.map(async (chain): Promise<AlignedSavingsHistoryRange> => {
      const [fromBlock, toBlock] = await Promise.all([
        findBlockAtOrAfterTimestamp(
          chain.client,
          targetWindowStart,
          chain.finalizedBlockNumber,
        ),
        findBlockAtOrAfterTimestamp(
          chain.client,
          targetWindowEnd,
          chain.finalizedBlockNumber,
        ),
      ]);
      const [from, to] = await Promise.all([
        chain.client.getBlock({ blockNumber: fromBlock }),
        chain.client.getBlock({ blockNumber: toBlock }),
      ]);
      return {
        adapter: chain.adapter,
        rpcUrl: chain.rpcUrl,
        fromBlock,
        toBlock,
        fromTimestamp: from.timestamp,
        toTimestamp: to.timestamp,
        targetWindowStart,
        targetWindowEnd,
      };
    }),
  );
}

export function savingsHistoryScope(range: AlignedSavingsHistoryRange) {
  return `parallel-savings-${range.adapter.chainSlug}-${range.targetWindowStart}-${range.targetWindowEnd}-v1`;
}

export interface RunSavingsHistoryOptions {
  pool: Pool;
  env: RuntimeEnv;
  range: AlignedSavingsHistoryRange;
  chunkSize?: number;
  logRpcUrl?: string;
  onProgress?: Parameters<typeof ingestLogs>[0]["onProgress"];
}

export async function runSavingsHistoryRange(
  options: RunSavingsHistoryOptions,
) {
  const { adapter } = options.range;
  const scope = savingsHistoryScope(options.range);

  const startSnapshot = await captureSavingsChainSnapshot({
    pool: options.pool,
    adapter,
    rpcUrl: options.range.rpcUrl,
    finalityLag: options.env.FINALITY_LAG,
    requestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
    blockNumber: options.range.fromBlock,
  });
  const endSnapshot = await captureSavingsChainSnapshot({
    pool: options.pool,
    adapter,
    rpcUrl: options.range.rpcUrl,
    finalityLag: options.env.FINALITY_LAG,
    requestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
    blockNumber: options.range.toBlock,
  });
  if (startSnapshot.status === "invalid" || endSnapshot.status === "invalid")
    return {
      status: "unavailable" as const,
      reason: "boundary_snapshot_invalid" as const,
      chainId: adapter.chainId,
      chainSlug: adapter.chainSlug,
      scope,
      startSnapshot,
      endSnapshot,
    };

  const ingestion = await ingestLogs({
    pool: options.pool,
    rpcUrl: options.logRpcUrl ?? options.range.rpcUrl,
    adapter,
    addresses: [adapter.susdp.address],
    fromBlock: options.range.fromBlock,
    toBlock: options.range.toBlock,
    finalityLag: options.env.FINALITY_LAG,
    chunkSize: options.chunkSize ?? defaultChunkSizes[adapter.chainId] ?? 2_000,
    scope,
    requestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
    maxRetries: 5,
    retryRateLimitsIndefinitely: false,
    anchorEveryChunks: 100,
    fetchConcurrency: 1,
    onProgress: options.onProgress,
  });
  const flows = await rebuildFlowAnalytics({
    pool: options.pool,
    chainId: adapter.chainId,
    scope,
    fromBlock: options.range.fromBlock,
    toBlock: options.range.toBlock,
    manifestVersion: adapter.manifestVersion,
  });
  const yieldResult = await calculateSavingsYieldForRange({
    pool: options.pool,
    adapter,
    scope,
    fromBlock: options.range.fromBlock,
    toBlock: options.range.toBlock,
  });
  return {
    status:
      flows.status === "candidate" && yieldResult.status === "candidate"
        ? ("candidate" as const)
        : ("unavailable" as const),
    chainId: adapter.chainId,
    chainSlug: adapter.chainSlug,
    scope,
    range: {
      fromBlock: options.range.fromBlock.toString(),
      toBlock: options.range.toBlock.toString(),
      fromTimestamp: options.range.fromTimestamp.toString(),
      toTimestamp: options.range.toTimestamp.toString(),
      targetWindowStart: options.range.targetWindowStart.toString(),
      targetWindowEnd: options.range.targetWindowEnd.toString(),
    },
    startSnapshot,
    endSnapshot,
    ingestion,
    flows,
    yield: yieldResult,
  };
}
