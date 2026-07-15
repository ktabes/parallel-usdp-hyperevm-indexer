import { NextResponse } from "next/server";
import { readRates } from "@/analytics/queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    return NextResponse.json(await readRates(pool));
  } finally {
    await pool.end();
  }
}
