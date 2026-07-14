import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "parallel-usdp-hyperevm-indexer",
    phase: 0,
    timestamp: new Date().toISOString(),
  });
}
