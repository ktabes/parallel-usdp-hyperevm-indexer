# Evidence record: Phase 0 local foundation

- Date/time: 2026-07-14 America/New_York
- Git commit: not yet committed
- Operator: Codex with owner brief
- Manifest version: not created; Phase 1 candidate discovery is gated
- Chain/block range: none; no chain data indexed in Phase 0
- Environment: local macOS workspace

## Commands and results

```text
npm run db:generate
PASS - generated drizzle/0000_quiet_steve_rogers.sql for seven source/control tables

npm run check
PASS - secret scan, formatting, ESLint, strict TypeScript, Vitest, and Next.js production build

npm audit --json
PASS - zero known dependency vulnerabilities after compatible transitive overrides

curl -sS http://127.0.0.1:3100/api/health
PASS - returned status=ok, service name, Phase 0, and current timestamp from the production build
```

Vitest result at the recorded gate: 10 passed and 2 environment-dependent tests skipped. The skipped tests are the PostgreSQL connectivity smoke and live HyperEVM RPC chain-ID probe. They are opt-in by design and must pass in a configured environment before Phase 0 is fully closed.

## Data evidence

- Migration tables: `blocks`, `contract_manifests`, `contract_eras`, `indexer_runs`, `indexer_checkpoints`, `raw_logs`, `price_observations`.
- Canonical raw-log uniqueness: `(chain_id, transaction_hash, log_index)`.
- No protocol logs, snapshots, prices, or metrics were fetched or stored.

## Review

- Scope review: HyperEVM-only issuer/savings MVP matches the owner brief.
- Schema review: durable source/control tables only; normalized event and metric tables wait for the Phase 1 executable contract.
- Product review: current StableWatch market and xHYPE detail concepts are recorded in `docs/research/stablewatch-product-compatibility-2026-07-14.md`.

## Limitations and next gate

- PostgreSQL is not installed or running in the current local environment, so migration application/connectivity is not yet proven here.
- No real RPC URL was provided, so the live network probe remains intentionally skipped.
- Candidate contract addresses, implementations, deployment blocks, ABIs, and price source remain unverified.
- External GitHub/Railway creation and spending are not authorized yet.

Phase 1 may begin only after the PostgreSQL migration smoke passes and the owner identifies the intended RPC and deployment surfaces (local credentials may remain uncommitted).
