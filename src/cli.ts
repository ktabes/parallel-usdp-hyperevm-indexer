import { parseDiscoveryEnv, parseRuntimeEnv } from "@/config/env";
import { rebuildFlowAnalytics } from "@/analytics/service";
import {
  readLatestYield,
  readPrices,
  readRates,
  readState,
} from "@/analytics/queries";
import { captureVaultSnapshot } from "@/analytics/snapshots";
import { calculateYieldForRange } from "@/analytics/yield";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { captureConfiguredSavingsSnapshots } from "@/analytics/multichain-snapshots";
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
      JSON.stringify(await indexerStatus(pool, indexerScope()), null, 2),
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
  const { pool } = createDatabase(env);
  try {
    console.log(
      JSON.stringify(
        await rebuildFlowAnalytics({
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
    console.log(
      JSON.stringify(
        await captureConfiguredSavingsSnapshots(pool, env),
        null,
        2,
      ),
    );
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
    case "derive-flows":
      await deriveFlows();
      return;
    case "snapshot":
      await captureSnapshot();
      return;
    case "snapshot-all":
      await captureMultichainSnapshots();
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
    default:
      throw new Error(
        "Usage: npm run cli -- <config-check|db-ping|discover|preflight|backfill|seven-day-backfill|sync|status|verify-coverage|derive-flows|snapshot|snapshot-all|calculate-yield|state|yield|rates|price|global>",
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
    ]),
  );
  process.exitCode = 1;
});
