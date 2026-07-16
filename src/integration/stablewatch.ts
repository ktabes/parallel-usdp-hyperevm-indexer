import { parallelAssetRegistry } from "@/protocol/assets";
import { savingsChainAdapters } from "@/protocol/savings-chains";

type Availability = "available" | "stale" | "unavailable";
type Verification = "verified" | "candidate" | "not_applicable";

export interface MetricValue {
  availability: Availability;
  verification: Verification;
  value: string | null;
  unit: string;
  asOf?: string;
  reason?: string;
  calculationVersion?: string;
  attribution?: string;
}

interface GlobalSavingsInput {
  status: string;
  asOf?: string;
  freshness?: {
    stale?: boolean;
    currentMaximumAgeSeconds?: number | null;
    maximumAllowedAgeSeconds?: number;
  };
  coverage?: {
    expectedChainCount?: number;
    includedChainCount?: number;
    expectedChainIds?: number[];
    includedChainIds?: number[];
    missingChainIds?: number[];
    staleChainIds?: number[];
  };
  usdp?: {
    supplyOnSavingsChains?: string;
    scope?: string;
    globalSupplyStatus?: string;
  };
  susdp?: {
    totalAssetsUsdp?: string;
    totalSupply?: string;
    weightedEstimatedApy?: string | null;
    coverageStatus?: string;
  };
  components?: Array<{
    chainId: number;
    chainSlug: string;
    blockNumber: string;
    blockHash: string;
    blockTimestamp: string;
    status: string;
    usdpTotalSupply: string;
    susdpTotalAssets: string;
    susdpActualAssets: string;
    susdpPendingYield: string;
    susdpTotalSupply: string;
    susdpSharePriceUsdp: string;
    susdpEstimatedApy: string;
    susdpPauseState: number;
    assetRelationshipVerified: boolean;
    manifestVersion: string;
    calculationVersion: string;
  }>;
  calculationVersion?: string;
}

interface HistoryInput {
  status: string;
  reason?: string;
  chains?: Array<{
    chainId: number;
    chainSlug: string;
    fromBlock: string;
    toBlock: string;
    windowStart: string;
    windowEnd: string;
    accruedInterest: string;
    pendingYieldAtStart: string;
    pendingYieldAtEnd: string;
    nativeYpo: string;
    coverageScope: string;
    windowConvention: string;
    reconciliationStatus: string;
    manifestVersion: string;
    calculationVersion: string;
  }>;
  global?: {
    windowStart: string;
    windowEnd: string;
    coverageStatus: string;
    nativeYpo: string;
    includedChainIds: number[];
    missingChainIds: number[];
    unreconciledChainIds: number[];
    calculationVersion: string;
  } | null;
}

interface PricesInput {
  status: string;
  blockNumber?: string;
  blockTimestamp?: string | Date;
  usdp?: {
    priceUsdAtomic: string;
    decimals: number;
    source: string;
    stale: boolean;
    metadata?: unknown;
  };
  susdp?: {
    priceUsdAtomic: string;
    decimals: number;
    source: string;
    stale: boolean;
    metadata?: unknown;
  };
}

export interface StablewatchPayloadInput {
  global: GlobalSavingsInput;
  history: HistoryInput;
  prices: PricesInput;
  generatedAt?: string;
}

function availableMetric(
  value: string,
  unit: string,
  options: Omit<MetricValue, "availability" | "value" | "unit">,
): MetricValue {
  return { availability: "available", value, unit, ...options };
}

function unavailableMetric(
  unit: string,
  reason: string,
  verification: Verification = "candidate",
): MetricValue {
  return {
    availability: "unavailable",
    verification,
    value: null,
    unit,
    reason,
  };
}

function staleMetric(metric: MetricValue): MetricValue {
  return metric.availability === "available"
    ? { ...metric, availability: "stale", reason: "source_snapshot_stale" }
    : metric;
}

function multiplyByUsdPrice(
  tokenBaseUnits: string,
  priceUsdAtomic: string,
  priceDecimals: number,
) {
  return (
    (BigInt(tokenBaseUnits) * BigInt(priceUsdAtomic)) /
    10n ** BigInt(priceDecimals)
  ).toString();
}

