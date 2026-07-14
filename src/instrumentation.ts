export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.RUN_SEVEN_DAY_BACKFILL !== "1"
  )
    return;

  const { runSevenDayWorker } = await import("@/indexer/worker");
  void runSevenDayWorker().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "seven-day-backfill-failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}
