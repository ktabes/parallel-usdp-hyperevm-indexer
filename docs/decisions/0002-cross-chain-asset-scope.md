# Decision 0002: Cross-chain USDp and sUSDp asset scope

- Status: accepted by owner
- Date: 2026-07-15
- Supersedes: Decision 0001 for product scope

## Decision

Present USDp and sUSDp as canonical Parallel assets spanning their official chain deployments. HyperEVM remains the first verified adapter and the source of the existing seven-day evidence, but it is one component of the asset-level dataset rather than the identity of the product.

Parallel's official product documentation currently lists USDp on 24 chains and sUSDp ERC-4626 vaults on Ethereum, Base, Sonic, HyperEVM, and Avalanche. The executable registry in `src/protocol/assets.ts` records that official deployment universe separately from adapter and coverage status.

## Product output

The public asset view will lead with global metrics and retain a complete chain breakdown:

- USDp global supply and market value, plus supply and price by chain.
- sUSDp global TVL and YPO, plus vault TVL, rate, APY, YPO, flows, and freshness by chain.
- A TVL-weighted headline sUSDp APY, accompanied by the per-chain APYs and their range. Rates are never summed.
- Coverage, staleness, source, finalized block, and reconciliation status for every chain component.

HyperEVM-only values must be labeled as chain values. A global value must never be emitted from partial coverage without an explicit partial/candidate status and the missing-chain list.

## Accounting rules

### USDp

`USDp.totalSupply()` remains authoritative for a single deployment. The global token supply candidate is the sum of official chain-local supplies at an aligned observation time.

Before that sum is labeled verified, the implementation must inspect the active V3 bridge contracts and prove that bridge movement does not leave both a circulating source-chain token and a circulating destination-chain token counted in the aggregate. Bridge burns/mints and issuer mints/burns are separate flow classifications. DeFiLlama or another aggregator may be stored as attributed comparison evidence, never as the native source of truth.

### sUSDp

Each official sUSDp contract is a chain-local ERC-4626 savings vault. Global sUSDp TVL is the sum of chain-local `totalAssets()` values converted with timestamped USDp prices. Global YPO is the sum of independently reconciled chain-local YPO values over the same time interval.

The headline APY is TVL-weighted:

```text
global_susdp_apy = sum(chain_tvl_usd * chain_apy) / sum(chain_tvl_usd)
```

If any material chain is missing, stale, unreconciled, or on a mismatched interval, the global metric is partial or unavailable according to the metric contract.

## Snapshot alignment

Chains do not share block numbers or finality rules. A global snapshot therefore has an `as_of` timestamp and a set of finalized component snapshots. Each component records chain ID, block number/hash/time, observation age, manifest version, calculation version, and status.

Global calculations carry:

- included and expected chains;
- coverage ratio by chain count and by observed value;
- oldest and newest component timestamps;
- maximum component age;
- aggregation and reconciliation versions.

## Rollout

1. Keep the verified HyperEVM adapter live.
2. Add Ethereum, Base, Sonic, and Avalanche state adapters so all five official sUSDp vaults are covered.
3. Produce asset-level sUSDp TVL, weighted APY, price, and chain distribution.
4. Add YPO and flow history per savings chain, then aggregate only aligned, fully reconciled windows.
5. Add the remaining USDp-only distribution chains and verify V3 bridge accounting before promoting global USDp supply from candidate to verified.
6. Reconcile native global results against attributed external datasets and expose discrepancies.

## Deferred boundary

External lending markets that use USDp or sUSDp remain separate venue integrations. They can enrich distribution and utilization analytics later, but they do not alter native Parallel supply, savings TVL, or YPO definitions.
