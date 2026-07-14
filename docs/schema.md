# Schema boundaries

The Phase 0 migration establishes only the source and control plane that must remain stable regardless of later decoder details:

- `contract_manifests` and `contract_eras` version address, implementation, ABI, and decoder provenance.
- `blocks` anchors every observation to finalized chain state.
- `raw_logs` preserves immutable event evidence with the canonical uniqueness key.
- `indexer_runs` and `indexer_checkpoints` make progress observable and restartable.
- `price_observations` keeps pricing attributed and separate from native protocol accounting.

Normalized protocol events, transfer ledgers, vault/rate events, hourly flows, snapshots, YPO aggregates, reconciliation runs, and health findings are intentionally deferred until Phase 1 locks the executable event and metric contract. This avoids encoding unverified candidate semantics into the durable schema.

## Rules

- EVM addresses and hashes are stored lowercase after boundary validation.
- Block numbers and database identifiers use 64-bit integers.
- Token/rate/price quantities use exact integers; no database floating-point types.
- Every derived table added later must carry source range, manifest version, calculation version, and creation time.
- Raw logs are never updated to match a new decoder. Rebuild derived rows instead.
