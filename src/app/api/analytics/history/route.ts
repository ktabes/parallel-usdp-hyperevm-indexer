import { NextResponse } from "next/server";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    return NextResponse.json(await readLatestSavingsHistory(pool));
  } finally {
    await pool.end();
  }
}