function iso(value: string | Date | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function buildStablewatchAssetPayload({
  global,
  history,
  prices,
  generatedAt = new Date().toISOString(),
}: StablewatchPayloadInput) {
  const globalAvailable = Boolean(
    global.susdp?.totalAssetsUsdp && global.usdp?.supplyOnSavingsChains,
  );
  const currentVerification: Verification = "candidate";
  const currentAsOf = global.asOf;
  const currentStale = global.status === "stale" || global.freshness?.stale;
  const priceAvailable = Boolean(prices.usdp?.priceUsdAtomic);
  const priceStale = prices.usdp?.stale ?? true;
  const priceAsOf = iso(prices.blockTimestamp);

  let tvlUsdp = globalAvailable
    ? availableMetric(global.susdp!.totalAssetsUsdp!, "usdp_base_units", {
        verification: currentVerification,
        asOf: currentAsOf,
        calculationVersion: global.calculationVersion,
      })
    : unavailableMetric("usdp_base_units", "global_savings_snapshot_missing");
  if (currentStale) tvlUsdp = staleMetric(tvlUsdp);

  let tvlUsdEstimate =
    globalAvailable && priceAvailable
      ? availableMetric(
          multiplyByUsdPrice(
            global.susdp!.totalAssetsUsdp!,
            prices.usdp!.priceUsdAtomic,
            prices.usdp!.decimals,
          ),
          "usd_atomic_18",
          {
            verification: "candidate",
            asOf: currentAsOf,
            calculationVersion:
              "parallel-stablewatch-attributed-usd-v1-candidate",
            attribution: `${prices.usdp!.source} USDp/USD price observed on HyperEVM at ${priceAsOf ?? "unknown time"}`,
          },
        )
      : unavailableMetric(
          "usd_atomic_18",
          globalAvailable
            ? "usdp_usd_price_missing"
            : "global_savings_snapshot_missing",
        );
  if (currentStale || priceStale) tvlUsdEstimate = staleMetric(tvlUsdEstimate);

  let estimatedApy = global.susdp?.weightedEstimatedApy
    ? availableMetric(global.susdp.weightedEstimatedApy, "fixed_18", {
        verification: currentVerification,
        asOf: currentAsOf,
        calculationVersion: global.calculationVersion,
        attribution:
          "TVL-weighted onchain estimated APY; not trailing realized APY",
      })
    : unavailableMetric("fixed_18", "weighted_estimated_apy_missing");
  if (currentStale) estimatedApy = staleMetric(estimatedApy);

  const globalHistoryVerified =
    history.global?.coverageStatus === "complete" &&
    history.global.missingChainIds.length === 0 &&
    history.global.unreconciledChainIds.length === 0;
  const ypoSevenDay = globalHistoryVerified
    ? availableMetric(history.global!.nativeYpo, "usdp_base_units", {
        verification: "verified",
        asOf: history.global!.windowEnd,
        calculationVersion: history.global!.calculationVersion,
      })
    : unavailableMetric(
        "usdp_base_units",
        "aligned_five_chain_reconciled_window_pending",
      );

  const historyByChain = new Map(
    (history.chains ?? []).map((chain) => [chain.chainId, chain]),
  );
  const priceMetric = prices.usdp
    ? availableMetric(prices.usdp.priceUsdAtomic, "usd_atomic", {
        verification: "candidate",
        asOf: priceAsOf,
        attribution: prices.usdp.source,
      })
    : unavailableMetric("usd_atomic", "usdp_usd_price_missing");
  const susdpPriceMetric = prices.susdp
    ? availableMetric(prices.susdp.priceUsdAtomic, "usd_atomic", {
        verification: "candidate",
        asOf: priceAsOf,
        attribution: prices.susdp.source,
      })
    : unavailableMetric("usd_atomic", "susdp_usd_price_missing");

  return {
    schemaVersion: "parallel-stablewatch-asset-v1",
    generatedAt,
    status: globalHistoryVerified ? "candidate" : "partial",
    protocol: {
      id: "parallel-v3",
      name: "Parallel",
      category: "stablecoin-issuer-and-savings-vault",
      website: "https://parallel.best",
    },
    asset: {
      id: "parallel-usdp-susdp",
      stablecoin: {
        id: parallelAssetRegistry.assets.usdp.id,
        symbol: parallelAssetRegistry.assets.usdp.symbol,
        name: parallelAssetRegistry.assets.usdp.name,
        decimals: parallelAssetRegistry.assets.usdp.decimals,
        expectedDeploymentCount:
          parallelAssetRegistry.assets.usdp.deployments.length,
      },
      savingsToken: {
        id: parallelAssetRegistry.assets.susdp.id,
        symbol: parallelAssetRegistry.assets.susdp.symbol,
        name: parallelAssetRegistry.assets.susdp.name,
        decimals: parallelAssetRegistry.assets.susdp.decimals,
        standard: "ERC-4626",
        underlyingAssetId: "usdp",
      },
      classifications: [
        "yield-bearing-stablecoin",
        "erc-4626",
        "native-stablecoin-yield",
      ],
      chainIds: savingsChainAdapters.map((adapter) => adapter.chainId),
    },
    marketRow: {
      asset: "sUSDp",
      protocol: "Parallel",
      tvlUsdp,
      tvlUsdEstimate,
      tvlSevenDayChange: unavailableMetric(
        "fixed_18",
        "aligned_tvl_time_series_not_backfilled",
      ),
      estimatedApy,
      realizedApySevenDay: unavailableMetric(
        "fixed_18",
        "realized_trailing_apy_not_yet_reconciled",
      ),
      realizedApyThirtyDay: unavailableMetric(
        "fixed_18",
        "thirty_day_history_not_backfilled",
      ),
      ypoSevenDay,
      ypoThirtyDay: unavailableMetric(
        "usdp_base_units",
        "thirty_day_history_not_backfilled",
      ),
      ypoNinetyDay: unavailableMetric(
        "usdp_base_units",
        "ninety_day_history_not_backfilled",
      ),
      ypoAllTime: unavailableMetric(
        "usdp_base_units",
        "lifetime_history_not_backfilled",
      ),
    },
    detail: {
      headline: {
        tvlUsdp,
        tvlUsdEstimate,
        usdpPriceUsd: prices.usdp?.stale
          ? staleMetric(priceMetric)
          : priceMetric,
        susdpMarketPriceUsd: prices.susdp?.stale
          ? staleMetric(susdpPriceMetric)
          : susdpPriceMetric,
        estimatedApy,
        ypoSevenDay,
      },
      usdpSupply: {
        onSavingsChains: global.usdp?.supplyOnSavingsChains
          ? availableMetric(
              global.usdp.supplyOnSavingsChains,
              "usdp_base_units",
              {
                verification: "candidate",
                asOf: currentAsOf,
                calculationVersion: global.calculationVersion,
              },
            )
          : unavailableMetric(
              "usdp_base_units",
              "savings_chain_supply_missing",
            ),
        global: unavailableMetric(
          "usdp_base_units",
          "twenty_four_chain_bridge_reconciliation_pending",
        ),
      },
      chainBreakdown: (global.components ?? [])
        .map((component) => {
          const interval = historyByChain.get(component.chainId);
          const chainTvlUsd = prices.usdp
            ? availableMetric(
                multiplyByUsdPrice(
                  component.susdpTotalAssets,
                  prices.usdp.priceUsdAtomic,
                  prices.usdp.decimals,
                ),
                "usd_atomic_18",
                {
                  verification: "candidate",
                  asOf: component.blockTimestamp,
                  attribution: `${prices.usdp.source} cross-chain USDp price attribution`,
                },
              )
            : unavailableMetric("usd_atomic_18", "usdp_usd_price_missing");
          return {
            chainId: component.chainId,
            chainSlug: component.chainSlug,
            chainName:
              savingsChainAdapters.find(
                (adapter) => adapter.chainId === component.chainId,
              )?.chainName ?? component.chainSlug,
            status: component.status,
            block: {
              number: component.blockNumber,
              hash: component.blockHash,
              timestamp: component.blockTimestamp,
            },
            usdpTotalSupply: component.usdpTotalSupply,
            susdpTotalAssets: component.susdpTotalAssets,
            susdpTvlUsdEstimate: prices.usdp?.stale
              ? staleMetric(chainTvlUsd)
              : chainTvlUsd,
            susdpActualAssets: component.susdpActualAssets,
            susdpPendingYield: component.susdpPendingYield,
            susdpTotalSupply: component.susdpTotalSupply,
            susdpSharePriceUsdp: component.susdpSharePriceUsdp,
            estimatedApy: component.susdpEstimatedApy,
            pauseState: component.susdpPauseState,
            assetRelationshipVerified: component.assetRelationshipVerified,
            ypoSevenDay: interval
              ? availableMetric(interval.nativeYpo, "usdp_base_units", {
                  verification:
                    interval.reconciliationStatus === "verified"
                      ? "verified"
                      : "candidate",
                  asOf: interval.windowEnd,
                  calculationVersion: interval.calculationVersion,
                })
              : unavailableMetric(
                  "usdp_base_units",
                  "chain_history_backfill_or_reconciliation_pending",
                ),
            history: interval
              ? {
                  windowStart: interval.windowStart,
                  windowEnd: interval.windowEnd,
                  fromBlock: interval.fromBlock,
                  toBlock: interval.toBlock,
                  coverageScope: interval.coverageScope,
                  reconciliationStatus: interval.reconciliationStatus,
                  windowConvention: interval.windowConvention,
                }
              : null,
            manifestVersion: component.manifestVersion,
            calculationVersion: component.calculationVersion,
          };
        })
        .sort(
          (left, right) =>
            savingsChainAdapters.findIndex(
              (adapter) => adapter.chainId === left.chainId,
            ) -
            savingsChainAdapters.findIndex(
              (adapter) => adapter.chainId === right.chainId,
            ),
        ),
      charts: {
        tvl: {
          status: "unavailable",
          reason: "aligned_tvl_time_series_not_backfilled",
          points: [],
        },
        apy: {
          status: "unavailable",
          reason: "realized_apy_time_series_not_backfilled",
          points: [],
        },
        ypo: {
          status: globalHistoryVerified ? "available" : "partial",
          reason: globalHistoryVerified
            ? null
            : "aligned_five_chain_reconciled_window_pending",
          components: (history.chains ?? []).map((chain) => ({
            chainId: chain.chainId,
            chainSlug: chain.chainSlug,
            windowStart: chain.windowStart,
            windowEnd: chain.windowEnd,
            nativeYpo: chain.nativeYpo,
            reconciliationStatus: chain.reconciliationStatus,
          })),
        },
      },
    },
    trust: {
      freshness: global.freshness ?? null,
      coverage: global.coverage ?? null,
      globalHistoryStatus: history.status,
      expectedSavingsChainIds: savingsChainAdapters.map(
        (adapter) => adapter.chainId,
      ),
      verifiedHistoricalChainIds: (history.chains ?? [])
        .filter((chain) => chain.reconciliationStatus === "verified")
        .map((chain) => chain.chainId),
      missingHistoricalChainIds: savingsChainAdapters
        .map((adapter) => adapter.chainId)
        .filter(
          (chainId) =>
            !(history.chains ?? []).some(
              (chain) =>
                chain.chainId === chainId &&
                chain.reconciliationStatus === "verified",
            ),
        ),
      currentCalculationVersion: global.calculationVersion ?? null,
      registrySource: parallelAssetRegistry.source,
    },
    nonApplicableMetrics: [
      "native_borrowers",
      "native_borrows",
      "native_repays",
      "native_liquidations",
    ],
    sources: [
      parallelAssetRegistry.source,
      "https://docs.parallel.best/developers-hub/contract-addresses/parallel-v3/usdp",
      "https://github.com/parallel-protocol/parallel-parallelizer",
    ],
  };
}
