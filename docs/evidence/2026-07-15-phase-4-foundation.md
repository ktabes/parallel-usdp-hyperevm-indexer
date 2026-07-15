# Phase 4 foundation — 2026-07-15

## Implemented candidate scope

- Finalized pinned-block vault snapshot capture.
- USDp total supply and sUSDp total assets, actual assets, share supply, pending yield, share price, rate, last update, estimated APR, maximum rate, and pause state.
- ERC-1967 implementation capture and implementation-drift status.
- Pinned DIA USDp/USD and sUSDp/USD observations with round provenance, exact feed units, age, and stale status.
- Canonical native YPO calculation: accrued interest in `(start,end]` plus pending yield at end minus pending yield at start.
- Fail-closed interval requirements for complete indexed coverage and exact boundary snapshots.
- Read-only state, yield, rate, and price CLI/API queries with explicit unavailable states.

## Status boundary

This is a Phase 4 foundation, not an approved YPO result. A snapshot can be valid pinned evidence without a complete historical backfill. A YPO interval cannot be produced unless its coverage and boundary requirements pass. Any resulting interval remains `candidate` until the independent rate-integration reconciliation is implemented and approved.

## Required follow-up

1. Apply the migration and capture a current finalized production snapshot.
2. Capture interval boundary snapshots for the desired 1h, 24h, and 7d windows.
3. Complete the seven-day backfill.
4. Calculate native YPO only for fully covered intervals.
5. Implement and compare the independent rate-segment integration method.
6. Add reconciliation and stale/failure health evidence before dashboard work.
