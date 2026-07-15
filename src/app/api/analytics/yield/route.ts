import { NextResponse } from "next/server";
import { readLatestYield } from "@/analytics/queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    return NextResponse.json(await readLatestYield(pool));
  } finally {
    await pool.end();
  }
}
