import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { providerErrorMessage } from "@/rpc/errors";
import { captureConfiguredSavingsSnapshots } from "./multichain-snapshots";

const WORKER_LOCK_ID = 999_700_002;

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
    const lock = await lockClient.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock($1) as acquired",
      [WORKER_LOCK_ID],
    );
    if (!lock.rows[0]?.acquired) {
      console.log(
        JSON.stringify({
          event: "multichain-snapshot-worker-skipped",
          reason: "lock-held",
        }),
      );
      return { status: "already-running" } as const;
    }

    while (!controller.signal.aborted) {
      const startedAt = new Date();
      try {
        const result = await captureConfiguredSavingsSnapshots(pool, env);
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
