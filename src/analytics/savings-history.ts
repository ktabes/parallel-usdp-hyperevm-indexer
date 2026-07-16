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
import { verifyCoverage } from "@/indexer/status";
import { lifetimeActivityScope } from "./lifetime-activity";
import {
  runWithProviderFailover,
  type RpcProviderCandidate,
  type RpcProviderFailoverEvent,
} from "@/rpc/provider-failover";

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
  logRpcProviders?: readonly RpcProviderCandidate[];
  signal?: AbortSignal;
  onProgress?: Parameters<typeof ingestLogs>[0]["onProgress"];
  onProviderFailover?: (event: RpcProviderFailoverEvent) => void;
}

export async function reuseSavingsHistoryCoverage(options: {
  pool: Pool;
  adapter: SavingsChainAdapter;
  sourceScope: string;
  targetScope: string;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const sourceCoverage = await verifyCoverage(
    options.pool,
    options.sourceScope,
    options.fromBlock,
    options.toBlock,
    options.adapter.chainId,
  );
  if (!sourceCoverage.complete)
    return {
      status: "unavailable" as const,
      reason: "source_coverage_incomplete" as const,
      sourceCoverage,
    };
  if (options.sourceScope !== options.targetScope)
    await options.pool.query(
      `insert into indexer_coverage
        (chain_id, scope, from_block, to_block, run_id, scanned_at)
       select chain_id, $3,
              greatest(from_block, $4::bigint),
              least(to_block, $5::bigint),
              run_id, scanned_at
         from indexer_coverage
        where chain_id = $1 and scope = $2
          and to_block >= $4 and from_block <= $5
       on conflict (chain_id, scope, from_block, to_block) do nothing`,
      [
        options.adapter.chainId,
        options.sourceScope,
        options.targetScope,
        options.fromBlock.toString(),
        options.toBlock.toString(),
      ],
    );
  const targetCoverage = await verifyCoverage(
    options.pool,
    options.targetScope,
    options.fromBlock,
    options.toBlock,
    options.adapter.chainId,
  );
  if (!targetCoverage.complete)
    throw new Error(
      `${options.adapter.chainName} reused history coverage is incomplete`,
    );
  return {
    status: "complete" as const,
    sourceScope: options.sourceScope,
    targetScope: options.targetScope,
    provenance: "original coverage run IDs and scan timestamps preserved",
    sourceCoverage,
    targetCoverage,
  };
}

export async function deriveSavingsHistoryFromCompleteCoverage(options: {
  pool: Pool;
  env: RuntimeEnv;
  range: AlignedSavingsHistoryRange;
  sourceScope?: string;
}) {
  const { adapter } = options.range;
  const targetScope = savingsHistoryScope(options.range);
  const sourceScope =
    options.sourceScope ??
    (adapter.chainId === 999 ? targetScope : lifetimeActivityScope(adapter));
  const lock = await options.pool.connect();
  const lockResult = await lock.query<{ locked: boolean }>(
    `select pg_try_advisory_lock($1, hashtext($2)) as locked`,
    [adapter.chainId, targetScope],
  );
  if (!lockResult.rows[0]?.locked) {
    lock.release();
    throw new Error(`${adapter.chainName} history worker is already running`);
  }
  try {
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
        targetScope,
        startSnapshot,
        endSnapshot,
      };
    const coverage = await reuseSavingsHistoryCoverage({
      pool: options.pool,
      adapter,
      sourceScope,
      targetScope,
      fromBlock: options.range.fromBlock,
      toBlock: options.range.toBlock,
    });
    if (coverage.status !== "complete")
      return {
        status: "unavailable" as const,
        reason: coverage.reason,
        chainId: adapter.chainId,
        chainSlug: adapter.chainSlug,
        targetScope,
        coverage,
      };
    const flows = await rebuildFlowAnalytics({
      pool: options.pool,
      chainId: adapter.chainId,
      scope: targetScope,
      fromBlock: options.range.fromBlock,
      toBlock: options.range.toBlock,
      manifestVersion: adapter.manifestVersion,
    });
    const yieldResult = await calculateSavingsYieldForRange({
      pool: options.pool,
      adapter,
      scope: targetScope,
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
      sourceScope,
      targetScope,
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
      coverage,
      flows,
      yield: yieldResult,
    };
  } finally {
    await lock.query(`select pg_advisory_unlock($1, hashtext($2))`, [
      adapter.chainId,
      targetScope,
    ]);
    lock.release();
  }
}

export async function deriveLifetimeSavingsYieldFromCoverage(options: {
  pool: Pool;
  env: RuntimeEnv;
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  sourceScope: string;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const client = createEvmClient(options.adapter.chain, options.rpcUrl, {
    minRequestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
  });
  const [from, to] = await Promise.all([
    client.getBlock({ blockNumber: options.fromBlock }),
    client.getBlock({ blockNumber: options.toBlock }),
  ]);
  return deriveSavingsHistoryFromCompleteCoverage({
    pool: options.pool,
    env: options.env,
    sourceScope: options.sourceScope,
    range: {
      adapter: options.adapter,
      rpcUrl: options.rpcUrl,
      fromBlock: options.fromBlock,
      toBlock: options.toBlock,
      fromTimestamp: from.timestamp,
      toTimestamp: to.timestamp,
      targetWindowStart: from.timestamp,
      targetWindowEnd: to.timestamp,
    },
  });
}

export async function runSavingsHistoryRange(
  options: RunSavingsHistoryOptions,
) {
  const { adapter } = options.range;
  const scope = savingsHistoryScope(options.range);
  const lock = await options.pool.connect();
  const lockResult = await lock.query<{ locked: boolean }>(
    `select pg_try_advisory_lock($1, hashtext($2)) as locked`,
    [adapter.chainId, scope],
  );
  if (!lockResult.rows[0]?.locked) {
    lock.release();
    throw new Error(`${adapter.chainName} history worker is already running`);
  }

  try {
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

    const defaultChunkSize =
      options.chunkSize ?? defaultChunkSizes[adapter.chainId] ?? 2_000;
    const providers =
      options.logRpcProviders ??
      ([
        {
          id: "configured",
          rpcUrl: options.logRpcUrl ?? options.range.rpcUrl,
          chunkSize: defaultChunkSize,
          requestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
        },
      ] satisfies RpcProviderCandidate[]);
    const ingestion = await runWithProviderFailover({
      providers,
      onFailover: options.onProviderFailover,
      operation: (provider) =>
        ingestLogs({
          pool: options.pool,
          rpcUrl: provider.rpcUrl,
          blockRpcUrl: options.range.rpcUrl,
          adapter,
          addresses: [adapter.susdp.address],
          fromBlock: options.range.fromBlock,
          toBlock: options.range.toBlock,
          finalityLag: options.env.FINALITY_LAG,
          chunkSize: provider.chunkSize,
          scope,
          requestIntervalMs: provider.requestIntervalMs,
          maxRetries: 5,
          retryRateLimitsIndefinitely: false,
          anchorEveryChunks: 100,
          fetchConcurrency: 1,
          signal: options.signal,
          onProgress: options.onProgress,
        }),
    });
    if (ingestion.status === "interrupted")
      return {
        status: "interrupted" as const,
        chainId: adapter.chainId,
        chainSlug: adapter.chainSlug,
        scope,
        ingestion,
      };
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
  } finally {
    await lock.query(`select pg_advisory_unlock($1, hashtext($2))`, [
      adapter.chainId,
      scope,
    ]);
    lock.release();
  }
}
