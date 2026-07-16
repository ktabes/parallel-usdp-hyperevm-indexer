import { NextResponse } from "next/server";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { readPrices } from "@/analytics/queries";
import { readLatestGlobalUsdpSupply } from "@/analytics/usdp-supply-queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { buildStablewatchAssetPayload } from "@/integration/stablewatch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = parseRuntimeEnv(process.env);
    const { pool } = createDatabase(env);
    try {
      const [global, globalUsdp, history, prices] = await Promise.all([
        readLatestGlobalSavings(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
        readLatestGlobalUsdpSupply(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
        readLatestSavingsHistory(pool),
        readPrices(pool),
      ]);
      return NextResponse.json(
        buildStablewatchAssetPayload({ global, globalUsdp, history, prices }),
      );
    } finally {
      await pool.end();
    }
  } catch {
    return NextResponse.json(
      { status: "unavailable", error: "analytics_snapshot_unavailable" },
      { status: 503 },
    );
  }
}
