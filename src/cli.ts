import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

const command = process.argv[2];

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

async function main() {
  switch (command) {
    case "config-check":
      await configCheck();
      return;
    case "db-ping":
      await databasePing();
      return;
    default:
      throw new Error("Usage: npm run cli -- <config-check|db-ping>");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
