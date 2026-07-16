export type VerificationStatus = "pass" | "warn" | "fail";
export type FindingSeverity = "info" | "warning" | "critical";

export interface ReconciliationResult {
  checkName: string;
  status: VerificationStatus;
  expectedValue: string | null;
  actualValue: string | null;
  variance: string | null;
  tolerance: string | null;
  diagnostics: Record<string, unknown>;
}

export interface HealthFinding {
  checkName: string;
  status: VerificationStatus;
  severity: FindingSeverity;
  message: string;
  diagnostics: Record<string, unknown>;
}

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

export function compareNumeric(input: {
  checkName: string;
  expected: bigint | undefined;
  actual: bigint | undefined;
  tolerance?: bigint;
  diagnostics?: Record<string, unknown>;
}): ReconciliationResult {
  const tolerance = input.tolerance ?? 0n;
  if (input.expected === undefined || input.actual === undefined)
    return {
      checkName: input.checkName,
      status: "warn",
      expectedValue: input.expected?.toString() ?? null,
      actualValue: input.actual?.toString() ?? null,
      variance: null,
      tolerance: tolerance.toString(),
      diagnostics: {
        reason: "required_input_unavailable",
        ...input.diagnostics,
      },
    };

  const variance = input.actual - input.expected;
  return {
    checkName: input.checkName,
    status: absolute(variance) <= tolerance ? "pass" : "fail",
    expectedValue: input.expected.toString(),
    actualValue: input.actual.toString(),
    variance: variance.toString(),
    tolerance: tolerance.toString(),
    diagnostics: input.diagnostics ?? {},
  };
}

export function reconcileDelta(input: {
  checkName: string;
  start: bigint | undefined;
  netChange: bigint | undefined;
  end: bigint | undefined;
  tolerance?: bigint;
  diagnostics?: Record<string, unknown>;
}) {
  return compareNumeric({
    checkName: input.checkName,
    expected:
      input.start === undefined || input.netChange === undefined
        ? undefined
        : input.start + input.netChange,
    actual: input.end,
    tolerance: input.tolerance,
    diagnostics: {
      start: input.start?.toString() ?? null,
      netChange: input.netChange?.toString() ?? null,
      ...input.diagnostics,
    },
  });
}

export interface CoreReconciliationInput {
  startUsdpSupply?: bigint;
  endUsdpSupply?: bigint;
  usdpMinted?: bigint;
  usdpBurned?: bigint;
  startSusdpSupply?: bigint;
  endSusdpSupply?: bigint;
  susdpMinted?: bigint;
  susdpBurned?: bigint;
  startActualAssets?: bigint;
  endActualAssets?: bigint;
  depositedAssets?: bigint;
  withdrawnAssets?: bigint;
  accruedAssets?: bigint;
  directUnderlyingNet?: bigint;
  convertedTotalSupplyAssets?: bigint;
  endTotalAssets?: bigint;
  holderBalanceSum?: bigint;
  holderHistoryComplete: boolean;
  rateIntegratedYpo?: bigint;
  nativeYpo?: bigint;
  indexedThroughBlock?: bigint;
  requestedToBlock: bigint;
}

