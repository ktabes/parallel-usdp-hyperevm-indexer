import { NextResponse } from "next/server";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { DEFAULT_INDEXER_SCOPE } from "@/indexer/service";
import { indexerStatus } from "@/indexer/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    return NextResponse.json(await indexerStatus(pool, DEFAULT_INDEXER_SCOPE));
  } finally {
    await pool.end();
  }
}
