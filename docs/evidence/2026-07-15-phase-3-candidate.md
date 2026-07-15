# Phase 3 candidate evidence — 2026-07-15

## Scope completed

- Added replayable economic classifications for USDp issue, burn, and redemption; sUSDp deposit and withdrawal; accrual and configuration changes; and ordinary USDp/sUSDp transfers.
- Linked classifications by transaction and retained the ordered set of normalized events as transaction context.
- Added exact integer hourly/daily native-flow aggregation and unique deposit/withdraw owner counts.
- Added provenance-bound `economic_events` and `flow_aggregates` tables.
- Added `derive-flows --from-block ... --to-block ...` with a fail-closed coverage gate.

## Double-counting policy

- `Deposit` and `Withdraw` are the only authoritative sUSDp user-flow events.
- Parallelizer `Swap` and `Redeemed` are the only authoritative USDp issue/burn/redemption events.
- ERC-20 transfers remain linked evidence but never become native protocol flows.
- An USDp mint accompanying `Accrued` is therefore not counted as user issuance.
- Deposit/withdraw participants are keyed by vault `owner`; routers and receivers remain secondary context.

## Local verification

`npm run check` passed on 2026-07-15:

- secret scan;
- formatting and lint;
- TypeScript typecheck;
- 44 enabled tests passed and 2 opt-in tests skipped;
- Next.js production build.

## Remaining gate

This is a code-complete Phase 3 candidate, not approved production analytics. The seven-day Phase 2 range remains incomplete because the archive provider reached its daily request quota. `derive-flows` returns `coverage_incomplete` and performs no writes until the requested range has no gaps. Production values and the public dashboard must remain unavailable until backfill coverage and transaction-level review pass.
