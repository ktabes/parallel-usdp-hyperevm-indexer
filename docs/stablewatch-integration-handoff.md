# StableWatch integration handoff

## What is ready

The service exposes one versioned, read-only integration endpoint:

`GET /api/v1/stablewatch/assets/parallel-usdp-susdp`

Production base URL: <https://content-spirit-production-5efa.up.railway.app>

The endpoint is intentionally shaped around StableWatch concepts rather than
the indexer's internal tables. It can populate a market row, a USDp/sUSDp asset
detail, a five-chain breakdown, per-chain seven-day Yield Paid Out, and a trust
panel. The contract is documented in
[`docs/openapi/stablewatch-integration.v1.yaml`](openapi/stablewatch-integration.v1.yaml).

## Field mapping

| StableWatch concept  | Integration field           | Current definition                                                             |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Asset                | `marketRow.asset`           | sUSDp                                                                          |
| Protocol             | `marketRow.protocol`        | Parallel V3                                                                    |
| TVL                  | `marketRow.tvlUsdp`         | Sum of ERC-4626 `totalAssets()` across the five official sUSDp chains          |
| TVL in USD           | `marketRow.tvlUsdEstimate`  | TVL multiplied by the attributed USDp/USD source; remains candidate            |
| APY                  | `marketRow.estimatedApy`    | TVL-weighted onchain estimated APY; never described as trailing realized APY   |
| 7d YPO               | `marketRow.ypoSevenDay`     | Available only when all five aligned chain windows are complete and reconciled |
| 30d/90d/all-time YPO | matching `marketRow` fields | Explicitly unavailable until those windows are indexed                         |
| Chain detail         | `detail.chainBreakdown`     | Finalized block, vault state, share price, estimated APY, and history state    |
| Trust                | `trust`                     | Freshness, expected/included/missing chains, versions, and source registry     |

Lending-only concepts such as borrowers, borrows, repays, and liquidations are
listed under `nonApplicableMetrics`. They are not native issuer/savings-vault
metrics and are not filled with zeros.

## Numeric and status contract

All blockchain integers are decimal strings. USDp and sUSDp use 18 base-unit
decimals. `fixed_18` is a dimensionless fixed-point number; for example,
`50000000000000000` means 5%. Consumers must not coerce these values through a
JavaScript `number` before decimal scaling.

Every headline metric has two independent axes:

- `availability`: `available`, `stale`, or `unavailable`;
- `verification`: `verified`, `candidate`, or `not_applicable`.

This prevents a present value from silently implying that its methodology is
final. An unavailable value is `null` and includes a machine-readable reason.
Current cross-chain savings values remain candidate until owner review. A
historical global total is promoted to verified only after aligned, gap-free,
per-chain coverage and reconciliation.

## Data flow and ownership

```mermaid
flowchart LR
  RPC[Finalized EVM RPC reads and logs] --> RAW[PostgreSQL raw evidence]
  RAW --> DERIVE[Versioned state, flow, and YPO derivations]
  DERIVE --> RECON[Coverage and reconciliation gates]
  RECON --> API[StableWatch integration payload]
  API --> SW[StableWatch market row and asset detail]
  API --> DEMO[Public inspection dashboard]
```

The API is a projection over durable evidence. It does not call providers on
request, trigger a backfill, or mutate data. Provider credentials remain
server-side Railway variables and are never part of the response.

## Integration checks

1. Fetch the endpoint and require
   `schemaVersion === "parallel-stablewatch-asset-v1"`.
2. Render only metrics with `availability === "available"`; mark `stale`
   separately and preserve `unavailable` reasons.
3. Display verification badges independently from availability.
4. Scale values according to `unit`; do not assume every integer is USD.
5. Preserve `trust`, block provenance, calculation versions, and source links
   in an expandable methodology surface.
6. Treat additions as backward-compatible within v1; a breaking field or unit
   change requires a new route/version.

## Known boundaries at handoff

- Five-chain current sUSDp state is implemented.
- The aligned seven-day history becomes global only after HyperEVM finishes and
  reconciliation passes. Until then, the API correctly reports partial history.
- USDp is registered on 24 chains, but global USDp circulating supply remains
  unavailable until every deployment and the LayerZero bridge accounting are
  verified. The five-chain `supplyOnSavingsChains` number is not global supply.
- The attributed USD price is currently a DIA observation from HyperEVM. The
  response labels this as candidate cross-chain attribution.
- 30d, 90d, all-time, and aligned TVL/APY chart series are not synthesized.

## Repository verification

Run `npm run check` before release. This covers the secret scan, formatting,
lint, type checking, unit/fixture tests, and a production Next.js build. The
public dashboard and integration route use the same pure payload builder, so
their status and metric semantics cannot drift independently.
