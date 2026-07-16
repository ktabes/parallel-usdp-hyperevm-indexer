# Phase 6 multichain history foundation evidence

Date: 2026-07-15  
Production service: `https://content-spirit-production-5efa.up.railway.app`  
Code commits: `71e6e43`, `3618849`

## Outcome

The production indexer now has one chain-aware historical pipeline for all five official sUSDp chains. It resolves independent block numbers onto UTC windows, proves exact pinned start/end state before log spending, stores immutable logs and coverage, derives chain-local flows, calculates native YPO, and requires an independent rate integration before marking YPO verified.

Three of the four newly added historical adapters completed real seven-day production backfills and exact reconciliation:

| Chain     | Blocks covered | Raw logs | Decoded events | Coverage gaps |         Verified native YPO |
| --------- | -------------: | -------: | -------------: | ------------: | --------------------------: |
| Base      |        302,401 |      193 |            158 |             0 |   0.484768050314572263 USDp |
| Sonic     |        382,822 |      144 |            144 |             0 |                      0 USDp |
| Avalanche |        578,286 |       50 |             39 |             0 | 484.979734550454000326 USDp |

All three completed with zero decoder failures, RPC retries, and range reductions. The decoded events were USDp `Transfer` evidence: 158 on Base, 144 on Sonic, and 39 on Avalanche. No sUSDp Deposit or Withdraw occurred in these windows, so native user-flow aggregates correctly remained empty rather than inventing zero-valued events.

Live endpoint: `https://content-spirit-production-5efa.up.railway.app/api/analytics/history`

## Exact reconciliation

Each completed interval had no in-window `Accrued` event and retained the same actual USDp asset balance, savings rate, and `lastUpdate` across its boundaries. The reconciliation service independently recomputed `totalAssets()` at both boundary timestamps using the on-chain fixed-point rate formula.

For Base, Sonic, and Avalanche:

- predicted start `totalAssets` equaled the pinned start read exactly;
- predicted end `totalAssets` equaled the pinned end read exactly;
- independently integrated yield equaled canonical native YPO exactly;
- start delta, end delta, and YPO delta were all `0` base units.

The database rows were therefore promoted from `candidate` to `verified`. Windows with an accrual, balance change, rate change, or `lastUpdate` change remain candidate until segmented reconciliation is implemented; they are not forced through the constant-rate proof.

## Provider capability matrix

| Chain     | Current state | Seven-day pinned state                                | Seven-day logs | Result                                                                                                |
| --------- | ------------- | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Ethereum  | Pass          | Blocked on configured providers                       | Not started    | PublicNode requires a personal archive token. The existing Alchemy app has Ethereum Mainnet disabled. |
| Base      | Pass          | Pass after one transient official-RPC backend failure | Complete       | Verified interval stored.                                                                             |
| Sonic     | Pass          | Pass                                                  | Complete       | Verified zero-yield interval stored.                                                                  |
| Avalanche | Pass          | Pass                                                  | Complete       | Verified positive-yield interval stored.                                                              |
| HyperEVM  | Pass          | Deferred                                              | Deferred       | Historical provider budget remains deferred from the earlier phase.                                   |

The Ethereum gate failed before log ingestion or YPO writes. Enabling Ethereum Mainnet for the existing Alchemy app should allow the same boundary command to be retried without adding a new key.

## Code and schema delivered

- Decoder identity is keyed by `(chain_id, contract_address)`, preventing reused cross-chain addresses from receiving the wrong ABI or role.
- The existing immutable `blocks`, `raw_logs`, `protocol_events`, coverage, run, and checkpoint tables now support any savings-chain adapter.
- `savings_yield_aggregates` links exact normalized boundary snapshots, complete log coverage, native YPO, and reconciliation status.
- `global_savings_yield_aggregates` and component links fail closed: candidate or invalid chain intervals are visible but not silently summed.
- `history-plan`, `history-boundaries`, `history-backfill`, `history-reconcile`, and `history` CLI commands provide a gated operator workflow.
- `/api/analytics/history` exposes the latest chain intervals and preserves `global: null` until a valid aligned global interval exists.

## Verification completed

- Secret scan: passed.
- Formatting and ESLint: passed.
- TypeScript typecheck: passed.
- Tests: 72 passed, 2 opt-in suites skipped.
- Production build: passed.
- Migration `0005_lively_roxanne_simpson.sql`: applied in Railway.
- Current-state worker after migration: complete, 5/5 candidate snapshots.
- Historical API: partial with three verified chain intervals and no fabricated global total.

## Remaining Phase 6 work

1. Enable Ethereum Mainnet on the existing Alchemy app and run its boundary gate and seven-day backfill.
2. Resume HyperEVM history when an archive/log provider budget is available.
3. Run one common aligned five-chain window after all providers pass.
4. Add segmented rate/accrual reconciliation for intervals whose state basis changes inside the window.
