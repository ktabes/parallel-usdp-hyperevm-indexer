import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { HYPEREVM_CHAIN_ID } from "@/protocol/hyperevm";
import {
  DEFAULT_INDEXER_SCOPE,
  ingestLogs,
  resolveSevenDayRange,
} from "./service";
import { classifyRpcError, retryDelayMs } from "./planner";

const WORKER_LOCK_ID = 999_700_001;
const LOCK_RETRY_INTERVAL_MS = 15_000;
const LOCK_RETRY_ATTEMPTS = 20;
const WORKER_FETCH_CONCURRENCY = 20;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runSevenDayWorker() {
  const env = parseRuntimeEnv(process.env);
  if (!env.RUN_SEVEN_DAY_BACKFILL) return { status: "disabled" } as const;

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
        `Seven-day backfill lock held; retry ${attempt}/${LOCK_RETRY_ATTEMPTS}.`,
      );
      if (attempt < LOCK_RETRY_ATTEMPTS) await wait(LOCK_RETRY_INTERVAL_MS);
    }
    if (!acquired) {
      console.log("Seven-day backfill worker stopped: lock remained held.");
      return { status: "already-running" } as const;
    }
    await pool.query(
      `update indexer_runs set
         status = 'interrupted',
         finished_at = now(),
         failure = $2::jsonb
       where chain_id = $1 and status = 'running'`,
      [
        HYPEREVM_CHAIN_ID,
        JSON.stringify({
          message:
            "Previous worker stopped before recording a terminal state; resumed from checkpoint.",
        }),
      ],
    );
    const range = await resolveSevenDayRange(
      env.HYPEREVM_RPC_URL,
      env.FINALITY_LAG,
      env.RPC_REQUEST_INTERVAL_MS,
    );
    let recoveryAttempt = 0;
    while (!controller.signal.aborted) {
      console.log(
        JSON.stringify({
          event: "seven-day-backfill-started",
          scope: DEFAULT_INDEXER_SCOPE,
          fromBlock: range.fromBlock.toString(),
          toBlock: range.toBlock.toString(),
          recoveryAttempt,
        }),
      );
      try {
        const result = await ingestLogs({
          pool,
          rpcUrl: env.HYPEREVM_RPC_URL,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
          finalityLag: env.FINALITY_LAG,
          chunkSize: env.RPC_LOG_CHUNK_SIZE,
          requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
          maxRetries: 5,
          retryRateLimitsIndefinitely: true,
          fetchConcurrency: WORKER_FETCH_CONCURRENCY,
          signal: controller.signal,
          onProgress: (progress) => {
            if (progress.counters.chunks % 100 === 0)
              console.log(
                JSON.stringify({ event: "backfill-progress", ...progress }),
              );
          },
        });
        console.log(
          JSON.stringify({ event: "seven-day-backfill-finished", ...result }),
        );
        return result;
      } catch (error) {
        const errorClass = classifyRpcError(error);
        if (errorClass === "fatal") throw error;
        recoveryAttempt += 1;
        const retryInMs = retryDelayMs(recoveryAttempt, errorClass);
        console.warn(
          JSON.stringify({
            event: "seven-day-backfill-recovering",
            errorClass,
            retryInMs,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        await wait(retryInMs);
      }
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
