import Image from "next/image";
import { readLifetimeDashboard } from "@/analytics/dashboard-readiness";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { readPrices } from "@/analytics/queries";
import {
  readLatestGlobalUsdpSupply,
  sumIncludedSupplyOutsideChains,
} from "@/analytics/usdp-supply-queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import {
  buildStablewatchAssetPayload,
  type MetricValue,
} from "@/integration/stablewatch";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

const chainColors: Record<string, string> = {
  ethereum: "#627eea",
  base: "#0052ff",
  sonic: "#ffffff",
  hyperevm: "#97fce4",
  avalanche: "#e84142",
};

function AssetLogo({ asset, size }: { asset: "usdp" | "susdp"; size: number }) {
  const symbol = asset === "usdp" ? "USDp" : "sUSDp";

  return (
    <Image
      className={`asset-logo asset-logo-${asset}`}
      src={`/tokens/${asset}.png`}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      priority
    />
  );
}

function ChainLogo({ slug, name }: { slug: string; name: string }) {
  const common = {
    viewBox: "0 0 32 32",
    role: "img",
    "aria-label": `${name} logo`,
  } as const;

  const mark = (() => {
    switch (slug) {
      case "ethereum":
        return (
          <svg {...common}>
            <path fill="#fff" d="M16 3 8.5 16.2 16 12.8l7.5 3.4L16 3Z" />
            <path fill="#c8d2ff" d="m8.5 17.7 7.5 11.1V14.3l-7.5 3.4Z" />
            <path fill="#fff" d="M16 14.3v14.5l7.5-11.1-7.5-3.4Z" />
          </svg>
        );
      case "base":
        return (
          <svg {...common}>
            <rect width="32" height="32" rx="7" fill="#0052ff" />
          </svg>
        );
      case "sonic":
        return (
          <svg viewBox="0 0 60 57" role="img" aria-label={`${name} logo`}>
            <path
              fill="#fff"
              d="M35.5379 35.0248C24.6296 38.2 15.606 42.8312 9.9576 48.2576l-.2494.2408a28.9 28.9 0 0 0 4.9293 3.6568l.3828-.4536a55.1 55.1 0 0 1 4.9177-5.2528c4.622-4.4632 9.9108-8.3272 15.6057-11.4296l-.0058.0056Z"
            />
            <path
              fill="#fff"
              d="M.7891 30.3207c.4349 5.6616 2.6038 10.8528 6.008 15.0752l.1565-.1512c3.4969-3.3432 8.0493-6.384 13.5411-9.0328 4.8134-2.324 10.34-4.3176 16.2958-5.8912H.7891Z"
            />
            <path
              fill="#fff"
              d="M22.9884 7.0527c9.76 9.4248 22.0427 15.6576 35.5143 18.0208C56.8789 11.1015 44.6078.2319 29.6981.2319c-3.9377 0-7.6898.7616-11.1171 2.1336a57.4 57.4 0 0 0 4.4074 4.6872Z"
            />
            <path
              fill="#fff"
              d="M9.9576 8.2064c5.6484 5.432 14.672 10.0576 25.5803 13.2384-5.6949-3.108-10.9837-6.9664-15.6057-11.4296a55 55 0 0 1-4.9177-5.2528l-.3827-.4536A29 29 0 0 0 9.7082 7.9656l.2494.2408Z"
            />
            <path
              fill="#fff"
              d="M22.9884 49.4111a57.4 57.4 0 0 0-4.4074 4.6872c3.4215 1.372 7.1794 2.1336 11.1171 2.1336 14.9097 0 27.1808-10.8696 28.8104-24.8472-13.4716 2.3632-25.7543 8.596-35.5143 18.0208l-.0058.0056Z"
            />
            <path
              fill="#fff"
              d="M20.4947 20.2519c-5.4918-2.6488-10.0442-5.6896-13.5411-9.0328l-.1566-.1512C3.3929 15.2903 1.224 20.4815.7891 26.1431h35.9956c-5.9558-1.5736-11.4766-3.5672-16.2958-5.8968l.0058.0056Z"
            />
          </svg>
        );
      case "hyperevm":
        return (
          <svg viewBox="-1 -1 22.5 17.5" role="img" aria-label={`${name} logo`}>
            <path
              fill="#07110f"
              d="M20.4543 7.5399c.0186 1.6787-.3328 3.2829-1.0232 4.8155-.9858 2.1824-3.3492 3.9668-5.5074 2.0674-1.7601-1.5482-2.0867-4.6912-4.7238-5.1513-3.4892-.4228-3.5731 3.6217-5.8526 4.0787C.8066 13.8663-.0361 9.5948.0012 7.6549.0385 5.715.5547 2.9886 2.7627 2.9886c2.5407 0 2.7117 3.8456 5.9366 3.6373 3.1937-.2176 3.2497-4.2187 5.3364-5.9317 1.8005-1.4797 3.9183-.3948 4.9787 1.3866.9827 1.6477 1.415 3.5813 1.4368 5.4591h.0031Z"
            />
          </svg>
        );
      case "avalanche":
        return (
          <svg {...common}>
            <circle cx="16" cy="16" r="16" fill="#e84142" />
            <path
              fill="#fff"
              d="M19.0194 25.9801h8.0272c.7083 0 1.1515-.7604.7969-1.3682l-4.0136-6.8912c-.3546-.6078-1.2392-.6078-1.5938 0l-4.0136 6.8912c-.3546.6078.0886 1.3682.7969 1.3682Zm1.0029-14.7947-3.2988-5.6653c-.3331-.5727-1.1674-.5727-1.5005 0L4.1284 24.5699c-.3649.6273.0914 1.4099.8212 1.4099h6.6059c.7046 0 1.355-.3728 1.7068-.9769l6.76-11.6074c.3984-.6836.3984-1.5264 0-2.2101Z"
            />
          </svg>
        );
      default:
        return <span>{name[0]}</span>;
    }
  })();

  return (
    <span
      className={`chain-logo chain-logo-${slug}`}
      style={
        {
          "--chain-color": chainColors[slug] ?? "#c9ff4b",
        } as React.CSSProperties
      }
      title={name}
    >
      {mark}
    </span>
  );
}