export function evaluateCoreReconciliations(
  input: CoreReconciliationInput,
): ReconciliationResult[] {
  const available = (...values: Array<bigint | undefined>) =>
    values.every((value) => value !== undefined);
  const usdpNet = available(input.usdpMinted, input.usdpBurned)
    ? input.usdpMinted! - input.usdpBurned!
    : undefined;
  const susdpNet = available(input.susdpMinted, input.susdpBurned)
    ? input.susdpMinted! - input.susdpBurned!
    : undefined;
  const underlyingNet = available(
    input.depositedAssets,
    input.withdrawnAssets,
    input.accruedAssets,
    input.directUnderlyingNet,
  )
    ? input.depositedAssets! -
      input.withdrawnAssets! +
      input.accruedAssets! +
      input.directUnderlyingNet!
    : undefined;

  return [
    reconcileDelta({
      checkName: "usdp_supply_delta_vs_mint_burn",
      start: input.startUsdpSupply,
      netChange: usdpNet,
      end: input.endUsdpSupply,
      diagnostics: {
        minted: input.usdpMinted?.toString() ?? null,
        burned: input.usdpBurned?.toString() ?? null,
      },
    }),
    reconcileDelta({
      checkName: "susdp_supply_delta_vs_share_mint_burn",
      start: input.startSusdpSupply,
      netChange: susdpNet,
      end: input.endSusdpSupply,
      diagnostics: {
        minted: input.susdpMinted?.toString() ?? null,
        burned: input.susdpBurned?.toString() ?? null,
      },
    }),
    reconcileDelta({
      checkName: "susdp_underlying_balance_accounting",
      start: input.startActualAssets,
      netChange: underlyingNet,
      end: input.endActualAssets,
      tolerance: 1n,
      diagnostics: {
        deposits: input.depositedAssets?.toString() ?? null,
        withdrawals: input.withdrawnAssets?.toString() ?? null,
        accrued: input.accruedAssets?.toString() ?? null,
        directUnderlyingNet: input.directUnderlyingNet?.toString() ?? null,
      },
    }),
    compareNumeric({
      checkName: "convert_to_assets_total_supply_vs_total_assets",
      expected: input.endTotalAssets,
      actual: input.convertedTotalSupplyAssets,
      tolerance: 1n,
    }),
    compareNumeric({
      checkName: "holder_ledger_sum_vs_susdp_supply",
      expected: input.holderHistoryComplete ? input.endSusdpSupply : undefined,
      actual: input.holderHistoryComplete ? input.holderBalanceSum : undefined,
      diagnostics: { holderHistoryComplete: input.holderHistoryComplete },
    }),
    compareNumeric({
      checkName: "ypo_event_pending_vs_rate_integration",
      expected: input.rateIntegratedYpo,
      actual: input.nativeYpo,
      tolerance: 1n,
    }),
    compareNumeric({
      checkName: "indexed_head_vs_requested_finalized_head",
      expected: input.requestedToBlock,
      actual: input.indexedThroughBlock,
    }),
  ];
}

export interface HealthInput {
  checkpointAgeSeconds?: number;
  checkpointMaximumAgeSeconds: number;
  coverageGapCount: number;
  decodeFailureCount: number;
  duplicateLogCount: number;
  rpcRetryCount: number;
  rpcFailureCount: number;
  priceAgeSeconds?: number;
  priceMaximumAgeSeconds: number;
  implementationMatchesManifest?: boolean;
  nativeYpo?: bigint;
  holderHistoryComplete: boolean;
}

function finding(
  checkName: string,
  status: VerificationStatus,
  severity: FindingSeverity,
  message: string,
  diagnostics: Record<string, unknown>,
): HealthFinding {
  return { checkName, status, severity, message, diagnostics };
}

