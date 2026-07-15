# Phase 5 multichain current-state evidence

Date: 2026-07-15  
Production service: `https://content-spirit-production-5efa.up.railway.app`  
Verified deployment: `842c4c75-9e28-4f07-903b-42bc3c7a76c9`  
Verified global snapshot: `21` at `2026-07-15T23:27:28.287Z`

## Outcome

The production indexer returned `complete` current-state coverage for all five official sUSDp deployment chains:

- Ethereum (`1`)
- Base (`8453`)
- Sonic (`146`)
- HyperEVM (`999`)
- Avalanche (`43114`)

The global response reported five expected chains, five included chains, no missing chains, no stale chains, and a fresh aggregate. Each included component was a finalized `candidate` snapshot with the sUSDp `asset()` relationship verified against that chain's configured USDp contract.

Live endpoint: `https://content-spirit-production-5efa.up.railway.app/api/analytics/global`

## Verified aggregate

All values below are derived from the raw 18-decimal integers returned by global snapshot `21`.

| Metric                                 |                   Raw value |              Human-readable value |
| -------------------------------------- | --------------------------: | --------------------------------: |
| USDp supply on the five savings chains | `1993267973395458979561815` | 1,993,267.973395458979561815 USDp |
| sUSDp total assets                     |  `310756727266332339733645` |   310,756.727266332339733645 USDp |
| sUSDp total supply                     |  `291148442408482498876691` |  291,148.442408482498876691 sUSDp |
| Asset-weighted estimated APY           |         `99999649425945119` |               9.9999649425945119% |

## Per-chain components

| Chain     |      Block | Block time              |                USDp supply |         sUSDp total assets | Estimated APY |
| --------- | ---------: | ----------------------- | -------------------------: | -------------------------: | ------------: |
| Ethereum  | 25,541,262 | 2026-07-15 23:12:23 UTC |  14,867.867483811133552565 |   2,869.881435023003502515 |           10% |
| Base      | 48,683,873 | 2026-07-15 23:11:33 UTC |  80,847.359628513645097716 |     265.447341252665761724 |           10% |
| Sonic     | 76,006,035 | 2026-07-15 23:27:20 UTC |   2,357.449501476906875109 |       1.089432459542449238 |            0% |
| HyperEVM  | 40,567,330 | 2026-07-15 23:27:19 UTC | 963,891.622397769411019629 |  42,057.100377624334125760 |           10% |
| Avalanche | 90,410,357 | 2026-07-15 23:27:23 UTC | 931,303.674383887883016796 | 265,563.208679972793894408 |           10% |

## Production behavior verified

- Database migration `0004_spooky_stellaris.sql` completed during deployment.
- The rolling-deploy advisory-lock retry handed ownership to the new worker after one wait attempt.
- All five adapters produced verified candidate snapshots in production.
- The prior QuickNode HyperEVM endpoint reached its daily request limit. Because historical backfilling is disabled, production was switched to HyperEVM's public RPC for lightweight current-state reads. The verified cycle then captured HyperEVM successfully alongside the other four chains.
- During verification, Base's public RPC returned a valid finalized block as much as approximately 39 minutes behind wall clock. The finalized-state tolerance is therefore one hour; component timestamps and maximum age remain exposed so this does not hide adapter stoppage.
- `/api/health` returned phase `5`, status `ok`, and phase status `multichain-candidate`.

## Verification completed

- Unit tests: 57 passed.
- TypeScript typecheck: passed.
- ESLint: passed.
- Prettier check: passed.
- Production deployment: successful.
- Production global response: `complete`, 5/5 included, 0 missing, 0 stale.

## Scope boundary

This completes current-state sUSDp coverage because sUSDp is deployed on these five chains. The USDp number is deliberately labeled `supplyOnSavingsChains`: it is the sum on the same five chains and is **not yet global USDp supply**. Standalone USDp coverage remains partial until the remaining official USDp deployment chains and bridge/mint-burn accounting are indexed.

The next implementation lane is:

1. historical sUSDp rate, yield, supply, and asset snapshots on Ethereum, Base, Sonic, and Avalanche;
2. normalized USDp deployments across the remaining official chains;
3. bridge flow and global supply reconciliation so USDp can be presented as one multichain asset without double counting.

Official deployment reference: `https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp`
