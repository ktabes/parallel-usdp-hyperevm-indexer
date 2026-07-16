# Phase 6 multichain history foundation evidence

Date: 2026-07-15  
Production service: `https://content-spirit-production-5efa.up.railway.app`  
Code commits: `71e6e43`, `3618849`, `cfcc5cb`, `91c4247`, `bfc75d7`

## Outcome

The production indexer now has one chain-aware historical pipeline for all five official sUSDp chains. It resolves independent block numbers onto UTC windows, proves exact pinned start/end state before log spending, stores immutable logs and coverage, derives chain-local flows, calculates native YPO, and requires an independent rate integration before marking YPO verified.

All four newly added historical adapters completed real seven-day production backfills and exact reconciliation:

| Chain     | Blocks covered | Raw logs | Decoded events | Coverage gaps |         Verified native YPO |
| --------- | -------------: | -------: | -------------: | ------------: | --------------------------: |
| Ethereum  |         50,204 |        0 |              0 |             0 |   5.241083879972596955 USDp |
| Base      |        302,401 |      193 |            158 |             0 |   0.484768050314572263 USDp |
| Sonic     |        382,822 |      144 |            144 |             0 |                      0 USDp |
| Avalanche |        578,286 |       50 |             39 |             0 | 484.979734550454000326 USDp |

All four completed with zero decoder failures, RPC retries, and range reductions. The earlier Base, Sonic, and Avalanche runs also collected USDp `Transfer` evidence: 158 on Base, 144 on Sonic, and 39 on Avalanche. The optimized Ethereum run queried only the sUSDp vault and found no events. Savings history now requests only sUSDp Deposit, Withdraw, Accrued, rate, pause, and share-transfer evidence; high-volume USDp transfers are reserved for the standalone USDp distribution and bridge-accounting lane. No sUSDp Deposit or Withdraw occurred in these windows, so native user-flow aggregates correctly remained empty rather than inventing zero-valued events.

Live endpoint: `https://content-spirit-production-5efa.up.railway.app/api/analytics/history`

## Exact reconciliation

Each completed interval had no in-window `Accrued` event and retained the same actual USDp asset balance, savings rate, and `lastUpdate` across its boundaries. The reconciliation service independently recomputed `totalAssets()` at both boundary timestamps using the on-chain fixed-point rate formula.

For Ethereum, Base, Sonic, and Avalanche:

- predicted start `totalAssets` equaled the pinned start read exactly;
- predicted end `totalAssets` equaled the pinned end read exactly;
- independently integrated yield equaled canonical native YPO exactly;
- start delta, end delta, and YPO delta were all `0` base units.

The database rows were therefore promoted from `candidate` to `verified`. Windows with an accrual, balance change, rate change, or `lastUpdate` change remain candidate until segmented reconciliation is implemented; they are not forced through the constant-rate proof.

## Provider capability matrix

| Chain     | Current state | Seven-day pinned state                                | Seven-day logs | Result                                                                                              |
| --------- | ------------- | ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| Ethereum  | Pass          | Pass via Alchemy                                      | Complete       | Alchemy proved exact boundary state; free dRPC supplied six sUSDp-only log ranges. Verified stored. |
| Base      | Pass          | Pass after one transient official-RPC backend failure | Complete       | Verified interval stored.                                                                           |
| Sonic     | Pass          | Pass                                                  | Complete       | Verified zero-yield interval stored.                                                                |
| Avalanche | Pass          | Pass                                                  | Complete       | Verified positive-yield interval stored.                                                            |
| HyperEVM  | Pass          | Pass via QuickNode Archive EVM                        | In progress    | Pinned seven-day scope is actively resuming from reused, gap-free coverage at block 40,176,979.     |

Ethereum Mainnet was enabled successfully in the existing Alchemy app. Alchemy's free plan proved the exact historical state boundaries but restricted `eth_getLogs` to ten-block ranges. The backfill therefore used Alchemy for range planning and pinned state reads, plus `https://eth.drpc.org` for six read-only sUSDp log ranges of at most 10,000 blocks. This provider split completed 50,204 blocks without gaps, retries, reductions, or paid archive capacity.

## HyperEVM pinned resume and coverage reuse

On 2026-07-16 UTC, QuickNode Archive EVM passed both historical boundary reads for the pinned window from block `39,958,147` through `40,572,940`. The provider's Discover-plan `eth_getLogs` limit is five blocks per request, so `--window-end 1784163557` fixes the exact scope across process restarts and prevents a moving seven-day window from discarding checkpoint progress.

The earlier `parallel-usdp-susdp-seven-day-v1` run had already proven a continuous USDp-and-sUSDp superset from the new window's start through block `40,176,978`. Before reuse, the production transaction:

- locked both source and target checkpoints;
- independently rejected any source or target coverage gap;
- copied 43,767 source coverage rows with their original `run_id` and `scanned_at` provenance;
- preserved the source reorg anchor at block `40,173,813`;
- proved the target scope complete across all 218,832 reused blocks; and
- advanced the target checkpoint to `40,176,979` without deleting immutable logs, events, or newer target-scope coverage.

QuickNode then resumed at block `40,176,979` with zero retries, decoder failures, or range reductions in the first 200 five-block chunks. The live run remains candidate until it reaches block `40,572,940`, proves gap-free coverage, and passes independent YPO reconciliation.

## Code and schema delivered

- Decoder identity is keyed by `(chain_id, contract_address)`, preventing reused cross-chain addresses from receiving the wrong ABI or role.
- The existing immutable `blocks`, `raw_logs`, `protocol_events`, coverage, run, and checkpoint tables now support any savings-chain adapter.
- `savings_yield_aggregates` links exact normalized boundary snapshots, complete log coverage, native YPO, and reconciliation status.
- `global_savings_yield_aggregates` and component links fail closed: candidate or invalid chain intervals are visible but not silently summed.
- `history-plan`, `history-boundaries`, `history-backfill`, `history-reconcile`, and `history` CLI commands provide a gated operator workflow.
- `history-backfill --log-rpc-url` permits a separate historical log provider only after the configured chain RPC proves both pinned state boundaries.
- `history-backfill --window-end` pins the common Unix endpoint so provider changes and process restarts resume the same durable scope.
- `/api/analytics/history` exposes the latest chain intervals and preserves `global: null` until a valid aligned global interval exists.

## Verification completed

- Secret scan: passed.
- Formatting and ESLint: passed.
- TypeScript typecheck: passed.
- Tests: 72 passed, 2 opt-in suites skipped.
- Production build: passed.
- Migration `0005_lively_roxanne_simpson.sql`: applied in Railway.
- Current-state worker after migration: complete, 5/5 candidate snapshots.
- Historical API: partial with four verified chain intervals and no fabricated global total.

## Remaining Phase 6 work

1. Complete the active HyperEVM scan from block `40,176,979` through `40,572,940` and run exact reconciliation.
2. Run one common aligned five-chain window after all providers pass.
3. Add segmented rate/accrual reconciliation for intervals whose state basis changes inside the window.
