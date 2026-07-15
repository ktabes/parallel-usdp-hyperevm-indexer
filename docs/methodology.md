# Methodology

## Evidence hierarchy

1. Finalized chain-local logs and pinned-block contract reads from official USDp/sUSDp deployments.
2. Official Parallel source code and deployment documentation, tied to a commit or version.
3. Attributed price observations used only under a documented freshness and confidence policy.
4. External analytics as comparisons, never as the sole source for native flows or Yield Paid Out.

Every production metric must record its chain, source block or range, block time, manifest version, calculation version, unit, and freshness. Raw logs are immutable. Decoded events, balances, snapshots, aggregates, and reconciliation outputs are rebuildable.

## Finality and time

Ethereum, Base, Sonic, and Avalanche current-state adapters use the RPC `finalized` block tag. HyperEVM uses `chain head - FINALITY_LAG` because its verified adapter predates the multichain layer and its provider behavior was tested with that rule. Block timestamps are authoritative for protocol events. A global snapshot aligns finalized component snapshots by UTC time; it never pretends that unrelated chain block numbers are comparable. API presentation may include wall-clock observation time, but it must never replace block time.

## Cross-chain aggregation

Chain-local token and vault reads remain the evidence units. A global sUSDp snapshot links to every included chain component and reports expected, included, missing, stale, and invalid chains. Global sUSDp assets and YPO are additive only across aligned valid components. The headline estimated APY is weighted by chain-local `totalAssets`; rates are never summed. USDp supply across the five savings chains is explicitly a partial distribution metric until all 24 official USDp deployments and V3 bridge accounting are verified.

## Availability

An unavailable metric is a typed result with a reason, not `0`, `null` without context, or an estimate presented as finalized. This applies especially to incomplete holder reconstruction, collateral backing, 30d/90d/all-time history, and external lending activity.

## Numeric policy

Token quantities, fixed-point rates, prices, and USD values remain integer base units through ingestion and calculation. Decimal formatting happens at presentation boundaries. No JavaScript floating-point arithmetic is permitted in protocol accounting.

## Recovery

Backfill and incremental sync use the same ingestion path. Each completed RPC range receives a durable coverage row, and overlap is safe because `(chain_id, transaction_hash, log_index)` is unique. The checkpoint advances after the coverage row and raw logs commit atomically. Periodic finalized block-hash anchors are verified before resume, providing drift detection without adding one block request to every 50-block log chunk.
