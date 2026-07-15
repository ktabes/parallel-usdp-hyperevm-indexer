import { NextResponse } from "next/server";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    return NextResponse.json(
      await readLatestGlobalSavings(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
    );
  } finally {
    await pool.end();
  }
}
