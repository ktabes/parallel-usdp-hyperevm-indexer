# Methodology

## Evidence hierarchy

1. Finalized HyperEVM logs and pinned-block contract reads.
2. Official Parallel source code and deployment documentation, tied to a commit or version.
3. Attributed price observations used only under a documented freshness and confidence policy.
4. External analytics as comparisons, never as the sole source for native flows or Yield Paid Out.

Every production metric must record its chain, source block or range, block time, manifest version, calculation version, unit, and freshness. Raw logs are immutable. Decoded events, balances, snapshots, aggregates, and reconciliation outputs are rebuildable.

## Finality and time

The indexer advances only through the configured finalized head (`chain head - FINALITY_LAG`) until Phase 1 establishes a stronger chain-specific finality rule. Block timestamps are authoritative for protocol events. API presentation may include wall-clock observation time, but it must never replace block time.

## Availability

An unavailable metric is a typed result with a reason, not `0`, `null` without context, or an estimate presented as finalized. This applies especially to incomplete holder reconstruction, collateral backing, 30d/90d/all-time history, and external lending activity.

## Numeric policy

Token quantities, fixed-point rates, prices, and USD values remain integer base units through ingestion and calculation. Decimal formatting happens at presentation boundaries. No JavaScript floating-point arithmetic is permitted in protocol accounting.

## Recovery

Backfill and incremental sync use the same ingestion path. Each range is idempotent, checkpoint hashes are verified before resume, and overlap is safe because `(chain_id, transaction_hash, log_index)` is unique.
