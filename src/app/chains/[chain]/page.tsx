import { notFound } from "next/navigation";
import Link from "next/link";
import { readChainHolders } from "@/analytics/chain-detail";
import { readLifetimeDashboard } from "@/analytics/dashboard-readiness";
import { readLatestGlobalSavings } from "@/analytics/global-queries";
import { readLatestSavingsHistory } from "@/analytics/history-queries";
import { readPrices } from "@/analytics/queries";
import { readLatestGlobalUsdpSupply } from "@/analytics/usdp-supply-queries";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "@/db/client";
import { buildStablewatchAssetPayload } from "@/integration/stablewatch";
import { savingsChainAdapters } from "@/protocol/savings-chains";
import { AssetLogo, ChainLogo } from "../../asset-visuals";

export const dynamic = "force-dynamic";

function decimal(value: string | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value) / 1e18);
}

function compact(value: string | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value) / 1e18);
}

function percentage(value: string | null | undefined) {
  if (value === null || value === undefined) return "—";
  return decimal((BigInt(value) * 100n).toString(), 2);
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function address(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function loadChainDetail(chainSlug: string) {
  const adapter = savingsChainAdapters.find(
    (candidate) => candidate.chainSlug === chainSlug,
  );
  if (!adapter) return null;
  const env = parseRuntimeEnv(process.env);
  const { pool } = createDatabase(env);
  try {
    const [global, globalUsdp, history, prices, lifetimeRows] =
      await Promise.all([
        readLatestGlobalSavings(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
        readLatestGlobalUsdpSupply(pool, env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS),
        readLatestSavingsHistory(pool),
        readPrices(pool),
        readLifetimeDashboard(pool),
      ]);
    const payload = buildStablewatchAssetPayload({
      global,
      globalUsdp,
      history,
      prices,
    });
    const current = payload.detail.chainBreakdown.find(
      (chain) => chain.chainSlug === chainSlug,
    );
    if (!current) return null;
    const lifetime = lifetimeRows.find(
      (chain) => chain.chainSlug === chainSlug,
    );
    const holders = await readChainHolders(pool, lifetime);
    return { current, lifetime, holders };
  } finally {
    await pool.end();
  }
}

export default async function ChainDetailPage({
  params,
}: {
  params: Promise<{ chain: string }>;
}) {
  const { chain: chainSlug } = await params;
  const detail = await loadChainDetail(chainSlug);
  if (!detail) notFound();
  const { current, lifetime, holders } = detail;
  const usdp = lifetime?.assets.usdp;
  const susdp = lifetime?.assets.susdp;
  const usdpHolders = holders.rows.filter((row) => row.assetId === "usdp");
  const susdpHolders = holders.rows.filter((row) => row.assetId === "susdp");
  const averageUsdpTransfer =
    usdp && usdp.transferCount > 0
      ? (BigInt(usdp.transferVolume) / BigInt(usdp.transferCount)).toString()
      : null;

  return (
    <div className="chain-detail-page">
      <header className="chain-detail-topbar">
        <Link className="stablewatch-wordmark" href="/">
          stablewatch
        </Link>
        <Link href="/">← Back to sUSDp overview</Link>
      </header>
      <main>
        <nav className="chain-detail-breadcrumb">
          <Link href="/">Yield Bearing Stablecoins</Link>
          <span>›</span>
          <Link href="/">sUSDp</Link>
          <span>›</span>
          <strong>{current.chainName}</strong>
        </nav>

        <section className="chain-detail-hero">
          <ChainLogo slug={current.chainSlug} name={current.chainName} />
          <div>
            <h1>{current.chainName} USDp + sUSDp</h1>
            <p>
              Parallel V3 stablecoin and savings activity on chain ID{" "}
              {current.chainId}
            </p>
          </div>
          <span className="coverage-date">
            {lifetime?.publicationStatus === "published"
              ? `History from ${date(usdp?.windowStart)}`
              : "Verified seven-day history"}
          </span>
        </section>

        <section className="chain-detail-metrics" aria-label="Current metrics">
          <article>
            <small>USDp supply</small>
            <strong>{decimal(current.usdpTotalSupply)} USDp</strong>
          </article>
          <article>
            <small>sUSDp TVL</small>
            <strong>{decimal(current.susdpTotalAssets)} USDp</strong>
          </article>
          <article>
            <small>sUSDp share value</small>
            <strong>{decimal(current.susdpSharePriceUsdp, 4)} USDp</strong>
          </article>
          <article>
            <small>Estimated APY</small>
            <strong>{percentage(current.estimatedApy)}%</strong>
          </article>
          <article>
            <small>7-day YPO</small>
            <strong>{decimal(current.ypoSevenDay.value, 4)} USDp</strong>
          </article>
          <article>
            <small>Current block</small>
            <strong>{Number(current.block.number).toLocaleString()}</strong>
          </article>
        </section>

        {lifetime?.publicationStatus === "published" && usdp && susdp ? (
          <>
            <section className="chain-detail-section">
              <div className="chain-detail-heading">
                <div>
                  <p className="eyebrow">Deployment-to-goal history</p>
                  <h2>Activity since {date(usdp.windowStart)}</h2>
                </div>
                <p>
                  “Activity” means ordinary ERC-20 Transfer events between
                  nonzero addresses. Mints and burns are counted separately; it
                  does not attempt to label transfers as buys or sells.
                </p>
              </div>
              <div className="activity-detail-grid">
                <article>
                  <div className="detail-asset-title">
                    <AssetLogo asset="usdp" size={30} />
                    <strong>USDp activity</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Transfers</dt>
                      <dd>{usdp.transferCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Transfer volume</dt>
                      <dd>{compact(usdp.transferVolume)} USDp</dd>
                    </div>
                    <div>
                      <dt>Average transfer</dt>
                      <dd>{compact(averageUsdpTransfer)} USDp</dd>
                    </div>
                    <div>
                      <dt>Unique participants</dt>
                      <dd>{usdp.uniqueParticipants.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Minted</dt>
                      <dd>{compact(usdp.mintedVolume)} USDp</dd>
                    </div>
                    <div>
                      <dt>Burned</dt>
                      <dd>{compact(usdp.burnedVolume)} USDp</dd>
                    </div>
                  </dl>
                </article>
                <article>
                  <div className="detail-asset-title">
                    <AssetLogo asset="susdp" size={30} />
                    <strong>sUSDp activity</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Share transfers</dt>
                      <dd>{susdp.transferCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Active holders</dt>
                      <dd>{susdp.activeHolders.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Deposits</dt>
                      <dd>
                        {lifetime.flows?.depositCount.toLocaleString() ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Withdrawals</dt>
                      <dd>
                        {lifetime.flows?.withdrawCount.toLocaleString() ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Assets deposited</dt>
                      <dd>{compact(lifetime.flows?.depositedAssets)} USDp</dd>
                    </div>
                    <div>
                      <dt>Assets withdrawn</dt>
                      <dd>{compact(lifetime.flows?.withdrawnAssets)} USDp</dd>
                    </div>
                  </dl>
                </article>
              </div>
            </section>

            <section className="chain-detail-section">
              <div className="chain-detail-heading">
                <div>
                  <p className="eyebrow">Holder ledger</p>
                  <h2>Current holders at the indexed endpoint</h2>
                </div>
                <p>
                  Balances are reconstructed from complete Transfer history and
                  exclude the zero address. Contract and externally owned
                  addresses are both included.
                </p>
              </div>
              <div className="holder-table-grid">
                {[
                  { asset: "USDp", rows: usdpHolders },
                  { asset: "sUSDp", rows: susdpHolders },
                ].map(({ asset, rows }) => (
                  <article key={asset}>
                    <h3>
                      {asset} holders <span>{rows.length}</span>
                    </h3>
                    <div className="holder-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Address</th>
                            <th>Balance</th>
                            <th>First held</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((holder) => (
                            <tr
                              key={`${holder.assetId}-${holder.holderAddress}`}
                            >
                              <td title={holder.holderAddress}>
                                <code>{address(holder.holderAddress)}</code>
                              </td>
                              <td>{decimal(holder.balance, 4)}</td>
                              <td>{date(holder.firstPositiveAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="chain-detail-section partial-history-panel">
            <p className="eyebrow">Historical coverage</p>
            <h2>HyperEVM currently uses a verified seven-day window</h2>
            <p>
              Current USDp and sUSDp state plus seven-day YPO are available.
              Lifetime transfer and holder tables remain unavailable until the
              full deployment history is indexed, so this page does not infer
              them from partial coverage.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
