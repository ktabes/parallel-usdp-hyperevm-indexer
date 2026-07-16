import { parseDiscoveryEnv, parseRuntimeEnv } from "@/config/env";
import { rebuildFlowAnalytics } from "@/analytics/service";
import { rebuildHolderLedger } from "@/analytics/holders";
import {
  readLatestYield,
  readPrices,
  readRates,
  readState,
} from "@/analytics/queries";
import { captureVaultSnapshot } from "@/analytics/snapshots";
import { calculateYieldForRange } from "@/analytics/yield";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { captureConfiguredSavingsSnapshots } from "@/analytics/multichain-snapshots";
import { captureGlobalUsdpSupply } from "@/analytics/usdp-supply";
import { readLatestGlobalUsdpSupply } from "@/analytics/usdp-supply-queries";
import {
  parseRangeAnalyticsRequest,
  readRangeAnalytics,
} from "@/analytics/range-analytics";
import {
  captureSavingsChainSnapshot,
  syncParallelAssetRegistry,
} from "@/analytics/multichain-snapshots";
import {
  resolveAlignedSavingsHistoryRanges,
  runSavingsHistoryRange,
} from "@/analytics/savings-history";
import { reconcileLatestSavingsYield } from "@/analytics/yield-reconciliation";
import {
  capLifetimeActivityRange,
  lifetimeActivityRequestCount,
  lifetimeActivityScope,
  lifetimeChunkSizes,
  resolveLifetimeActivityRanges,
  runLifetimeActivityRange,
} from "@/analytics/lifetime-activity";
import { savingsChainAdapters } from "@/protocol/savings-chains";
import { runVerificationSuite } from "@/verification/service";
import { createDatabase } from "@/db/client";
import {
  DEFAULT_INDEXER_SCOPE,
  ingestLogs,
  resolveSevenDayRange,
  type IngestionProgress,
} from "@/indexer/service";
import { indexerStatus, verifyCoverage } from "@/indexer/status";
import { discoverProtocol } from "@/protocol/discovery";
import { runPublicRpcPreflight } from "@/protocol/preflight";
import {
  alchemyRpcUrl,
  onfinalityArchiveRpcUrl,
  redactSecrets,
} from "@/rpc/alchemy";

const command = process.argv[2];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredArgument(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function indexerScope() {
  return argument("--scope") ?? DEFAULT_INDEXER_SCOPE;
}

function historyDays() {
  const value = Number(argument("--days") ?? "7");
  if (!Number.isInteger(value) || value < 1 || value > 365)
    throw new Error("--days must be an integer between 1 and 365");
  return value;
}

function historyWindowEnd() {
  const value = argument("--window-end");
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || BigInt(value) < 1n)
    throw new Error("--window-end must be a positive Unix timestamp");
  return BigInt(value);
}

