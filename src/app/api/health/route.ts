import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "parallel-usdp-hyperevm-indexer",
    phase: 1,
    phaseStatus: "candidate",
    timestamp: new Date().toISOString(),
  });
}