export function evaluateHealth(input: HealthInput): HealthFinding[] {
  const checkpointStatus =
    input.checkpointAgeSeconds === undefined
      ? "warn"
      : input.checkpointAgeSeconds <= input.checkpointMaximumAgeSeconds
        ? "pass"
        : "fail";
  const priceStatus =
    input.priceAgeSeconds === undefined
      ? "warn"
      : input.priceAgeSeconds <= input.priceMaximumAgeSeconds
        ? "pass"
        : "fail";
  const implementationStatus =
    input.implementationMatchesManifest === undefined
      ? "warn"
      : input.implementationMatchesManifest
        ? "pass"
        : "fail";
  const ypoStatus =
    input.nativeYpo === undefined
      ? "warn"
      : input.nativeYpo >= 0n
        ? "pass"
        : "fail";

  return [
    finding(
      "checkpoint_freshness",
      checkpointStatus,
      checkpointStatus === "fail" ? "critical" : "info",
      checkpointStatus === "pass"
        ? "Checkpoint is fresh"
        : checkpointStatus === "warn"
          ? "Checkpoint freshness is unavailable"
          : "Checkpoint is stale",
      {
        ageSeconds: input.checkpointAgeSeconds ?? null,
        maximumAgeSeconds: input.checkpointMaximumAgeSeconds,
      },
    ),
    finding(
      "block_coverage_gaps",
      input.coverageGapCount === 0 ? "pass" : "fail",
      input.coverageGapCount === 0 ? "info" : "critical",
      input.coverageGapCount === 0
        ? "Requested coverage is gap-free"
        : "Requested coverage contains block gaps",
      { gapCount: input.coverageGapCount },
    ),
    finding(
      "decode_failures",
      input.decodeFailureCount === 0 ? "pass" : "fail",
      input.decodeFailureCount === 0 ? "info" : "critical",
      input.decodeFailureCount === 0
        ? "All recognized protocol logs decoded"
        : "Recognized protocol logs failed to decode",
      { count: input.decodeFailureCount },
    ),
    finding(
      "duplicate_logs",
      input.duplicateLogCount === 0 ? "pass" : "fail",
      input.duplicateLogCount === 0 ? "info" : "critical",
      input.duplicateLogCount === 0
        ? "No duplicate raw-log identities found"
        : "Duplicate raw-log identities found",
      { count: input.duplicateLogCount },
    ),
    finding(
      "rpc_degradation",
      input.rpcFailureCount > 0
        ? "fail"
        : input.rpcRetryCount > 0
          ? "warn"
          : "pass",
      input.rpcFailureCount > 0 ? "critical" : "warning",
      input.rpcFailureCount > 0
        ? "RPC failures occurred in the verified range"
        : input.rpcRetryCount > 0
          ? "RPC retries occurred but completed work remained durable"
          : "No RPC degradation recorded",
      {
        retries: input.rpcRetryCount,
        failures: input.rpcFailureCount,
      },
    ),
    finding(
      "price_freshness",
      priceStatus,
      priceStatus === "fail" ? "warning" : "info",
      priceStatus === "pass"
        ? "Price observation is fresh"
        : priceStatus === "warn"
          ? "Price freshness is unavailable"
          : "Price observation is stale",
      {
        ageSeconds: input.priceAgeSeconds ?? null,
        maximumAgeSeconds: input.priceMaximumAgeSeconds,
      },
    ),
    finding(
      "implementation_drift",
      implementationStatus,
      implementationStatus === "fail" ? "critical" : "info",
      implementationStatus === "pass"
        ? "Boundary implementations match"
        : implementationStatus === "warn"
          ? "Implementation evidence is unavailable"
          : "Implementation changed inside the verified interval",
      {},
    ),
    finding(
      "negative_ypo",
      ypoStatus,
      ypoStatus === "fail" ? "critical" : "info",
      ypoStatus === "pass"
        ? "Native YPO is non-negative"
        : ypoStatus === "warn"
          ? "Native YPO is unavailable"
          : "Native YPO is negative",
      { nativeYpo: input.nativeYpo?.toString() ?? null },
    ),
    finding(
      "holder_history_completeness",
      input.holderHistoryComplete ? "pass" : "warn",
      input.holderHistoryComplete ? "info" : "warning",
      input.holderHistoryComplete
        ? "Holder history is complete"
        : "Holder metrics remain partial until lifetime replay completes",
      { complete: input.holderHistoryComplete },
    ),
  ];
}

export function summarizeVerification(
  results: ReconciliationResult[],
  findings: HealthFinding[],
) {
  const counts = (values: Array<{ status: VerificationStatus }>) => ({
    pass: values.filter((value) => value.status === "pass").length,
    warn: values.filter((value) => value.status === "warn").length,
    fail: values.filter((value) => value.status === "fail").length,
  });
  const reconciliation = counts(results);
  const health = counts(findings);
  const criticalFailures = findings.filter(
    (value) => value.status === "fail" && value.severity === "critical",
  ).length;
  const status: VerificationStatus =
    reconciliation.fail > 0 || criticalFailures > 0
      ? "fail"
      : reconciliation.warn > 0 || health.warn > 0 || health.fail > 0
        ? "warn"
        : "pass";
  return { status, reconciliation, health, criticalFailures };
}