function optionalBlockArgument(name: string) {
  const value = argument(name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a block number`);
  return BigInt(value);
}

function requestedHistoryChains() {
  const value =
    argument("--chains") ??
    argument("--chain") ??
    "ethereum,base,sonic,avalanche";
  const chains = [
    ...new Set(value.split(",").map((item) => item.trim())),
  ].filter(Boolean);
  if (chains.length === 0) throw new Error("At least one chain is required");
  return chains;
}

function requestedAdapter(defaultSlug = "hyperevm") {
  const chainSlug = argument("--chain") ?? defaultSlug;
  const adapter = savingsChainAdapters.find(
    (candidate) => candidate.chainSlug === chainSlug,
  );
  if (!adapter) throw new Error(`Unsupported chain: ${chainSlug}`);
  return adapter;
}

function progressReporter() {
  let lastReportedChunk = -1;
  return (progress: IngestionProgress) => {
    const chunk = progress.counters.chunks;
    if (
      progress.status === "running" &&
      chunk !== 1 &&
      chunk % 100 !== 0 &&
      chunk === lastReportedChunk
    )
      return;
    if (progress.status === "running" && chunk % 100 !== 0 && chunk !== 1)
      return;
    lastReportedChunk = chunk;
    console.log(JSON.stringify(progress));
  };
}

async function configCheck() {
  const env = parseRuntimeEnv(process.env);
  console.log(
    JSON.stringify(
      {
        status: "ok",
        nodeEnv: env.NODE_ENV,
        finalityLag: env.FINALITY_LAG,
        logChunkSize: env.RPC_LOG_CHUNK_SIZE,
        priceSource: env.PRICE_SOURCE,
        refreshIntervalSeconds: env.REFRESH_INTERVAL_SECONDS,
        globalSnapshotMaximumAgeSeconds: env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS,
        usdpSupplyAlignmentMaximumSkewSeconds:
          env.USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS,
        usdpSupplyRpcOverrideCount: Object.keys(env.USDP_CHAIN_RPC_URLS ?? {})
          .length,
        configuredSavingsChains: {
          ethereum: Boolean(env.ETHEREUM_RPC_URL),
          base: Boolean(env.BASE_RPC_URL),
          sonic: Boolean(env.SONIC_RPC_URL),
          hyperevm: Boolean(env.HYPEREVM_RPC_URL),
          avalanche: Boolean(env.AVALANCHE_RPC_URL),
        },
      },
      null,
      2,
    ),
  );
}

async function databasePing() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);

  try {
    const result = await pool.query<{ now: Date }>("select now() as now");
    console.log(
      JSON.stringify(
        { status: "ok", databaseTime: result.rows[0]?.now },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function discover() {
  const env = parseDiscoveryEnv(process.env);
  const blockArgument = argument("--block") ?? "latest";
  const rpcArgument = argument("--rpc") ?? "public";
  if (!["public", "alchemy", "archive"].includes(rpcArgument))
    throw new Error("--rpc must be public, alchemy, or archive");
  if (rpcArgument === "alchemy" && !env.ALCHEMY_API_KEY)
    throw new Error(
      "ALCHEMY_API_KEY is required when discovery uses --rpc alchemy",
    );
  if (rpcArgument === "archive" && !env.ONFINALITY_API_KEY)
    throw new Error(
      "ONFINALITY_API_KEY is required when discovery uses --rpc archive",
    );
  const block = blockArgument === "latest" ? "latest" : BigInt(blockArgument);
  const archiveRpcUrl = onfinalityArchiveRpcUrl(env.ONFINALITY_API_KEY);
  const rpcUrl =
    rpcArgument === "alchemy"
      ? alchemyRpcUrl(env.ALCHEMY_API_KEY!)
      : rpcArgument === "archive"
        ? archiveRpcUrl
        : env.HYPEREVM_RPC_URL;
  const result = await discoverProtocol({
    rpcUrl,
    finalityLag: env.FINALITY_LAG,
    block,
    providerName: rpcArgument,
    minRequestIntervalMs: rpcArgument === "archive" ? 1_000 : undefined,
    historicalRpcUrl: rpcArgument === "archive" ? undefined : archiveRpcUrl,
    historicalProviderName:
      rpcArgument === "archive" ? undefined : "onfinality-public-archive",
    historicalMinRequestIntervalMs:
      rpcArgument === "archive" ? undefined : 1_000,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function preflight() {
  const env = parseDiscoveryEnv(process.env);
  const result = await runPublicRpcPreflight({
    rpcUrl: env.HYPEREVM_RPC_URL,
    finalityLag: env.FINALITY_LAG,
    chunkSize: env.RPC_LOG_CHUNK_SIZE,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function runIngestion(fromBlock: bigint, toBlock: bigint) {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    const result = await ingestLogs({
      pool,
      rpcUrl: env.HYPEREVM_RPC_URL,
      fromBlock,
      toBlock,
      finalityLag: env.FINALITY_LAG,
      chunkSize: env.RPC_LOG_CHUNK_SIZE,
      requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
      retryRateLimitsIndefinitely: true,
      scope: indexerScope(),
      signal: controller.signal,
      onProgress: progressReporter(),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await pool.end();
  }
}

async function backfill() {
  await runIngestion(
    BigInt(requiredArgument("--from-block")),
    BigInt(requiredArgument("--to-block")),
  );
}

async function sevenDayBackfill() {
  const env = parseRuntimeEnv(process.env);
  const range = await resolveSevenDayRange(
    env.HYPEREVM_RPC_URL,
    env.FINALITY_LAG,
    env.RPC_REQUEST_INTERVAL_MS,
  );
  console.log(
    JSON.stringify({
      status: "range-resolved",
      fromBlock: range.fromBlock.toString(),
      toBlock: range.toBlock.toString(),
      finalizedTimestamp: range.finalizedTimestamp.toString(),
    }),
  );
  await runIngestion(range.fromBlock, range.toBlock);
}

async function sync() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const status = await indexerStatus(pool, indexerScope());
    const checkpoint = status.checkpoint as { next_block?: string } | null;
    if (!checkpoint?.next_block)
      throw new Error("No checkpoint exists; run a backfill first");
    const range = await resolveSevenDayRange(
      env.HYPEREVM_RPC_URL,
      env.FINALITY_LAG,
      env.RPC_REQUEST_INTERVAL_MS,
    );
    if (BigInt(checkpoint.next_block) > range.toBlock) {
      console.log(
        JSON.stringify({
          status: "noop",
          reason: "checkpoint is already at the finalized head",
          nextBlock: checkpoint.next_block,
          finalizedHead: range.toBlock.toString(),
        }),
      );
      return;
    }
    await runIngestion(BigInt(checkpoint.next_block), range.toBlock);
  } finally {
    await pool.end();
  }
}

async function showIndexerStatus() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await indexerStatus(pool, indexerScope(), requestedAdapter().chainId),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function showCoverage() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await verifyCoverage(
          pool,
          indexerScope(),
          BigInt(requiredArgument("--from-block")),
          BigInt(requiredArgument("--to-block")),
          requestedAdapter().chainId,
        ),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function deriveFlows() {
  const env = parseRuntimeEnv(process.env);
  const adapter = requestedAdapter();
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await rebuildFlowAnalytics({
          pool,
          chainId: adapter.chainId,
          scope: indexerScope(),
          fromBlock: BigInt(requiredArgument("--from-block")),
          toBlock: BigInt(requiredArgument("--to-block")),
          manifestVersion: `parallel-assets-${adapter.chainSlug}-lifetime-v1-candidate`,
        }),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function captureSnapshot() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  const block = argument("--block");
  try {
    console.log(
      JSON.stringify(
        await captureVaultSnapshot({
          pool,
          rpcUrl: env.HYPEREVM_RPC_URL,
          finalityLag: env.FINALITY_LAG,
          requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
          blockNumber: block ? BigInt(block) : undefined,
        }),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function captureMultichainSnapshots() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const savings = await captureConfiguredSavingsSnapshots(pool, env);
    const usdpSupply = await captureGlobalUsdpSupply(pool, env);
    console.log(JSON.stringify({ savings, usdpSupply }, null, 2));
  } finally {
    await pool.end();
  }
}

async function captureUsdpSupply() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(await captureGlobalUsdpSupply(pool, env), null, 2),
    );
  } finally {
    await pool.end();
  }
}

async function showSavingsHistoryPlan() {
  const env = parseRuntimeEnv(process.env);
  const ranges = await resolveAlignedSavingsHistoryRanges(
    env,
    requestedHistoryChains(),
    historyDays(),
    historyWindowEnd(),
  );
  console.log(
    JSON.stringify(
      {
        status: "planned",
        days: historyDays(),
        targetWindowStart: ranges[0]?.targetWindowStart.toString(),
        targetWindowEnd: ranges[0]?.targetWindowEnd.toString(),
        ranges: ranges.map((range) => ({
          chainId: range.adapter.chainId,
          chainSlug: range.adapter.chainSlug,
          fromBlock: range.fromBlock.toString(),
          toBlock: range.toBlock.toString(),
          fromTimestamp: range.fromTimestamp.toString(),
          toTimestamp: range.toTimestamp.toString(),
          blockCount: (range.toBlock - range.fromBlock + 1n).toString(),
        })),
      },
      null,
      2,
    ),
  );
}

async function captureSavingsHistoryBoundaries() {
  const env = parseRuntimeEnv(process.env);
  const ranges = await resolveAlignedSavingsHistoryRanges(
    env,
    requestedHistoryChains(),
    historyDays(),
    historyWindowEnd(),
  );
  const { pool } = createDatabase(env);
  try {
    await syncParallelAssetRegistry(pool);
    const results = [];
    for (const range of ranges) {
      const start = await captureSavingsChainSnapshot({
        pool,
        adapter: range.adapter,
        rpcUrl: range.rpcUrl,
        finalityLag: env.FINALITY_LAG,
        requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
        blockNumber: range.fromBlock,
      });
      const end = await captureSavingsChainSnapshot({
        pool,
        adapter: range.adapter,
        rpcUrl: range.rpcUrl,
        finalityLag: env.FINALITY_LAG,
        requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
        blockNumber: range.toBlock,
      });
      results.push({
        chainId: range.adapter.chainId,
        chainSlug: range.adapter.chainSlug,
        start,
        end,
      });
    }
    console.log(JSON.stringify({ status: "candidate", results }, null, 2));
  } finally {
    await pool.end();
  }
}

async function backfillSavingsHistory() {
  const env = parseRuntimeEnv(process.env);
  const ranges = await resolveAlignedSavingsHistoryRanges(
    env,
    requestedHistoryChains(),
    historyDays(),
    historyWindowEnd(),
  );
  const chunkSizeValue = argument("--chunk-size");
  const chunkSize = chunkSizeValue ? Number(chunkSizeValue) : undefined;
  if (
    chunkSize !== undefined &&
    (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 100_000)
  )
    throw new Error("--chunk-size must be an integer from 1 to 100000");
  const { pool } = createDatabase(env);
  try {
    await syncParallelAssetRegistry(pool);
    for (const range of ranges) {
      console.log(
        JSON.stringify({
          status: "chain-started",
          chainId: range.adapter.chainId,
          chainSlug: range.adapter.chainSlug,
          fromBlock: range.fromBlock.toString(),
          toBlock: range.toBlock.toString(),
        }),
      );
      console.log(
        JSON.stringify(
          await runSavingsHistoryRange({
            pool,
            env,
            range,
            chunkSize,
            logRpcUrl: argument("--log-rpc-url"),
            onProgress: progressReporter(),
          }),
          null,
          2,
        ),
      );
    }
  } finally {
    await pool.end();
  }
}

function optionalChunkSize() {
  const value = argument("--chunk-size");
  if (value === undefined) return undefined;
  const chunkSize = Number(value);
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 100_000)
    throw new Error("--chunk-size must be an integer from 1 to 100000");
  return chunkSize;
}

async function showLifetimeActivityPlan() {
  const env = parseRuntimeEnv(process.env);
  const ranges = await resolveLifetimeActivityRanges(
    env,
    requestedHistoryChains(),
  );
  const requestedChunkSize = optionalChunkSize();
  console.log(
    JSON.stringify(
      {
        status: "planned",
        assets: ["usdp", "susdp"],
        ranges: ranges.map((range) => {
          const chunkSize =
            requestedChunkSize ??
            lifetimeChunkSizes[range.adapter.chainId] ??
            2_000;
          return {
            chainId: range.adapter.chainId,
            chainSlug: range.adapter.chainSlug,
            fromBlock: range.fromBlock.toString(),
            toBlock: range.toBlock.toString(),
            blockCount: (range.toBlock - range.fromBlock + 1n).toString(),
            chunkSize,
            estimatedLogRequests: lifetimeActivityRequestCount(
              range.fromBlock,
              range.toBlock,
              chunkSize,
            ).toString(),
            scope: lifetimeActivityScope(range.adapter),
          };
        }),
      },
      null,
      2,
    ),
  );
}

async function backfillLifetimeActivity() {
  const env = parseRuntimeEnv(process.env);
  const ranges = await resolveLifetimeActivityRanges(
    env,
    requestedHistoryChains(),
  );
  const maximumToBlock = optionalBlockArgument("--to-block");
  const { pool } = createDatabase(env);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    await syncParallelAssetRegistry(pool);
    for (const resolvedRange of ranges) {
      const range = capLifetimeActivityRange(resolvedRange, maximumToBlock);
      console.log(
        JSON.stringify({
          status: "chain-started",
          assets: ["usdp", "susdp"],
          chainId: range.adapter.chainId,
          chainSlug: range.adapter.chainSlug,
          fromBlock: range.fromBlock.toString(),
          toBlock: range.toBlock.toString(),
          scope: lifetimeActivityScope(range.adapter),
        }),
      );
      const result = await runLifetimeActivityRange({
        pool,
        env,
        range,
        chunkSize: optionalChunkSize(),
        logRpcUrl: argument("--log-rpc-url"),
        signal: controller.signal,
        onProgress: progressReporter(),
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "interrupted") break;
    }
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await pool.end();
  }
}

async function reconcileSavingsHistory() {
  const env = parseRuntimeEnv(process.env);
  const requested = new Set(requestedHistoryChains());
  const adapters = savingsChainAdapters.filter((adapter) =>
    requested.has(adapter.chainSlug),
  );
  const missing = [...requested].filter(
    (slug) => !adapters.some((adapter) => adapter.chainSlug === slug),
  );
  if (missing.length > 0)
    throw new Error(`Unknown savings chains: ${missing.join(", ")}`);
  const { pool } = createDatabase(env);
  try {
    const results = [];
    for (const adapter of adapters)
      results.push(await reconcileLatestSavingsYield(pool, adapter));
    console.log(JSON.stringify({ status: "completed", results }, null, 2));
  } finally {
    await pool.end();
  }
}

async function showGlobalSavings() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await readLatestGlobalSavings(
          pool,
          env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS,
        ),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function showGlobalUsdpSupply() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await readLatestGlobalUsdpSupply(
          pool,
          env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS,
        ),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function showRangeAnalytics() {
  const env = parseRuntimeEnv(process.env);
  const params = new URLSearchParams();
  for (const [argumentName, parameterName] of [
    ["--range", "range"],
    ["--chains", "chains"],
    ["--assets", "assets"],
    ["--from", "from"],
    ["--to", "to"],
    ["--as-of", "asOf"],
  ] as const) {
    const value = argument(argumentName);
    if (value) params.set(parameterName, value);
  }
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await readRangeAnalytics(pool, parseRangeAnalyticsRequest(params)),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function showSavingsHistory() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(JSON.stringify(await readLatestSavingsHistory(pool), null, 2));
  } finally {
    await pool.end();
  }
}

async function verifyDataIntegrity() {
  const env = parseRuntimeEnv(process.env);
  const chainSlug = argument("--chain") ?? "hyperevm";
  const adapter = savingsChainAdapters.find(
    (candidate) => candidate.chainSlug === chainSlug,
  );
  if (!adapter) throw new Error(`Unsupported verification chain: ${chainSlug}`);
  const rpcUrl = env[adapter.rpcEnvKey];
  if (!rpcUrl)
    throw new Error(`${adapter.rpcEnvKey} is required to verify ${chainSlug}`);
  const { pool } = createDatabase(env);
  try {
    const result = await runVerificationSuite({
      pool,
      adapter,
      rpcUrl,
      scope: requiredArgument("--scope"),
      fromBlock: BigInt(requiredArgument("--from-block")),
      toBlock: BigInt(requiredArgument("--to-block")),
    });
    const problems = [
      ...result.reconciliations.filter((item) => item.status !== "pass"),
      ...result.health.filter((item) => item.status !== "pass"),
    ];
    console.log(
      JSON.stringify(
        {
          status: result.status,
          runId: result.runId,
          chainId: result.chainId,
          chainSlug: result.chainSlug,
          scope: result.scope,
          fromBlock: result.fromBlock,
          toBlock: result.toBlock,
          summary: result.summary,
          problems,
        },
        null,
        2,
      ),
    );
    if (result.status === "fail") process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

async function replayHolders() {
  const env = parseRuntimeEnv(process.env);
  const chainSlug = argument("--chain") ?? "base";
  const adapter = savingsChainAdapters.find(
    (candidate) => candidate.chainSlug === chainSlug,
  );
  if (!adapter) throw new Error(`Unsupported holder chain: ${chainSlug}`);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await rebuildHolderLedger({
          pool,
          adapter,
          scope:
            argument("--scope") ??
            `parallel-assets-${adapter.chainSlug}-lifetime-v1`,
          fromBlock: BigInt(requiredArgument("--from-block")),
          toBlock: BigInt(requiredArgument("--to-block")),
        }),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function calculateYield() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await calculateYieldForRange({
          pool,
          scope: indexerScope(),
          fromBlock: BigInt(requiredArgument("--from-block")),
          toBlock: BigInt(requiredArgument("--to-block")),
        }),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function showAnalytics(query: "state" | "yield" | "rates" | "price") {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const result =
      query === "state"
        ? await readState(pool)
        : query === "yield"
          ? await readLatestYield(pool)
          : query === "rates"
            ? await readRates(pool)
            : await readPrices(pool);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

async function main() {
  switch (command) {
    case "config-check":
      await configCheck();
      return;
    case "db-ping":
      await databasePing();
      return;
    case "discover":
      await discover();
      return;
    case "preflight":
      await preflight();
      return;
    case "backfill":
      await backfill();
      return;
    case "seven-day-backfill":
      await sevenDayBackfill();
      return;
    case "sync":
      await sync();
      return;
    case "status":
      await showIndexerStatus();
      return;
    case "verify-coverage":
      await showCoverage();
      return;
    case "verify":
      await verifyDataIntegrity();
      return;
    case "holders-replay":
      await replayHolders();
      return;
    case "derive-flows":
      await deriveFlows();
      return;
    case "snapshot":
      await captureSnapshot();
      return;
    case "snapshot-all":
      await captureMultichainSnapshots();
      return;
    case "snapshot-usdp":
      await captureUsdpSupply();
      return;
    case "history-plan":
      await showSavingsHistoryPlan();
      return;
    case "history-boundaries":
      await captureSavingsHistoryBoundaries();
      return;
    case "history-backfill":
      await backfillSavingsHistory();
      return;
    case "history-reconcile":
      await reconcileSavingsHistory();
      return;
    case "lifetime-plan":
      await showLifetimeActivityPlan();
      return;
    case "lifetime-backfill":
      await backfillLifetimeActivity();
      return;
    case "calculate-yield":
      await calculateYield();
      return;
    case "state":
    case "yield":
    case "rates":
    case "price":
      await showAnalytics(command);
      return;
    case "global":
      await showGlobalSavings();
      return;
    case "global-usdp":
      await showGlobalUsdpSupply();
      return;
    case "range":
      await showRangeAnalytics();
      return;
    case "history":
      await showSavingsHistory();
      return;
    default:
      throw new Error(
        "Usage: npm run cli -- <config-check|db-ping|discover|preflight|backfill|seven-day-backfill|sync|status|verify-coverage|verify|holders-replay|derive-flows|snapshot|snapshot-all|snapshot-usdp|history-plan|history-boundaries|history-backfill|history-reconcile|lifetime-plan|lifetime-backfill|calculate-yield|state|yield|rates|price|global|global-usdp|range|history>",
      );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    redactSecrets(message, [
      process.env.ALCHEMY_API_KEY,
      process.env.ONFINALITY_API_KEY,
      process.env.HYPEREVM_RPC_URL,
      process.env.ETHEREUM_RPC_URL,
      process.env.BASE_RPC_URL,
      process.env.SONIC_RPC_URL,
      process.env.AVALANCHE_RPC_URL,
      process.env.USDP_CHAIN_RPC_URLS,
    ]),
  );
  process.exitCode = 1;
});
