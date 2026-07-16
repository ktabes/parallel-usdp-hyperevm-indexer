import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { readPrices } from "@/analytics/queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import {
  buildStablewatchAssetPayload,
  type MetricValue,
} from "@/integration/stablewatch";

export const dynamic = "force-dynamic";

const chainColors: Record<string, string> = {
  ethereum: "#627eea",
  base: "#0052ff",
  sonic: "#ffffff",
  hyperevm: "#97fce4",
  avalanche: "#e84142",
};

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

function pegDistance(value: string | null) {
  if (value === null) return "—";
  const distance = ((Number(value) / 1e18 - 1) * 100).toFixed(3);
  return `${Number(distance) >= 0 ? "+" : ""}${distance}% vs $1`;
}

function metricLabel(metric: MetricValue) {
  if (metric.availability === "stale") return "Stale";
  if (metric.availability === "unavailable") return "Pending";
  return metric.verification === "verified" ? "Verified" : "Candidate";
}

function metricClass(metric: MetricValue) {
  if (metric.availability === "stale") return "warning";
  if (metric.availability === "unavailable") return "muted";
  return metric.verification === "verified" ? "verified" : "candidate";
}

function MetricStatus({ metric }: { metric: MetricValue }) {
  return (
    <span className={`metric-status ${metricClass(metric)}`}>
      <span aria-hidden="true" />
      {metricLabel(metric)}
    </span>
  );
}

async function dashboardData() {
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const [global, history, prices] = await Promise.all([
      readLatestGlobalSavings(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
      readLatestSavingsHistory(pool),
      readPrices(pool),
    ]);
    return buildStablewatchAssetPayload({ global, history, prices });
  } finally {
    await pool.end();
  }
}

