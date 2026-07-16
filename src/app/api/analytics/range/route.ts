import { NextResponse } from "next/server";
import {
  parseRangeAnalyticsRequest,
  readRangeAnalytics,
} from "@/analytics/range-analytics";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rangeRequest = parseRangeAnalyticsRequest(
      new URL(request.url).searchParams,
    );
    const env = parseRuntimeEnv(process.env);
    const { pool } = createDatabase(env);
    try {
      return NextResponse.json(await readRangeAnalytics(pool, rangeRequest));
    } finally {
      await pool.end();
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: error instanceof Error ? error.message : "invalid request",
      },
      { status: 400 },
    );
  }
}
