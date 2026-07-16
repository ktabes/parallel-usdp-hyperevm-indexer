import { createDatabase } from "@/db/client";
import { parseHistoryWorkerEnv } from "@/config/env";
import {
  resolveAlignedSavingsHistoryRanges,
  runSavingsHistoryRange,
} from "@/analytics/savings-history";
import { syncParallelAssetRegistry } from "@/analytics/multichain-snapshots";
import { reconcileLatestSavingsYield } from "@/analytics/yield-reconciliation";
import { savingsChainAdapters } from "@/protocol/savings-chains";
import { providerErrorMessage } from "@/rpc/errors";
import type { RpcProviderCandidate } from "@/rpc/provider-failover";
import type { IngestionProgress } from "@/indexer/service";

function uniqueProviders(providers: readonly RpcProviderCandidate[]) {
  const urls = new Set<string>();
  return providers.filter((provider) => {
    if (urls.has(provider.rpcUrl)) return false;
    urls.add(provider.rpcUrl);
    return true;
  });
}

function progressReporter(progress: IngestionProgress) {
  if (
    progress.status !== "running" ||
    progress.counters.chunks === 1 ||
    progress.counters.chunks % 100 === 0
  )
    console.log(
      JSON.stringify({ event: "history-worker-progress", ...progress }),
    );
}

async function main() {
  const workerEnv = parseHistoryWorkerEnv(process.env);
  const runtimeEnv = {
    ...workerEnv,
    HYPEREVM_RPC_URL: workerEnv.HYPEREVM_HISTORY_STATE_RPC_URL,
  };
  const providers = uniqueProviders(
    [
      workerEnv.HYPEREVM_HISTORY_PRIMARY_RPC_URL
        ? {
            id: "primary",
            rpcUrl: workerEnv.HYPEREVM_HISTORY_PRIMARY_RPC_URL,
            chunkSize: workerEnv.HYPEREVM_HISTORY_PRIMARY_CHUNK_SIZE,
            requestIntervalMs: workerEnv.HYPEREVM_HISTORY_PRIMARY_INTERVAL_MS,
          }
        : undefined,
      {
        id: "official-public-fallback",
        rpcUrl: workerEnv.HYPEREVM_HISTORY_FALLBACK_RPC_URL,
        chunkSize: workerEnv.HYPEREVM_HISTORY_FALLBACK_CHUNK_SIZE,
        requestIntervalMs: workerEnv.HYPEREVM_HISTORY_FALLBACK_INTERVAL_MS,
      },
    ].filter((provider): provider is RpcProviderCandidate => Boolean(provider)),
  );
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  const { pool } = createDatabase(runtimeEnv);
  try {
    await syncParallelAssetRegistry(pool);
    const ranges = await resolveAlignedSavingsHistoryRanges(
      runtimeEnv,
      ["hyperevm"],
      workerEnv.HYPEREVM_HISTORY_DAYS,
      workerEnv.HYPEREVM_HISTORY_WINDOW_END,
    );
    const range = ranges[0];
    if (!range) throw new Error("HyperEVM history range was not resolved");
    console.log(
      JSON.stringify({
        event: "history-worker-started",
        chainId: range.adapter.chainId,
        chainSlug: range.adapter.chainSlug,
        fromBlock: range.fromBlock.toString(),
        toBlock: range.toBlock.toString(),
        windowEnd: range.targetWindowEnd.toString(),
        providerIds: providers.map((provider) => provider.id),
      }),
    );
    const result = await runSavingsHistoryRange({
      pool,
      env: runtimeEnv,
      range,
      logRpcProviders: providers,
      signal: controller.signal,
      onProgress: progressReporter,
      onProviderFailover: (event) =>
        console.warn(
          JSON.stringify({ event: "history-provider-failover", ...event }),
        ),
    });
    const adapter = savingsChainAdapters.find(
      (candidate) => candidate.chainSlug === "hyperevm",
    );
    if (!adapter) throw new Error("HyperEVM adapter is not configured");
    const reconciliation =
      result.status === "candidate"
        ? await reconcileLatestSavingsYield(pool, adapter)
        : { status: "not-run", reason: `history_status_${result.status}` };
    console.log(
      JSON.stringify({
        event: "history-worker-finished",
        status: result.status,
        reconciliation,
      }),
    );
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "history-worker-failed",
      message: providerErrorMessage(error),
    }),
  );
  process.exitCode = 1;
});