export default async function Home() {
  const data = await dashboardData();
  const { headline } = data.detail;
  const totalAssets = data.marketRow.tvlUsdp.value
    ? BigInt(data.marketRow.tvlUsdp.value)
    : 0n;
  const savingsSupply = BigInt(
    data.detail.usdpSupply.onSavingsChains.value ?? "0",
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
  const vaultCapture = shareOf(totalAssets, savingsSupply);
  const pendingYieldShare = shareOf(pendingYield, totalAssets);
  const verifiedHistory = data.trust.verifiedHistoricalChainIds.length;

  return (
    <div className="app-frame">
      <header className="market-header">
        <a className="brand" href="#top" aria-label="Parallel analytics home">
          <span className="brand-mark">P</span>
          <span>
            <strong>Parallel Watch</strong>
            <small>USDp + sUSDp analytics</small>
          </span>
        </a>
        <div className="market-ticker" aria-label="Current asset metrics">
          <div>
            <span className="ticker-token">$</span>
            <p>
              <strong>USDp</strong>
              <small>{price(headline.usdpPriceUsd.value)}</small>
            </p>
            <i>{pegDistance(headline.usdpPriceUsd.value)}</i>
          </div>
          <div>
            <span className="ticker-token savings">P</span>
            <p>
              <strong>sUSDp</strong>
              <small>{compact(totalAssets.toString())} TVL</small>
            </p>
            <i>{percentage(headline.estimatedApy.value)} APY</i>
          </div>
          <div>
            <span className="ticker-network">5</span>
            <p>
              <strong>Networks</strong>
              <small>Finalized state</small>
            </p>
            <i>{verifiedHistory}/5 YPO</i>
          </div>
        </div>
        <div className="market-actions">
          <a className="header-search" href="#assets">
            <span aria-hidden="true">⌕</span> Explore assets
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
          <a href="#yield">
            <span aria-hidden="true">%</span> Yield
          </a>
          <p>Engineering</p>
          <a href="#methodology">
            <span aria-hidden="true">◇</span> Trust layer
          </a>
          <a href="/api/v1/stablewatch/assets/parallel-usdp-susdp">
            <span aria-hidden="true">{`{}`}</span> Integration API
          </a>
        </nav>
        <div className="sidebar-card">
          <span>StableWatch-ready</span>
          <strong>Auditable by design</strong>
          <p>Finalized blocks, exact arithmetic, and component provenance.</p>
          <a href="#methodology">
            Inspect methodology <i>→</i>
          </a>
        </div>
        <div className="sidebar-footer">
          <span>◐</span>
          <small>Live finalized state</small>
        </div>
      </aside>

      <main className="dashboard-shell">
        <header className="site-header">
          <div className="page-context">
            <small>Analytics / Assets</small>
            <strong>Parallel USDp + sUSDp</strong>
          </div>
          <nav aria-label="Section shortcuts">
            <a href="#overview">Market</a>
            <a href="#chains">Networks</a>
            <a href="#yield">YPO</a>
          </nav>
          <span className="finality-pill">
            <i /> Finalized
          </span>
        </header>

        <section className="asset-hero" id="top">
          <div className="asset-identity">
            <div className="asset-lockup" aria-hidden="true">
              <span className="token token-back">$</span>
              <span className="token token-front">P</span>
            </div>
            <div>
              <p className="eyebrow">Parallel V3 · Cross-chain savings</p>
              <h1>
                USDp <span>/</span> sUSDp
              </h1>
              <p className="hero-copy">
                Auditable stablecoin and ERC-4626 savings analytics across every
                official sUSDp deployment.
              </p>
            </div>
          </div>
          <div className="hero-side">
            <div className="chain-stack" aria-label="Supported savings chains">
              {data.detail.chainBreakdown.map((chain) => (
                <ChainLogo
                  key={chain.chainId}
                  slug={chain.chainSlug}
                  name={chain.chainName}
                />
              ))}
            </div>
            <div className="live-state">
              <span /> Live finalized state
            </div>
          </div>
        </section>

        <section
          className="metric-grid"
          id="overview"
          aria-label="Asset overview"
        >
          <article className="metric-card featured usdp-metric">
            <div className="metric-card-head">
              <p>USDp price</p>
              <MetricStatus metric={headline.usdpPriceUsd} />
            </div>
            <strong>{price(headline.usdpPriceUsd.value)}</strong>
            <small>
              {pegDistance(headline.usdpPriceUsd.value)} · DIA market
            </small>
          </article>
          <article className="metric-card featured">
            <div className="metric-card-head">
              <p>sUSDp TVL</p>
              <MetricStatus metric={headline.tvlUsdEstimate} />
            </div>
            <strong>
              {headline.tvlUsdEstimate.value
                ? `$${compact(headline.tvlUsdEstimate.value)}`
                : `${compact(headline.tvlUsdp.value)} USDp`}
            </strong>
            <small>
              {decimal(headline.tvlUsdp.value)} USDp · five-chain total
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>sUSDp market price</p>
              <MetricStatus metric={headline.susdpMarketPriceUsd} />
            </div>
            <strong>{price(headline.susdpMarketPriceUsd.value)}</strong>
            <small>
              {decimal(portfolioSharePrice.toString(), 18, 4)} USDp vault value
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>Estimated APY</p>
              <MetricStatus metric={headline.estimatedApy} />
            </div>
            <strong>{percentage(headline.estimatedApy.value)}</strong>
            <small>TVL-weighted onchain rate · not trailing APY</small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>7-day Yield Paid Out</p>
              <MetricStatus metric={headline.ypoSevenDay} />
            </div>
            <strong>
              {headline.ypoSevenDay.value
                ? `${decimal(headline.ypoSevenDay.value, 18, 4)} USDp`
                : `${verifiedHistory}/5 chains`}
            </strong>
            <small>
              {headline.ypoSevenDay.reason ??
                "Aligned and independently reconciled"}
            </small>
          </article>
          <article className="metric-card">
            <div className="metric-card-head">
              <p>USDp supply observed</p>
              <span className="scope-pill">Savings chains</span>
            </div>
            <strong>
              {compact(data.detail.usdpSupply.onSavingsChains.value)}
            </strong>
            <small>Across the five official savings deployments</small>
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
                <div className="profile-token">$</div>
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
                  <span>{pegDistance(headline.usdpPriceUsd.value)}</span>
                </div>
                <div>
                  <small>Observed supply</small>
                  <strong>{compact(savingsSupply.toString())}</strong>
                  <span>USDp · savings chains</span>
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
                <div className="profile-token">P</div>
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

        <section className="panel chain-panel" id="chains">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current state</p>
              <h2>USDp liquidity and sUSDp yield by chain</h2>
            </div>
            <p>
              Every component is a finalized contract read with its own block,
              manifest, and freshness record.
            </p>
          </div>

          <div className="chain-table-wrap">
            <table className="chain-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>USDp supply</th>
                  <th>sUSDp TVL</th>
                  <th>Share price</th>
                  <th>Estimated APY</th>
                  <th>7d YPO</th>
                  <th>Block</th>
                </tr>
              </thead>
              <tbody>
                {data.detail.chainBreakdown.map((chain) => {
                  const share =
                    totalAssets > 0n
                      ? Number(
                          (BigInt(chain.susdpTotalAssets) * 10_000n) /
                            totalAssets,
                        ) / 100
                      : 0;
                  return (
                    <tr key={chain.chainId}>
                      <td>
                        <div className="chain-name">
                          <ChainLogo
                            slug={chain.chainSlug}
                            name={chain.chainName}
                          />
                          <div>
                            <strong>{chain.chainName}</strong>
                            <small>Chain ID {chain.chainId}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{compact(chain.usdpTotalSupply)} USDp</strong>
                        <small>
                          {shareOf(
                            chain.usdpTotalSupply,
                            savingsSupply,
                          ).toFixed(1)}
                          % of observed supply
                        </small>
                      </td>
                      <td>
                        <strong>{compact(chain.susdpTotalAssets)} USDp</strong>
                        <div
                          className="share-bar"
                          aria-label={`${share}% of total TVL`}
                        >
                          <span style={{ width: `${Math.max(share, 0.5)}%` }} />
                        </div>
                      </td>
                      <td>{decimal(chain.susdpSharePriceUsdp, 18, 4)} USDp</td>
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
        </section>

        <section className="yield-layout" id="yield">
          <article className="panel yield-panel">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Yield Paid Out</p>
                <h2>Native yield, not incentives</h2>
              </div>
              <span className="window-pill">7 days</span>
            </div>
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
              Global YPO fails closed until all component windows are aligned
              and independently reconciled.
            </p>
          </aside>
        </section>

        <section className="panel trust-panel" id="methodology">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Engineering trust layer</p>
              <h2>Every number carries its evidence</h2>
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
          <div className="trust-footer">
            <div>
              <small>Current calculation version</small>
              <code>{data.trust.currentCalculationVersion}</code>
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
          <div className="brand footer-brand">
            <span className="brand-mark">P</span>
            <span>
              <strong>Parallel Watch</strong>
              <small>Independent integration prototype</small>
            </span>
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
