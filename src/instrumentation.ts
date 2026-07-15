import { providerErrorMessage } from "@/rpc/errors";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.RUN_SEVEN_DAY_BACKFILL === "1") {
    const { runSevenDayWorker } = await import("@/indexer/worker");
    void runSevenDayWorker().catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: "seven-day-backfill-failed",
          message: providerErrorMessage(error),
        }),
      );
    });
  }

  if (process.env.RUN_MULTICHAIN_SNAPSHOTS === "1") {
    const { runMultichainSnapshotWorker } =
      await import("@/analytics/multichain-worker");
    void runMultichainSnapshotWorker().catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: "multichain-snapshot-worker-failed",
          message: providerErrorMessage(error),
        }),
      );
    });
  }
}
