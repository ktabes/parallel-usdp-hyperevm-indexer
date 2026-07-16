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

const lifetimeChainIds = [1, 8453, 146, 43114] as const;

export function verifyLifetimeRange(payload: unknown): CheckResult {
  const range = object(payload, "range payload");
  const coverage = object(range.coverage, "range coverage");
  const chains = array(range.chains, "range chains");
  requireCondition(
    range.status === "complete",
    "lifetime range must be complete",
  );
  requireCondition(
    coverage.availableComponents === lifetimeChainIds.length * 2 &&
      coverage.missingComponents === 0,
    "lifetime range must include USDp and sUSDp on all four lifetime chains",
  );
  requireCondition(
    chains.length === lifetimeChainIds.length,
    "lifetime proof must contain four chains",
  );
  const evidence = chains.map((value) => {
    const chain = object(value, "lifetime chain component");
    requireCondition(
      typeof chain.chainId === "number" &&
        lifetimeChainIds.includes(
          chain.chainId as (typeof lifetimeChainIds)[number],
        ),
      "unexpected lifetime chain ID",
    );
    const assets = object(chain.assets, "lifetime assets");
    const usdp = object(assets.usdp, "lifetime USDp activity");
    const susdp = object(assets.susdp, "lifetime sUSDp activity");
    requireCondition(
      usdp.status === "available" && susdp.status === "available",
      `USDp and sUSDp activity must be available on chain ${chain.chainId}`,
    );
    for (const [assetName, asset] of [
      ["USDp", usdp],
      ["sUSDp", susdp],
    ] as const) {
      const assetCoverage = object(
        asset.coverage,
        `${assetName} lifetime coverage`,
      );
      requireCondition(
        assetCoverage.historyComplete === true,
        `${assetName} lifetime coverage must be complete on chain ${chain.chainId}`,
      );
      const activity = object(asset.activity, `${assetName} activity metrics`);
      decimalString(
        activity.transferVolume,
        `${assetName} transfer volume on chain ${chain.chainId}`,
      );
      requireCondition(
        typeof activity.transferCount === "number" &&
          activity.transferCount >= 0,
        `${assetName} transfer count must be non-negative on chain ${chain.chainId}`,
      );
    }
    const savings = object(chain.savings, "lifetime savings analytics");
    const flows = object(savings.flows, "lifetime savings flows");
    decimalString(
      flows.depositedAssets,
      `deposited assets on chain ${chain.chainId}`,
    );
    decimalString(
      flows.withdrawnAssets,
      `withdrawn assets on chain ${chain.chainId}`,
    );
    return {
      chainId: chain.chainId,
      chainSlug: chain.chainSlug,
      usdpTransferCount: object(usdp.activity, "USDp activity").transferCount,
      susdpTransferCount: object(susdp.activity, "sUSDp activity")
        .transferCount,
      currentUsdpHolders: usdp.currentHoldersAtCoverageEnd,
      currentSusdpHolders: susdp.currentHoldersAtCoverageEnd,
      depositCount: flows.depositCount,
      withdrawCount: flows.withdrawCount,
    };
  });
  requireCondition(
    lifetimeChainIds.every((chainId) =>
      evidence.some((component) => component.chainId === chainId),
    ),
    "lifetime proof is missing a required chain",
  );
  return {
    id: "four-chain-lifetime-analytics",
    status: "pass",
    evidence: {
      range: range.range,
      chains: evidence,
    },
  };
}

export function verifySavingsHistory(payload: unknown): CheckResult {
  const history = object(payload, "savings history payload");
  const chains = array(history.chains, "savings history chains");
  const expectedChainIds = [1, 8453, 146, 999, 43114];
  requireCondition(
    chains.length === expectedChainIds.length,
    "savings history must expose all five chains",
  );
  const evidence = chains.map((value) => {
    const chain = object(value, "savings history chain");
    requireCondition(
      typeof chain.chainId === "number" &&
        expectedChainIds.includes(chain.chainId),
      "unexpected savings history chain ID",
    );
    requireCondition(
      chain.reconciliationStatus === "verified",
      `savings history must be verified on chain ${chain.chainId}`,
    );
    decimalString(chain.nativeYpo, `native YPO on chain ${chain.chainId}`);
    if (chain.chainId === 999) {
      requireCondition(
        chain.coverageScope ===
          "parallel-savings-hyperevm-1783558757-1784163557-v1" &&
          chain.fromBlock === "39958147" &&
          chain.toBlock === "40572940",
        "HyperEVM fixed seven-day provenance mismatch",
      );
    }
    return {
      chainId: chain.chainId,
      chainSlug: chain.chainSlug,
      fromBlock: chain.fromBlock,
      toBlock: chain.toBlock,
      nativeYpo: chain.nativeYpo,
      reconciliationStatus: chain.reconciliationStatus,
    };
  });
  requireCondition(
    expectedChainIds.every((chainId) =>
      evidence.some((component) => component.chainId === chainId),
    ),
    "savings history is missing a required chain",
  );
  const global = object(history.global, "global savings history");
  requireCondition(
    history.status === "complete" && global.coverageStatus === "complete",
    "global savings history must have complete aligned coverage",
  );
  requireCondition(
    global.expectedChainCount === 5 &&
      global.includedChainCount === 5 &&
      array(global.missingChainIds, "global missing chain IDs").length === 0 &&
      array(global.unreconciledChainIds, "global unreconciled chain IDs")
        .length === 0,
    "global savings history must include five reconciled chains",
  );
  decimalString(global.nativeYpo, "global native YPO");
  return {
    id: "five-chain-aligned-ypo",
    status: "pass",
    evidence: {
      windowStart: global.windowStart,
      windowEnd: global.windowEnd,
      nativeYpo: global.nativeYpo,
      chains: evidence,
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
  const [health, supply, range, history, stablewatch] = await Promise.all([
    fetchJson(baseUrl, "/api/health"),
    fetchJson(baseUrl, "/api/analytics/usdp-supply"),
    fetchJson(
      baseUrl,
      "/api/analytics/range?range=all&chains=ethereum,base,sonic,avalanche&assets=usdp,susdp",
    ),
    fetchJson(baseUrl, "/api/analytics/history"),
    fetchJson(baseUrl, "/api/v1/stablewatch/assets/parallel-usdp-susdp"),
  ]);
  const checks = [
    verifyHealth(health),
    verifyGlobalUsdpSupply(supply),
    verifyLifetimeRange(range),
    verifySavingsHistory(history),
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
