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

const chainInitials: Record<string, string> = {
  ethereum: "Ξ",
  base: "B",
  sonic: "S",
  hyperevm: "H",
  avalanche: "A",
};

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
  const verifiedHistory = data.trust.verifiedHistoricalChainIds.length;

  return (
    <main className="dashboard-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Parallel analytics home">
          <span className="brand-mark">P</span>
          <span>
            <strong>Parallel Watch</strong>
            <small>Independent analytics</small>
          </span>
        </a>
        <nav aria-label="Page navigation">
          <a href="#overview">Overview</a>
          <a href="#chains">Chains</a>
          <a href="#yield">Yield</a>
          <a href="#methodology">Trust layer</a>
        </nav>
        <a
          className="api-link"
          href="/api/v1/stablewatch/assets/parallel-usdp-susdp"
        >
          View API <span aria-hidden="true">↗</span>
        </a>
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
              <span key={chain.chainId} title={chain.chainName}>
                {chainInitials[chain.chainSlug] ?? chain.chainName[0]}
              </span>
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
          <small>24-chain global supply remains unavailable</small>
        </article>
      </section>

      <section className="panel chain-panel" id="chains">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current state</p>
            <h2>Five chains, one savings asset</h2>
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
                        <span>
                          {chainInitials[chain.chainSlug] ?? chain.chainName[0]}
                        </span>
                        <div>
                          <strong>{chain.chainName}</strong>
                          <small>Chain ID {chain.chainId}</small>
                        </div>
                      </div>
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
                          : "Backfilling"}
                      </span>
                    </td>
                    <td>
                      <code>{Number(chain.block.number).toLocaleString()}</code>
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
                  <span>{point.chainSlug}</span>
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
            Global YPO fails closed until all component windows are aligned and
            independently reconciled.
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
              StableWatch-compatible concepts are exposed through one versioned,
              read-only asset endpoint.
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
  );
}
