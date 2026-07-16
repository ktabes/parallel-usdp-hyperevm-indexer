import type { Pool } from "pg";
import type { RuntimeEnv } from "@/config/env";
import { rebuildFlowAnalytics } from "./service";
import {
  configuredSavingsChainAdapters,
  type SavingsChainAdapter,
} from "@/protocol/savings-chains";
import { createEvmClient } from "@/rpc/evm-client";
import { ingestLogs, type IngestionProgress } from "@/indexer/service";

export const lifetimeChunkSizes: Record<number, number> = {
  1: 2_000,
  8453: 10_000,
  146: 5_000,
  999: 5,
  43114: 2_048,
};

export const lifetimeBlockFetchConcurrency: Record<number, number> = {
  1: 20,
  8453: 20,
  146: 40,
  999: 1,
  43114: 20,
};

const lifetimeBlockRpcUrls: Partial<Record<number, string>> = {
  8453: "https://base-mainnet.public.blastapi.io",
};

export interface LifetimeActivityRange {
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  fromBlock: bigint;
  toBlock: bigint;
}

export function lifetimeActivityFromBlock(adapter: SavingsChainAdapter) {
  const usdpBlock = adapter.usdp.deploymentBlock;
  const susdpBlock = adapter.susdp.deploymentBlock;
  if (usdpBlock === undefined || susdpBlock === undefined)
    throw new Error(
      `Missing lifetime deployment boundary for ${adapter.chainName}`,
    );
  return usdpBlock < susdpBlock ? usdpBlock : susdpBlock;
}

export function lifetimeActivityScope(adapter: SavingsChainAdapter) {
  return `parallel-assets-${adapter.chainSlug}-lifetime-v1`;
}

export function lifetimeActivityRequestCount(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: number,
) {
  if (toBlock < fromBlock) return 0n;
  const blocks = toBlock - fromBlock + 1n;
  return (blocks + BigInt(chunkSize) - 1n) / BigInt(chunkSize);
}

export async function resolveLifetimeActivityRanges(
  env: RuntimeEnv,
  chainSlugs: readonly string[],
) {
  const requested = new Set(chainSlugs);
  const configured = configuredSavingsChainAdapters(env).filter(
    (adapter) => requested.has(adapter.chainSlug) && adapter.rpcUrl,
  );
  const missing = chainSlugs.filter(
    (slug) => !configured.some((adapter) => adapter.chainSlug === slug),
  );
  if (missing.length > 0)
    throw new Error(`Missing RPC configuration for: ${missing.join(", ")}`);

  return Promise.all(
    configured.map(async (adapter): Promise<LifetimeActivityRange> => {
      const rpcUrl = adapter.rpcUrl!;
      const client = createEvmClient(adapter.chain, rpcUrl, {
        minRequestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
      });
      const finalized =
        adapter.finality === "rpc-finalized"
          ? await client.getBlock({ blockTag: "finalized" })
          : await client.getBlock({
              blockNumber:
                (await client.getBlockNumber()) - BigInt(env.FINALITY_LAG),
            });
      if (finalized.number === null)
        throw new Error(`${adapter.chainName} finalized block is incomplete`);
      return {
        adapter,
        rpcUrl,
        fromBlock: lifetimeActivityFromBlock(adapter),
        toBlock: finalized.number,
      };
    }),
  );
}

export interface RunLifetimeActivityOptions {
  pool: Pool;
  env: RuntimeEnv;
  range: LifetimeActivityRange;
  chunkSize?: number;
  logRpcUrl?: string;
  signal?: AbortSignal;
  onProgress?: (progress: IngestionProgress) => void;
}

export async function runLifetimeActivityRange(
  options: RunLifetimeActivityOptions,
) {
  const { adapter, fromBlock, toBlock } = options.range;
  const scope = lifetimeActivityScope(adapter);
  const lock = await options.pool.connect();
  const lockResult = await lock.query<{ locked: boolean }>(
    `select pg_try_advisory_lock($1, hashtext($2)) as locked`,
    [adapter.chainId, scope],
  );
  if (!lockResult.rows[0]?.locked) {
    lock.release();
    throw new Error(
      `${adapter.chainName} lifetime activity worker is already running`,
    );
  }

  try {
    const ingestion = await ingestLogs({
      pool: options.pool,
      rpcUrl: options.logRpcUrl ?? options.range.rpcUrl,
      adapter,
      addresses: [adapter.usdp.address, adapter.susdp.address],
      fromBlock,
      toBlock,
      finalityLag: options.env.FINALITY_LAG,
      chunkSize:
        options.chunkSize ?? lifetimeChunkSizes[adapter.chainId] ?? 2_000,
      scope,
      requestIntervalMs: options.env.RPC_REQUEST_INTERVAL_MS,
      maxRetries: 5,
      retryRateLimitsIndefinitely: false,
      anchorEveryChunks: 100,
      fetchConcurrency: 1,
      blockRpcUrl: lifetimeBlockRpcUrls[adapter.chainId],
      blockFetchConcurrency:
        lifetimeBlockFetchConcurrency[adapter.chainId] ?? 10,
      blockFetchBatchSize: adapter.chainId === 8453 ? 10 : 1,
      blockBatchConcurrency: adapter.chainId === 8453 ? 10 : 1,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    if (ingestion.status === "interrupted")
      return {
        status: "interrupted" as const,
        chainId: adapter.chainId,
        chainSlug: adapter.chainSlug,
        scope,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        ingestion,
      };
    const flows = await rebuildFlowAnalytics({
      pool: options.pool,
      chainId: adapter.chainId,
      scope,
      fromBlock,
      toBlock,
      manifestVersion: `parallel-assets-${adapter.chainSlug}-lifetime-v1-candidate`,
    });
    return {
      status:
        flows.status === "candidate" ? ("candidate" as const) : flows.status,
      chainId: adapter.chainId,
      chainSlug: adapter.chainSlug,
      scope,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      ingestion,
      flows,
    };
  } finally {
    await lock.query(`select pg_advisory_unlock($1, hashtext($2))`, [
      adapter.chainId,
      scope,
    ]);
    lock.release();
  }
}