function decimal(value: string | null, decimals = 18, fractionDigits = 2) {
  if (value === null) return "Unavailable";
  const amount = Number(value) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(amount);
}

function compact(value: string | null, decimals = 18) {
  if (value === null) return "Unavailable";
  const amount = Number(value) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(amount);
}

function percentage(value: string | null) {
  if (value === null) return "Unavailable";
  return `${decimal((BigInt(value) * 100n).toString(), 18, 2)}%`;
}

function sum(values: Array<string | null | undefined>) {
  return values.reduce<bigint>(
    (total, value) => total + BigInt(value ?? 0),
    0n,
  );
}

function shareOf(value: string | bigint, total: string | bigint) {
  const numerator = BigInt(value);
  const denominator = BigInt(total);
  if (denominator === 0n) return 0;
  return Number((numerator * 100_000n) / denominator) / 1_000;
}

function price(value: string | null) {
  if (value === null) return "—";
  const amount = Number(value) / 1e18;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
}

function displayCalculationVersion(value: string | null) {
  return value?.replace(/-candidate$/, "") ?? "Version pending";
}

function metricClass(metric: MetricValue) {
  if (metric.availability === "stale") return "warning";
  if (metric.availability === "unavailable") return "muted";
  return metric.verification === "verified" ? "verified" : "candidate";
}

function publicationLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "window_only") return "7-day history";
  if (status === "deriving") return "Deriving metrics";
  if (status === "indexing") return "Indexing history";
  return "Queued";
}

function whole(value: number | undefined) {
  return value === undefined ? "—" : value.toLocaleString("en-US");
}

async function dashboardData() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const [global, globalUsdp, history, prices, lifetime] = await Promise.all([
      readLatestGlobalSavings(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
      readLatestGlobalUsdpSupply(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
      readLatestSavingsHistory(pool),
      readPrices(pool),
      readLifetimeDashboard(pool),
    ]);
    return {
      data: buildStablewatchAssetPayload({
        global,
        globalUsdp,
        history,
        lifetime,
        prices,
      }),
      globalUsdp,
      lifetime,
    };
  } finally {
    await pool.end();
  }
}

