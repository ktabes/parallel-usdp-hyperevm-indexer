import { parseDiscoveryEnv, parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
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
        "Usage: npm run cli -- <config-check|db-ping|discover|preflight> [--block latest|NUMBER] [--rpc public|alchemy|archive]",
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
    ]),
  );
  process.exitCode = 1;
});
