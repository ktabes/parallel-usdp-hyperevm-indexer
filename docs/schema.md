# Schema boundaries

The Phase 0 migration establishes only the source and control plane that must remain stable regardless of later decoder details:

- `contract_manifests` and `contract_eras` version address, implementation, ABI, and decoder provenance.
- `blocks` anchors every observation to finalized chain state.
- `raw_logs` preserves immutable event evidence with the canonical uniqueness key.
- `indexer_runs` and `indexer_checkpoints` make progress observable and restartable.
- `indexer_coverage` proves exactly which inclusive ranges completed, including overlapping reruns.
- `price_observations` keeps pricing attributed and separate from native protocol accounting.
- `protocol_events` stores rebuildable decoded payloads linked one-to-one to their immutable raw logs.

The Phase 3 candidate migration adds two rebuildable layers:

- `economic_events` classifies authoritative protocol events while retaining the source `protocol_event_id`, transaction context, source range, manifest version, and calculation version. Transfer evidence remains visible but is not promoted into deposit, withdrawal, issue, burn, or redemption flow.
- `flow_aggregates` stores exact base-unit hourly and daily sums, event counts, and unique primary participants. Rows are tied to the exact covered source range and cannot be produced by the supported command while coverage is incomplete.

Transfer ledgers, specialized rate-segment tables, reconciliation runs, and health findings remain deferred to their later phase gates. The generic Phase 2 event table preserves decoded evidence so every Phase 3 classification can be rebuilt.

The Phase 4 candidate migration adds finalized evidence and interval calculations:

- `vault_snapshots` stores USDp supply, sUSDp accounting state, pending yield, share price, rate/APR state, pause state, proxy implementations, and references to the exact pinned price observations.
- `yield_aggregates` stores the two boundary snapshots, accrued interest, both pending-yield boundaries, native YPO, the `(start_block,end_block]` convention, and versioned provenance.

Snapshot capture is independent of historical log coverage. YPO derivation is not: the supported calculation refuses to write unless both exact boundary snapshots exist and the complete interval passes the coverage check.

## Rules

- EVM addresses and hashes are stored lowercase after boundary validation.
- Block numbers and database identifiers use 64-bit integers.
- Token/rate/price quantities use exact integers; no database floating-point types.
- Every derived table added later must carry source range, manifest version, calculation version, and creation time.
- Raw logs are never updated to match a new decoder. Rebuild derived rows instead.
