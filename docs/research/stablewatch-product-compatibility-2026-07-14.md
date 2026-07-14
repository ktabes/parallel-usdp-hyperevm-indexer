# StableWatch product compatibility snapshot

- Inspected: 2026-07-14
- Market: <https://www.stablewatch.io/analytics>
- HyperEVM reference: <https://www.stablewatch.io/analytics/assets/xHYPE-Liminal>

This is dated product evidence, not a promise that StableWatch's UI or data contract will remain unchanged.

## Market row

The yield-bearing stablecoin market table exposes:

- asset and protocol;
- TVL and seven-day TVL change;
- category tags;
- seven-day APY and seven-day APY change;
- 30-day APY;
- all-time Yield Paid Out.

The USDp/sUSDp API should be able to produce this conceptual row without inventing history. Windows outside the reconciled index range must return an explicit unavailable state and reason.

## xHYPE asset detail reference

At inspection time, the Liminal xHYPE page showed:

- chain badges for HyperEVM, Arbitrum, and Ethereum;
- headline TVL, price, 30-day APY, and 30-day YPO;
- Total Value Locked, APY, and Yield Paid Out chart tabs;
- a seven-day chart selector;
- protocol, token, asset-class, and market-cap facts;
- 7d, 30d, 90d, and all-time YPO;
- a live YPO counter;
- a description and external protocol links.

The value of this project is therefore not raw field count alone. Its differentiator should be verified Parallel coverage plus native protocol flows, exact USDp-denominated YPO, materialized-versus-pending yield, finalized block freshness, manifest/calculation versions, reconciliation status, and clearly typed unavailable states.

## Integration principle

Build StableWatch-compatible concepts, not a StableWatch visual clone. The API and handoff matter more than matching their styling. A StableWatch engineer should be able to map the dataset into the existing market row, asset detail, and YPO comparison concepts without trusting an opaque aggregate.
