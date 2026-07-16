import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { providerErrorMessage } from "@/rpc/errors";
import { captureConfiguredSavingsSnapshots } from "./multichain-snapshots";
import { captureGlobalUsdpSupply } from "./usdp-supply";

const WORKER_LOCK_ID = 999_700_002;
const LOCK_RETRY_INTERVAL_MS = 5_000;
const LOCK_RETRY_ATTEMPTS = 12;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runMultichainSnapshotWorker() {
  const env = parseRuntimeEnv(process.env);
  if (!env.RUN_MULTICHAIN_SNAPSHOTS) return { status: "disabled" } as const;

  const { pool } = createDatabase(env);
  const lockClient = await pool.connect();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    let acquired = false;
    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
      const lock = await lockClient.query<{ acquired: boolean }>(
        "select pg_try_advisory_lock($1) as acquired",
        [WORKER_LOCK_ID],
      );
      acquired = Boolean(lock.rows[0]?.acquired);
      if (acquired) break;
      console.log(
        JSON.stringify({
          event: "multichain-snapshot-worker-waiting",
          reason: "lock-held",
          attempt,
          maximumAttempts: LOCK_RETRY_ATTEMPTS,
        }),
      );
      if (attempt < LOCK_RETRY_ATTEMPTS) await wait(LOCK_RETRY_INTERVAL_MS);
    }
    if (!acquired) {
      console.log(
        JSON.stringify({
          event: "multichain-snapshot-worker-stopped",
          reason: "lock-remained-held",
        }),
      );
      return { status: "already-running" } as const;
    }

    while (!controller.signal.aborted) {
      const startedAt = new Date();
      try {
        const result = await captureConfiguredSavingsSnapshots(pool, env);
        const usdpSupply = await captureGlobalUsdpSupply(pool, env);
        console.log(
          JSON.stringify({
            event: "multichain-snapshot-cycle",
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            status: result.status,
            chains: result.chains.map((chain) => ({
              chainId: chain.chainId,
              chainSlug: chain.chainSlug,
              status: chain.status,
              reason: "reason" in chain ? chain.reason : undefined,
            })),
            globalSnapshotId: result.global.globalSnapshotId,
            globalUsdpSupplySnapshotId: usdpSupply.globalSnapshotId,
            globalUsdpSupplyStatus: usdpSupply.status,
            globalUsdpSupplyIncludedChains:
              usdpSupply.coverage.includedChainCount,
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "multichain-snapshot-cycle-failed",
            startedAt: startedAt.toISOString(),
            message: providerErrorMessage(error),
          }),
        );
      }
      await wait(env.REFRESH_INTERVAL_SECONDS * 1_000);
    }
    return { status: "interrupted" } as const;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try {
      await lockClient.query("select pg_advisory_unlock($1)", [WORKER_LOCK_ID]);
    } finally {
      lockClient.release();
      await pool.end();
    }
  }
}
