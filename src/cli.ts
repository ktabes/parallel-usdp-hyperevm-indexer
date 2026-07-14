import { parseDiscoveryEnv, parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { discoverProtocol } from "@/protocol/discovery";
import { runPublicRpcPreflight } from "@/protocol/preflight";

const command = process.argv[2];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
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
  const block = blockArgument === "latest" ? "latest" : BigInt(blockArgument);
  const result = await discoverProtocol({
    rpcUrl: env.HYPEREVM_RPC_URL,
    finalityLag: env.FINALITY_LAG,
    block,
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
    default:
      throw new Error(
        "Usage: npm run cli -- <config-check|db-ping|discover|preflight> [--block latest|NUMBER]",
      );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