export default async function Home() {
  const dashboard = await dashboardData();
  const { data, globalUsdp, lifetime } = dashboard;
  const { headline } = data.detail;
  const totalAssets = data.marketRow.tvlUsdp.value
    ? BigInt(data.marketRow.tvlUsdp.value)
    : 0n;
  const savingsSupply = BigInt(
    data.detail.usdpSupply.onSavingsChains.value ?? "0",
  );
  const globalSupply = BigInt(
    data.detail.usdpSupply.global.value ?? savingsSupply.toString(),
  );
  const usdpOnlyDeploymentCount = Math.max(
    0,
    data.asset.stablecoin.expectedDeploymentCount -
      data.detail.chainBreakdown.length,
  );
  const savingsChainIds = new Set(
    data.detail.chainBreakdown.map((chain) => chain.chainId),
  );
  const globalUsdpComponents =
    "components" in globalUsdp && Array.isArray(globalUsdp.components)
      ? globalUsdp.components
      : [];
  const usdpOnlySupply = sumIncludedSupplyOutsideChains(
    globalUsdpComponents,
    savingsChainIds,
  );
  const totalShares = sum(
    data.detail.chainBreakdown.map((chain) => chain.susdpTotalSupply),
  );
  const actualAssets = sum(
    data.detail.chainBreakdown.map((chain) => chain.susdpActualAssets),
  );
  const pendingYield = sum(
    data.detail.chainBreakdown.map((chain) => chain.susdpPendingYield),
  );
  const portfolioSharePrice =
    totalShares > 0n ? (totalAssets * 10n ** 18n) / totalShares : 0n;
  const vaultCapture = shareOf(totalAssets, globalSupply);
  const pendingYieldShare = shareOf(pendingYield, totalAssets);
  const verifiedHistory = data.trust.verifiedHistoricalChainIds.length;
  const publishedLifetimeChains = lifetime.filter(
    (chain) => chain.publicationStatus === "published",
  );
  const lifetimeUsdpTransfers = publishedLifetimeChains.reduce(
    (total, chain) => total + (chain.assets.usdp?.transferCount ?? 0),
    0,
  );
  const lifetimeUsdpHolders = publishedLifetimeChains.reduce(
    (total, chain) => total + (chain.assets.usdp?.activeHolders ?? 0),
    0,
  );
  const lifetimeSusdpHolders = publishedLifetimeChains.reduce(
    (total, chain) => total + (chain.assets.susdp?.activeHolders ?? 0),
    0,
  );
  const lifetimeYieldRows = publishedLifetimeChains.filter(
    (chain) => chain.lifetimeYield !== null,
  );
  const indexedAllTimeYpo = sum(
    lifetimeYieldRows.map((chain) => chain.lifetimeYield?.nativeYpo),
  );
  const hyperevmHistory = data.detail.chainBreakdown.find(
    (chain) => chain.chainSlug === "hyperevm",
  );

  return (
    <div className="app-frame">
      <header className="market-header">
        <a
          className="stablewatch-wordmark"
          href="#top"
          aria-label="StableWatch"
        >
          stablewatch
        </a>
        <nav className="market-breadcrumb" aria-label="Market navigation">
          <a href="#overview">Market</a>
          <span>›</span>
          <a href="#top">Yield Bearing Stablecoins</a>
        </nav>
        <div className="market-actions">
          <a className="header-search" href="#methodology">
            Methodology
          </a>
          <a
            className="api-link"
            href="/api/v1/stablewatch/assets/parallel-usdp-susdp"
          >
            API <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <aside className="site-sidebar">
        <nav aria-label="Dashboard navigation">
          <a className="active" href="#top">
            <span aria-hidden="true">⌂</span> Overview
          </a>
          <a href="#assets">
            <span aria-hidden="true">◫</span> Assets
          </a>
          <a href="#chains">
            <span aria-hidden="true">⌁</span> Chains
          </a>
          <a href="#activity">
            <span aria-hidden="true">↻</span> Activity
          </a>
          <a href="#yield">
            <span aria-hidden="true">%</span> Yield
          </a>
          <a href="#methodology">
            <span aria-hidden="true">◇</span> Methodology
          </a>
          <a href="/api/v1/stablewatch/assets/parallel-usdp-susdp">
            <span aria-hidden="true">{`{}`}</span> Integration API
          </a>
        </nav>
      </aside>

      <main className="dashboard-shell">
        <header className="site-header">
          <div className="page-context">
            <small>Yield Bearing Stablecoins</small>
            <strong>USDp + sUSDp</strong>
          </div>
          <div className="header-state">
            <AutoRefresh generatedAt={data.generatedAt} />
          </div>
        </header>

        <section className="asset-hero" id="top">
          <p className="asset-breadcrumb">
            Yield Bearing Stablecoins <span>›</span> sUSDp
          </p>
          <h1>Yield Bearing Stablecoin sUSDp by Parallel</h1>
          <div className="asset-summary-row">
            <div className="asset-identity">
              <div className="asset-lockup" aria-hidden="true">
                <span className="token token-back">
                  <AssetLogo asset="usdp" size={54} />
                </span>
                <span className="token token-front">
                  <AssetLogo asset="susdp" size={54} />
                </span>
              </div>
              <div>
                <strong>sUSDp</strong>
                <small>Parallel V3 · backed by USDp</small>
              </div>
            </div>
            <div className="hero-chains">
              <span>Chains:</span>
              <div
                className="chain-stack"
                aria-label="Supported savings chains"
              >
                {data.detail.chainBreakdown.map((chain) => (
                  <ChainLogo
                    key={chain.chainId}
                    slug={chain.chainSlug}
                    name={chain.chainName}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="metric-grid"
          id="overview"
          aria-label="Asset overview"
        >
          <article className="metric-card usdp-metric">
            <div className="metric-card-head">
              <p>USDp price</p>
              <span className="metric-glyph asset-glyph">
                <AssetLogo asset="usdp" size={20} />
              </span>
            </div>
            <strong>{price(headline.usdpPriceUsd.value)}</strong>
            <small>Market price · $1.00 target</small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>sUSDp price</p>
              <span className="metric-glyph asset-glyph">
                <AssetLogo asset="susdp" size={20} />
              </span>
            </div>
            <strong>{price(headline.susdpMarketPriceUsd.value)}</strong>
            <small>
              1 sUSDp = {decimal(portfolioSharePrice.toString(), 18, 4)} USDp in
              the vault
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>sUSDp TVL</p>
              <span className="metric-glyph">▣</span>
            </div>
            <strong>
              {headline.tvlUsdEstimate.value
                ? `$${compact(headline.tvlUsdEstimate.value)}`
                : `${compact(headline.tvlUsdp.value)} USDp`}
            </strong>
            <small>
              {decimal(headline.tvlUsdp.value)} USDp deposited across five
              chains
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>7-day Yield Paid Out</p>
              <span className="metric-glyph">↗</span>
            </div>
            <strong>
              {headline.ypoSevenDay.value
                ? `${decimal(headline.ypoSevenDay.value, 18, 4)} USDp`
                : `${verifiedHistory}/5 chains`}
            </strong>
            <small>Yield paid to sUSDp holders over the last 7 days</small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>Indexed all-time YPO</p>
              <span className="metric-glyph">∞</span>
            </div>
            <strong>{decimal(indexedAllTimeYpo.toString(), 18, 2)} USDp</strong>
            <small>
              Verified deployment histories on {lifetimeYieldRows.length} chains
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>Global USDp supply</p>
              <span className="metric-glyph">Σ</span>
            </div>
            <strong>
              {decimal(data.detail.usdpSupply.global.value, 18, 2)} USDp
            </strong>
            <small>Observed across all 24 USDp deployments</small>
          </article>
        </section>

        <section className="asset-story" id="assets">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Asset fundamentals</p>
              <h2>One stablecoin, one yield-bearing share</h2>
            </div>
            <p>
              USDp supply, sUSDp vault accounting, market prices, and the
              ERC-4626 relationship are shown as separate but connected layers.
            </p>
          </div>

          <div className="asset-story-grid">
            <article className="asset-profile usdp-profile">
              <div className="asset-profile-head">
                <div className="profile-token">
                  <AssetLogo asset="usdp" size={42} />
                </div>
                <div>
                  <p>Parallel stablecoin</p>
                  <h3>USDp</h3>
                </div>
                <span>Underlying</span>
              </div>
              <div className="profile-stat-grid">
                <div>
                  <small>Market price</small>
                  <strong>{price(headline.usdpPriceUsd.value)}</strong>
                  <span>$1.00 target</span>
                </div>
                <div>
                  <small>Global observed supply</small>
                  <strong>{decimal(globalSupply.toString(), 18, 2)}</strong>
                  <span>USDp · 24 deployments</span>
                </div>
                <div>
                  <small>Vaulted into sUSDp</small>
                  <strong>{vaultCapture.toFixed(2)}%</strong>
                  <span>{compact(totalAssets.toString())} USDp</span>
                </div>
                <div>
                  <small>Registered deployments</small>
                  <strong>
                    {data.asset.stablecoin.expectedDeploymentCount}
                  </strong>
                  <span>cross-chain addresses</span>
                </div>
              </div>
              <div className="distribution-chart">
                <div className="chart-label">
                  <span>Supply on savings chains</span>
                  <small>{compact(savingsSupply.toString())} USDp</small>
                </div>
                {data.detail.chainBreakdown.map((chain) => {
                  const share = shareOf(chain.usdpTotalSupply, savingsSupply);
                  return (
                    <div className="distribution-row" key={chain.chainId}>
                      <ChainLogo
                        slug={chain.chainSlug}
                        name={chain.chainName}
                      />
                      <span>{chain.chainName}</span>
                      <div>
                        <i style={{ width: `${Math.max(share, 0.35)}%` }} />
                      </div>
                      <strong>{share.toFixed(1)}%</strong>
                    </div>
                  );
                })}
              </div>
              <div className="deployment-footprint-note">
                <span aria-hidden="true">+</span>
                <div>
                  <strong>
                    {usdpOnlyDeploymentCount} additional USDp deployments
                  </strong>
                  <p>
                    USDp also exists beyond the five savings chains—including
                    BNB Chain and Sei—with{" "}
                    {decimal(usdpOnlySupply.toString(), 18, 2)} USDp combined in
                    this aligned snapshot. They are counted in global USDp
                    supply but omitted from sUSDp TVL, APY, YPO, and lifetime
                    savings metrics because sUSDp is not deployed there.
                  </p>
                </div>
              </div>
            </article>

            <div
              className="asset-bridge"
              aria-label="USDp to sUSDp relationship"
            >
              <span>Deposit</span>
              <i aria-hidden="true">→</i>
              <div>
                <small>ERC-4626 exchange rate</small>
                <strong>1 sUSDp</strong>
                <span>
                  = {decimal(portfolioSharePrice.toString(), 18, 4)} USDp
                </span>
              </div>
              <i aria-hidden="true">→</i>
              <span>Redeem</span>
            </div>

            <article className="asset-profile susdp-profile">
              <div className="asset-profile-head">
                <div className="profile-token">
                  <AssetLogo asset="susdp" size={42} />
                </div>
                <div>
                  <p>ERC-4626 savings token</p>
                  <h3>sUSDp</h3>
                </div>
                <span>Yield-bearing</span>
              </div>
              <div className="profile-stat-grid">
                <div>
                  <small>Market price</small>
                  <strong>{price(headline.susdpMarketPriceUsd.value)}</strong>
                  <span>DIA market</span>
                </div>
                <div>
                  <small>Total assets</small>
                  <strong>{compact(totalAssets.toString())}</strong>
                  <span>USDp in vaults</span>
                </div>
                <div>
                  <small>Shares outstanding</small>
                  <strong>{compact(totalShares.toString())}</strong>
                  <span>sUSDp</span>
                </div>
                <div>
                  <small>Estimated APY</small>
                  <strong>{percentage(headline.estimatedApy.value)}</strong>
                  <span>TVL-weighted</span>
                </div>
              </div>
              <div className="backing-chart">
                <div className="chart-label">
                  <span>Vault asset composition</span>
                  <small>{decimal(totalAssets.toString())} USDp</small>
                </div>
                <div
                  className="backing-bar"
                  aria-label="Actual assets and pending yield"
                >
                  <span style={{ width: `${100 - pendingYieldShare}%` }} />
                  <i style={{ width: `${pendingYieldShare}%` }} />
                </div>
                <div className="backing-legend">
                  <div>
                    <i />
                    <span>Actual assets</span>
                    <strong>{compact(actualAssets.toString())}</strong>
                  </div>
                  <div>
                    <i />
                    <span>Pending yield</span>
                    <strong>{compact(pendingYield.toString())}</strong>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="asset-chain-state" id="chains">
          <div className="section-heading chain-state-heading">
            <div>
              <p className="eyebrow">Current state</p>
              <h2>Chain-level fundamentals by asset</h2>
            </div>
            <p>
              USDp stablecoin supply and sUSDp savings-vault accounting are
              intentionally separated so each asset has a complete, readable
              chain view.
            </p>
          </div>

          <div className="asset-chain-panels">
            <article className="panel asset-chain-panel">
              <div className="asset-chain-panel-heading">
                <AssetLogo asset="usdp" size={34} />
                <div>
                  <p>USDp</p>
                  <h2>Stablecoin supply by chain</h2>
                </div>
                <span>Underlying asset</span>
              </div>
              <div className="chain-table-wrap">
                <table className="chain-table usdp-chain-table">
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th>USDp supply</th>
                      <th>Share of savings-chain supply</th>
                      <th>Source block</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detail.chainBreakdown.map((chain) => {
                      const supplyShare = shareOf(
                        chain.usdpTotalSupply,
                        savingsSupply,
                      );
                      return (
                        <tr key={chain.chainId}>
                          <td>
                            <a
                              className="chain-name chain-detail-link"
                              href={`/chains/${chain.chainSlug}`}
                            >
                              <ChainLogo
                                slug={chain.chainSlug}
                                name={chain.chainName}
                              />
                              <div>
                                <strong>{chain.chainName}</strong>
                                <small>Chain ID {chain.chainId}</small>
                              </div>
                            </a>
                          </td>
                          <td>
                            <strong>
                              {decimal(chain.usdpTotalSupply, 18, 2)} USDp
                            </strong>
                          </td>
                          <td>
                            <strong>{supplyShare.toFixed(2)}%</strong>
                            <div
                              className="share-bar"
                              aria-label={`${supplyShare}% of observed savings-chain supply`}
                            >
                              <span
                                style={{
                                  width: `${Math.max(supplyShare, 0.5)}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <code>
                              {Number(chain.block.number).toLocaleString()}
                            </code>
                            <small>
                              {new Date(chain.block.timestamp).toLocaleString(
                                "en-US",
                                {
                                  timeZone: "UTC",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}{" "}
                              UTC
                            </small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel asset-chain-panel">
              <div className="asset-chain-panel-heading">
                <AssetLogo asset="susdp" size={34} />
                <div>
                  <p>sUSDp</p>
                  <h2>Savings supply, TVL, and yield by chain</h2>
                </div>
                <span>Yield-bearing share</span>
              </div>
              <div className="chain-table-wrap">
                <table className="chain-table susdp-chain-table">
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th>sUSDp supply</th>
                      <th>Vault TVL (USDp)</th>
                      <th>Share value</th>
                      <th>Estimated APY</th>
                      <th>7d YPO</th>
                      <th>Source block</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detail.chainBreakdown.map((chain) => {
                      const tvlShare =
                        totalAssets > 0n
                          ? Number(
                              (BigInt(chain.susdpTotalAssets) * 10_000n) /
                                totalAssets,
                            ) / 100
                          : 0;
                      return (
                        <tr key={chain.chainId}>
                          <td>
                            <a
                              className="chain-name chain-detail-link"
                              href={`/chains/${chain.chainSlug}`}
                            >
                              <ChainLogo
                                slug={chain.chainSlug}
                                name={chain.chainName}
                              />
                              <div>
                                <strong>{chain.chainName}</strong>
                                <small>Chain ID {chain.chainId}</small>
                              </div>
                            </a>
                          </td>
                          <td>
                            <strong>
                              {decimal(chain.susdpTotalSupply, 18, 2)} sUSDp
                            </strong>
                          </td>
                          <td>
                            <strong>
                              {decimal(chain.susdpTotalAssets, 18, 2)} USDp
                            </strong>
                            <small>{tvlShare.toFixed(2)}% of total TVL</small>
                          </td>
                          <td>
                            {decimal(chain.susdpSharePriceUsdp, 18, 4)} USDp
                          </td>
                          <td>{percentage(chain.estimatedApy)}</td>
                          <td>
                            <span
                              className={`table-status ${metricClass(chain.ypoSevenDay)}`}
                            >
                              {chain.ypoSevenDay.value
                                ? `${decimal(chain.ypoSevenDay.value, 18, 3)} USDp`
                                : "—"}
                            </span>
                          </td>
                          <td>
                            <code>
                              {Number(chain.block.number).toLocaleString()}
                            </code>
                            <small>
                              {new Date(chain.block.timestamp).toLocaleString(
                                "en-US",
                                {
                                  timeZone: "UTC",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}{" "}
                              UTC
                            </small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>

        <section className="panel lifetime-panel" id="activity">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Historical activity</p>
              <h2>Activity and holders by chain</h2>
            </div>
            <p>
              Four chains have complete deployment-to-goal histories. HyperEVM
              is shown in the same table with its verified seven-day range so
              the difference in coverage is visible without separating the chain
              from the rest of the product.
            </p>
          </div>

          <div className="lifetime-summary">
            <article>
              <small>Lifetime histories</small>
              <strong>{publishedLifetimeChains.length} / 4</strong>
              <span>plus HyperEVM&apos;s verified 7-day window</span>
            </article>
            <article>
              <small>USDp transfers</small>
              <strong>{whole(lifetimeUsdpTransfers)}</strong>
              <span>published chains only</span>
            </article>
            <article>
              <small>USDp holders</small>
              <strong>{whole(lifetimeUsdpHolders)}</strong>
              <span>chain-summed active addresses</span>
            </article>
            <article>
              <small>sUSDp holders</small>
              <strong>{whole(lifetimeSusdpHolders)}</strong>
              <span>chain-summed active addresses</span>
            </article>
          </div>

          <div className="chain-table-wrap">
            <table className="chain-table lifetime-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Publication</th>
                  <th>USDp activity</th>
                  <th>USDp holders</th>
                  <th>sUSDp activity</th>
                  <th>Vault flows</th>
                  <th>Provenance</th>
                </tr>
              </thead>
              <tbody>
                {lifetime.map((chain) => {
                  const usdp = chain.assets.usdp;
                  const susdp = chain.assets.susdp;
                  const published = chain.publicationStatus === "published";
                  return (
                    <tr key={chain.chainId}>
                      <td>
                        <a
                          className="chain-name chain-detail-link"
                          href={`/chains/${chain.chainSlug}`}
                        >
                          <ChainLogo
                            slug={chain.chainSlug}
                            name={chain.chainName}
                          />
                          <div>
                            <strong>{chain.chainName}</strong>
                            <small>Chain ID {chain.chainId}</small>
                          </div>
                        </a>
                      </td>
                      <td>
                        <span
                          className={`publication-status ${chain.publicationStatus}`}
                        >
                          <i /> {publicationLabel(chain.publicationStatus)}
                        </span>
                        <div
                          className="progress-track"
                          aria-label={`${chain.progressPercent}% indexed`}
                        >
                          <span
                            style={{ width: `${chain.progressPercent}%` }}
                          />
                        </div>
                        <small>
                          {chain.progressPercent.toFixed(2)}% scanned
                        </small>
                      </td>
                      <td>
                        <strong>{whole(usdp?.transferCount)}</strong>
                        <small>
                          {usdp
                            ? `${compact(usdp.transferVolume)} USDp moved`
                            : chain.coverageKind === "window"
                              ? "Lifetime transfers not indexed"
                              : "Publishes after derivation"}
                        </small>
                      </td>
                      <td>
                        <strong>{whole(usdp?.activeHolders)}</strong>
                        <small>
                          {usdp
                            ? `${whole(usdp.newHolders)} unique holders`
                            : chain.coverageKind === "window"
                              ? "Lifetime holders not indexed"
                              : "Zero address excluded"}
                        </small>
                      </td>
                      <td>
                        <strong>{whole(susdp?.transferCount)}</strong>
                        <small>
                          {susdp
                            ? `${whole(susdp.activeHolders)} active holders`
                            : chain.coverageKind === "window"
                              ? "Seven-day YPO available"
                              : "Publishes after derivation"}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {chain.flows
                            ? `${whole(chain.flows.depositCount)} / ${whole(chain.flows.withdrawCount)}`
                            : "—"}
                        </strong>
                        <small>deposits / withdrawals</small>
                      </td>
                      <td>
                        <code>
                          {Number(chain.fromBlock).toLocaleString()}–
                          {Number(chain.goalBlock).toLocaleString()}
                        </code>
                        <small>
                          {published && usdp
                            ? `${new Date(usdp.windowStart).toLocaleDateString("en-US", { timeZone: "UTC" })}–${new Date(usdp.windowEnd).toLocaleDateString("en-US", { timeZone: "UTC" })}`
                            : chain.coverageKind === "window" &&
                                hyperevmHistory?.history
                              ? `${new Date(hyperevmHistory.history.windowStart).toLocaleDateString("en-US", { timeZone: "UTC" })}–${new Date(hyperevmHistory.history.windowEnd).toLocaleDateString("en-US", { timeZone: "UTC" })}`
                              : chain.updatedAt
                                ? `Checkpoint ${Number(chain.nextBlock).toLocaleString()}`
                                : "Awaiting first checkpoint"}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="yield-layout" id="yield">
          <article className="panel yield-panel">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Yield Paid Out</p>
                <h2>Native yield, not incentives</h2>
              </div>
              <span className="window-pill">7 days + indexed all-time</span>
            </div>
            <div className="yield-period-summary">
              <div>
                <small>Last 7 days · 5 chains</small>
                <strong>
                  {headline.ypoSevenDay.value
                    ? `${decimal(headline.ypoSevenDay.value, 18, 4)} USDp`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>Indexed all-time · 4 chains</small>
                <strong>
                  {decimal(indexedAllTimeYpo.toString(), 18, 4)} USDp
                </strong>
              </div>
            </div>
            <h3 className="yield-chart-title">Last 7 days</h3>
            <div className="yield-chart" aria-label="Verified YPO by chain">
              {(data.detail.charts.ypo.components ?? []).map((point) => {
                const maximum = Math.max(
                  ...(data.detail.charts.ypo.components ?? []).map(
                    (item) => Number(item.nativeYpo) / 1e18,
                  ),
                  1,
                );
                const value = Number(point.nativeYpo) / 1e18;
                return (
                  <div className="yield-row" key={point.chainId}>
                    <span>
                      <ChainLogo
                        slug={point.chainSlug}
                        name={
                          data.detail.chainBreakdown.find(
                            (chain) => chain.chainId === point.chainId,
                          )?.chainName ?? point.chainSlug
                        }
                      />
                      {point.chainSlug}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max((value / maximum) * 100, value ? 1 : 0)}%`,
                        }}
                      />
                    </div>
                    <strong>{decimal(point.nativeYpo, 18, 3)}</strong>
                  </div>
                );
              })}
            </div>
            <h3 className="yield-chart-title">Indexed all-time by chain</h3>
            <div
              className="yield-chart lifetime-yield-chart"
              aria-label="Verified indexed all-time YPO by chain"
            >
              {lifetimeYieldRows.map((chain) => {
                const maximum = Math.max(
                  ...lifetimeYieldRows.map(
                    (item) => Number(item.lifetimeYield?.nativeYpo ?? 0) / 1e18,
                  ),
                  1,
                );
                const value = Number(chain.lifetimeYield!.nativeYpo) / 1e18;
                return (
                  <a
                    className="yield-row"
                    key={chain.chainId}
                    href={`/chains/${chain.chainSlug}`}
                  >
                    <span>
                      <ChainLogo
                        slug={chain.chainSlug}
                        name={chain.chainName}
                      />
                      {chain.chainName}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max((value / maximum) * 100, value ? 1 : 0)}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {decimal(chain.lifetimeYield!.nativeYpo, 18, 3)}
                    </strong>
                  </a>
                );
              })}
            </div>
            <div className="formula-card">
              <span>Canonical YPO</span>
              <code>Accrued interest + Δ pending yield</code>
              <p>
                Deposits, withdrawals, transfers, points, and reward tokens are
                excluded.
              </p>
            </div>
          </article>

          <aside className="panel coverage-panel">
            <p className="eyebrow">Historical coverage</p>
            <div className="coverage-score">
              <strong>{verifiedHistory}</strong>
              <span>/ 5 chains verified</span>
            </div>
            <div className="coverage-list">
              {data.detail.chainBreakdown.map((chain) => (
                <div key={chain.chainId}>
                  <span
                    className={`coverage-dot ${chain.ypoSevenDay.verification === "verified" ? "done" : "running"}`}
                  />
                  <span>{chain.chainName}</span>
                  <strong>
                    {chain.ypoSevenDay.verification === "verified"
                      ? "Reconciled"
                      : "In progress"}
                  </strong>
                </div>
              ))}
            </div>
            <p className="coverage-note">
              Seven-day YPO uses aligned windows across all five chains. Indexed
              all-time YPO covers Ethereum, Base, Sonic, and Avalanche from each
              sUSDp deployment through the fixed indexed endpoint; HyperEVM is
              not included in that all-time total.
            </p>
          </aside>
        </section>

        <section className="panel trust-panel" id="methodology">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Methodology</p>
              <h2>Where every number comes from</h2>
            </div>
            <p>
              Designed as an integration-ready dataset with stronger provenance
              than a presentation-only dashboard.
            </p>
          </div>
          <div className="trust-grid">
            <article>
              <span>01</span>
              <h3>Finalized components</h3>
              <p>
                Independent blocks and timestamps preserve each chain&apos;s
                finality semantics.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Fail-closed coverage</h3>
              <p>
                Missing, stale, or unreconciled chains remain visible and are
                never silently summed.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Exact arithmetic</h3>
              <p>
                Integer base units and versioned fixed-point formulas prevent
                presentation rounding from entering source data.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Integration contract</h3>
              <p>
                StableWatch-compatible concepts are exposed through one
                versioned, read-only asset endpoint.
              </p>
            </article>
          </div>
          <div className="methodology-ledger">
            <div className="methodology-head">
              <span>Metric family</span>
              <span>Source and method</span>
              <span>Time coverage</span>
              <span>Evidence</span>
            </div>
            <div>
              <strong>Current USDp + sUSDp state</strong>
              <p>
                Direct ERC-20 and ERC-4626 reads at each chain&apos;s finalized
                block, including block hash and contract manifest.
              </p>
              <code>{data.detail.chainBreakdown.length} savings chains</code>
              <span className="method-state onchain">Finalized onchain</span>
            </div>
            <div>
              <strong>Global USDp supply</strong>
              <p>
                Sum of aligned `totalSupply()` reads from all 24 registered
                deployments. Bridge messages are not added a second time.
              </p>
              <code>
                {data.detail.usdpSupply.global.asOf
                  ? new Date(data.detail.usdpSupply.global.asOf).toLocaleString(
                      "en-US",
                      { timeZone: "UTC" },
                    )
                  : "Snapshot pending"}
              </code>
              <span className="method-state onchain">24-chain onchain</span>
            </div>
            <div>
              <strong>Seven-day Yield Paid Out</strong>
              <p>
                Accrued interest plus the change in pending yield across pinned
                boundary states; independently integrated and reconciled.
              </p>
              <code>{verifiedHistory}/5 chain windows reconciled</code>
              <span className="method-state reconciled">Reconciled</span>
            </div>
            <div>
              <strong>sUSDp TVL, share value, and APY</strong>
              <p>
                TVL is vault totalAssets() in USDp. Share value is totalAssets
                divided by totalSupply; estimated APY annualizes the current
                onchain savings rate and is not a realized return.
              </p>
              <code>5 finalized vault states</code>
              <span className="method-state onchain">Contract arithmetic</span>
            </div>
            <div>
              <strong>Indexed all-time Yield Paid Out</strong>
              <p>
                The same canonical YPO formula applied from each sUSDp
                deployment block through its fixed lifetime endpoint. Event
                coverage and boundary vault state are independently checked.
              </p>
              <code>{lifetimeYieldRows.length}/4 ranges verified</code>
              <span className="method-state reconciled">HyperEVM excluded</span>
            </div>
            <div>
              <strong>Lifetime holders and activity</strong>
              <p>
                Activity counts ordinary ERC-20 transfers between nonzero
                addresses. Mint and burn events are separate; transfers are not
                inferred to be buys or sells.
              </p>
              <code>
                {publishedLifetimeChains.length}/4 histories published
              </code>
              <span className="method-state automatic">Auto-publishes</span>
            </div>
            <div>
              <strong>Holder lists</strong>
              <p>
                Current balances are replayed from complete Transfer history.
                The zero address is excluded; contracts and externally owned
                accounts are both retained.
              </p>
              <code>Chain-specific drill-downs</code>
              <span className="method-state automatic">Complete replay</span>
            </div>
            <div>
              <strong>USD market attribution</strong>
              <p>
                DIA USDp and sUSDp market observations are kept separate from
                native onchain vault accounting.
              </p>
              <code>
                {headline.usdpPriceUsd.asOf
                  ? new Date(headline.usdpPriceUsd.asOf).toLocaleString(
                      "en-US",
                      { timeZone: "UTC" },
                    )
                  : "Market observation pending"}
              </code>
              <span className="method-state attributed">External source</span>
            </div>
          </div>
          <div className="terminology-note">
            <strong>HyperEVM coverage boundary</strong>
            <p>
              HyperEVM current state and seven-day YPO are verified for blocks
              39,958,147–40,572,940. Its lifetime transfer, holder, and all-time
              YPO totals are intentionally omitted rather than inferred from a
              partial history.
            </p>
          </div>
          <div className="trust-footer">
            <div>
              <small>Current calculation version</small>
              <code>
                {displayCalculationVersion(
                  data.trust.currentCalculationVersion,
                )}
              </code>
            </div>
            <div>
              <small>Generated</small>
              <strong>
                {new Date(data.generatedAt).toLocaleString("en-US", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </strong>
            </div>
            <a href="/api/v1/stablewatch/assets/parallel-usdp-susdp">
              Inspect raw payload <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>

        <footer>
          <div className="footer-brand">
            <span className="stablewatch-wordmark">stablewatch</span>
            <small>Integration prototype</small>
          </div>
          <p>
            USDp and sUSDp are products of Parallel. This independent project is
            not an official Parallel or StableWatch product.
          </p>
          <div>
            <a href="https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp">
              Protocol docs ↗
            </a>
            <a href="https://github.com/ktabes/parallel-usdp-hyperevm-indexer">
              GitHub ↗
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
