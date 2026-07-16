# StableWatch reviewer runbook

This repository is designed to be reviewed from the public deployment first
and traced back to code and PostgreSQL evidence second.

## Five-minute walkthrough

1. Open the [public dashboard](https://content-spirit-production-5efa.up.railway.app).
   The headline combines USDp stablecoin distribution with sUSDp ERC-4626
   savings state rather than treating them as the same asset. The page refreshes
   from PostgreSQL every 60 seconds.
2. Open the [StableWatch projection](https://content-spirit-production-5efa.up.railway.app/api/v1/stablewatch/assets/parallel-usdp-susdp).
   Every headline metric has independent availability and verification status.
3. Open the [24-chain USDp supply evidence](https://content-spirit-production-5efa.up.railway.app/api/analytics/usdp-supply).
   Inspect expected/included/missing/stale/failed chain IDs, component block
   hashes/timestamps, bytecode hashes, and metadata proof.
4. Open the [four-chain all-time range proof](https://content-spirit-production-5efa.up.railway.app/api/analytics/range?range=all&chains=ethereum,base,sonic,avalanche&assets=usdp,susdp).
   This is a deterministic replay from each registered deployment boundary,
   including USDp and sUSDp transfer, mint, burn, holder, deposit, and
   withdrawal metrics.
5. Open the [five-chain history proof](https://content-spirit-production-5efa.up.railway.app/api/analytics/history).
   The latest rows share one pinned seven-day UTC window, every chain is
   reconciled, and the global object contains the exact verified sum.
6. Run the automated reviewer proof:

   ```bash
   npm ci
   npm run reviewer:proof
   ```

## Live publication behavior

The lifetime activity table is pre-wired to persisted chain checkpoints and
derived aggregates:

- `Indexing history` reports the durable checkpoint percentage without exposing
  partial activity totals.
- `Deriving metrics` means the range is gap-free and holder/flow derivation is
  running.
- `Published` means both USDp and sUSDp lifetime aggregates are complete; the
  transfer, holder, and vault-flow cells populate on the next 60-second refresh.

Ethereum, Base, Sonic, and Avalanche are published from their complete lifetime
scopes. HyperEVM is shown separately as a verified fixed seven-day history
because its public log limits make lifetime replay a materially different
archive workload.

The visible dashboard does not use the internal word `candidate` as a generic
quality badge. It names the concrete evidence state instead: finalized onchain,
24-chain onchain, price-attributed, reconciled, or awaiting coverage. The trust
layer explains the API lifecycle term and links to the unmodified raw payload.

## What the proof command requires

The command calls only public read endpoints. It requires no database URL, RPC
key, Railway access, or wallet. It fails non-zero unless:

- the service identity and health are correct;
- the latest USDp snapshot has complete 24/24 coverage, no missing/stale/failed
  components, and verified metadata for every deployment;
- Ethereum, Base, Sonic, and Avalanche lifetime USDp+sUSDp ranges are complete
  and return exact integer activity, holder, and vault-flow metrics;
- all five savings chains expose one aligned, independently reconciled
  seven-day YPO window, including the fixed HyperEVM provenance;
- the StableWatch v1 payload exposes a renderable global USDp metric and chain
  breakdown.

Use `REVIEW_BASE_URL=http://localhost:3000 npm run reviewer:proof` to validate a
local deployment or `npm run reviewer:proof -- --base-url=https://example.com`
for another environment.

## Traceability map

| Claim                        | Evidence path                           | Implementation                      |
| ---------------------------- | --------------------------------------- | ----------------------------------- |
| 24-chain current USDp supply | `/api/analytics/usdp-supply`            | `src/analytics/usdp-supply.ts`      |
| Range activity and holders   | `/api/analytics/range`                  | `src/analytics/range-analytics.ts`  |
| Native YPO                   | `/api/analytics/history` and projection | `src/analytics/multichain-yield.ts` |
| Coverage and reconciliation  | verification CLI and DB results         | `src/verification/service.ts`       |
| StableWatch field mapping    | versioned v1 route                      | `src/integration/stablewatch.ts`    |
| Database constraints         | Drizzle migrations                      | `drizzle/` and `src/db/schema.ts`   |

## Status boundaries

- A present onchain value can still be `candidate`; availability does not imply
  methodology promotion.
- Current 24-chain USDp supply is a complete candidate distribution snapshot.
  Verified omnichain circulating supply additionally requires bridge topology
  and message lifecycle reconciliation.
- Historical activity is available only inside gap-free lifetime coverage.
- YPO is summed only across contiguous stored intervals. Missing 30d/90d/all
  boundary evidence stays unavailable.
- Lending-market borrows, repays, and liquidations are not native Parallel
  issuer/vault metrics and are never filled with zeros.

## Full repository gate

Run `npm run check` for the secret scan, formatting, lint, TypeScript, unit and
fixture tests, integration tests when PostgreSQL is configured, and the
production Next.js build. The CI workflow runs the same gate against PostgreSQL 17.
