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

## First production snapshot

Captured successfully from the public HyperEVM RPC at finalized block `40563503` (`2026-07-15T22:24:35Z`):

- USDp total supply: `963891622397769411019629` base units.
- sUSDp total assets: `42056621940147465159313` USDp base units.
- sUSDp actual assets: `41914762799964919629431` USDp base units.
- sUSDp pending yield: `141859140182545529882` USDp base units.
- sUSDp share price: `1072213508917531979` USDp atomic units per 1 sUSDp.
- Estimated APR: `99999999999999984` fixed-18, approximately 10%.
- USDp DIA price: `998555914965948928` fixed-18, fresh under the configured 12-hour limit.
- sUSDp DIA price: `1070665154379516125` fixed-18, fresh.
- USDp and sUSDp proxy implementations matched the candidate manifest; drift was false.

The public `state`, `rates`, and `price` endpoints returned this snapshot. The public `yield` endpoint correctly returned `unavailable` with reason `reconciled_interval_missing`, because only one boundary snapshot exists.

## Required follow-up

1. Capture interval boundary snapshots for the desired 1h, 24h, and 7d windows.
2. Complete the seven-day backfill.
3. Calculate native YPO only for fully covered intervals.
4. Implement and compare the independent rate-segment integration method.
5. Add reconciliation and stale/failure health evidence before dashboard work.
