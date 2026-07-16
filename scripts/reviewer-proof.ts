import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL =
  "https://content-spirit-production-5efa.up.railway.app";

interface CheckResult {
  id: string;
  status: "pass";
  evidence: unknown;
}

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, name: string) {
  requireCondition(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${name} must be an object`,
  );
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string) {
  requireCondition(Array.isArray(value), `${name} must be an array`);
  return value;
}

function decimalString(value: unknown, name: string) {
  requireCondition(
    typeof value === "string" && /^\d+$/.test(value),
    `${name} must be an unsigned decimal string`,
  );
  return value;
}

async function fetchJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  requireCondition(response.ok, `${path} returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export function verifyHealth(payload: unknown): CheckResult {
  const health = object(payload, "health payload");
  requireCondition(health.status === "ok", "health status must be ok");
  requireCondition(
    health.service === "parallel-usdp-hyperevm-indexer",
    "health service identity mismatch",
  );
  return {
    id: "service-health",
    status: "pass",
    evidence: {
      service: health.service,
      phase: health.phase,
      phaseStatus: health.phaseStatus,
      timestamp: health.timestamp,
    },
  };
}

export function verifyGlobalUsdpSupply(payload: unknown): CheckResult {
  const supply = object(payload, "USDp supply payload");
  const coverage = object(supply.coverage, "USDp supply coverage");
  const components = array(supply.components, "USDp supply components");
  requireCondition(
    supply.snapshotStatus === "complete",
    "USDp supply snapshot coverage must be complete",
  );
  requireCondition(
    coverage.expectedChainCount === 24 && coverage.includedChainCount === 24,
    "USDp supply must include all 24 registered chains",
  );
  requireCondition(
    array(coverage.missingChainIds, "missing chain IDs").length === 0 &&
      array(coverage.staleChainIds, "stale chain IDs").length === 0 &&
      array(coverage.failedChainIds, "failed chain IDs").length === 0,
    "USDp supply must have no missing, stale, or failed components",
  );
  requireCondition(
    components.length === 24,
    "USDp supply must expose 24 components",
  );
  requireCondition(
    components.every((component) => {
      const row = object(component, "USDp component");
      return object(row.metadata, "USDp component metadata").verified === true;
    }),
    "every USDp component must pass metadata verification",
  );
  const candidateTotalSupply = decimalString(
    supply.candidateTotalSupply,
    "candidateTotalSupply",
  );
  return {
    id: "global-usdp-supply",
    status: "pass",
    evidence: {
      snapshotStatus: supply.snapshotStatus,
      accountingStatus: supply.accountingStatus,
      candidateTotalSupply,
      includedChainCount: coverage.includedChainCount,
      componentSkewSeconds: coverage.componentSkewSeconds,
      asOf: supply.asOf,
    },
  };
}

export function verifyBaseLifetimeRange(payload: unknown): CheckResult {
  const range = object(payload, "range payload");
  const coverage = object(range.coverage, "range coverage");
  const chains = array(range.chains, "range chains");
  requireCondition(
    range.status === "complete",
    "Base lifetime range must be complete",
  );
  requireCondition(
    coverage.availableComponents === 2 && coverage.missingComponents === 0,
    "Base lifetime range must include USDp and sUSDp",
  );
  requireCondition(chains.length === 1, "Base proof must contain one chain");
  const base = object(chains[0], "Base range component");
  requireCondition(base.chainId === 8453, "Base range chain ID mismatch");
  const assets = object(base.assets, "Base assets");
  const usdp = object(assets.usdp, "Base USDp activity");
  const susdp = object(assets.susdp, "Base sUSDp activity");
  requireCondition(
    usdp.status === "available" && susdp.status === "available",
    "Base asset activity must be available",
  );
  const usdpActivity = object(usdp.activity, "Base USDp activity metrics");
  const susdpActivity = object(susdp.activity, "Base sUSDp activity metrics");
  decimalString(usdpActivity.transferVolume, "Base USDp transfer volume");
  decimalString(susdpActivity.transferVolume, "Base sUSDp transfer volume");
  return {
    id: "base-lifetime-analytics",
    status: "pass",
    evidence: {
      range: range.range,
      usdpTransferCount: usdpActivity.transferCount,
      usdpUniqueParticipants: usdpActivity.uniqueParticipants,
      usdpNewHolders: usdpActivity.newHolders,
      susdpTransferCount: susdpActivity.transferCount,
      currentUsdpHolders: usdp.currentHoldersAtCoverageEnd,
      currentSusdpHolders: susdp.currentHoldersAtCoverageEnd,
    },
  };
}

export function verifyStablewatchProjection(payload: unknown): CheckResult {
  const projection = object(payload, "StableWatch payload");
  requireCondition(
    projection.schemaVersion === "parallel-stablewatch-asset-v1",
    "StableWatch schema version mismatch",
  );
  const detail = object(projection.detail, "StableWatch detail");
  const usdpSupply = object(detail.usdpSupply, "StableWatch USDp supply");
  const global = object(usdpSupply.global, "StableWatch global USDp metric");
  requireCondition(
    global.availability === "available" || global.availability === "stale",
    "StableWatch global USDp metric must be renderable",
  );
  decimalString(global.value, "StableWatch global USDp value");
  requireCondition(
    array(detail.chainBreakdown, "StableWatch chain breakdown").length > 0,
    "StableWatch chain breakdown must be populated",
  );
  return {
    id: "stablewatch-projection",
    status: "pass",
    evidence: {
      schemaVersion: projection.schemaVersion,
      status: projection.status,
      globalUsdpAvailability: global.availability,
      globalUsdpVerification: global.verification,
      generatedAt: projection.generatedAt,
    },
  };
}

async function main() {
  const requestedBaseUrl =
    process.argv
      .find((value) => value.startsWith("--base-url="))
      ?.split("=")[1] ??
    process.env.REVIEW_BASE_URL ??
    DEFAULT_BASE_URL;
  const baseUrl = requestedBaseUrl.replace(/\/$/, "");
  const [health, supply, range, stablewatch] = await Promise.all([
    fetchJson(baseUrl, "/api/health"),
    fetchJson(baseUrl, "/api/analytics/usdp-supply"),
    fetchJson(
      baseUrl,
      "/api/analytics/range?range=all&chains=base&assets=usdp,susdp",
    ),
    fetchJson(baseUrl, "/api/v1/stablewatch/assets/parallel-usdp-susdp"),
  ]);
  const checks = [
    verifyHealth(health),
    verifyGlobalUsdpSupply(supply),
    verifyBaseLifetimeRange(range),
    verifyStablewatchProjection(stablewatch),
  ];
  console.log(
    JSON.stringify(
      {
        status: "pass",
        baseUrl,
        checkedAt: new Date().toISOString(),
        checks,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
