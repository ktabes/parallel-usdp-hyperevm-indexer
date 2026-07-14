# Parallel USDp + sUSDp HyperEVM Indexer

An independent, auditable indexer and analytics surface for Parallel V3 USDp and sUSDp on HyperEVM. The shareable MVP is designed to produce StableWatch-compatible market metrics while making every number traceable to finalized blocks, source logs, contract reads, a metric definition, and reconciliation evidence.

## Current status

Phase 1 remains an explicitly labeled discovery candidate because the free providers do not support a complete pinned archive run. The Phase 2 demo pipeline is implemented separately: it scans finalized public-RPC logs, persists immutable raw evidence and decoded events, records exact coverage, and resumes through PostgreSQL checkpoints. Historical metrics remain unavailable until the seven-day coverage gate completes.

## Product boundary

- HyperEVM only.
- Parallel V3 USDp issuer/parallelizer and sUSDp ERC-4626 savings vault.
- Seven finalized days for the initial historical window.
- External lending markets are out of the MVP.
- Borrow, repay, and liquidation metrics are not applicable at the native issuer/savings layer.
- Yield Paid Out is the centerpiece; unsupported 30d, 90d, and all-time windows stay unavailable until fully indexed and reconciled.

## Local setup

Requirements: Node.js 22+ and PostgreSQL 17+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run check
npm run dev
```

Useful commands:

```bash
npm run cli -- config-check
npm run cli -- db-ping
npm run cli -- discover --block latest
npm run cli -- discover --rpc archive --block FINALIZED_BLOCK_NUMBER
npm run cli -- discover --rpc alchemy --block FINALIZED_BLOCK_NUMBER
npm run cli -- preflight
npm run cli -- backfill --from-block FROM --to-block TO
npm run cli -- seven-day-backfill
npm run cli -- sync
npm run cli -- status
npm run cli -- verify-coverage --from-block FROM --to-block TO
npm run test:unit
npm run test:fixtures
npm run test:integration
npm run test:network
```

Network tests are opt-in and require `RUN_NETWORK_TESTS=1` plus a real `HYPEREVM_RPC_URL`. Integration tests run when `TEST_DATABASE_URL` is present and otherwise report as skipped.

The official HyperEVM RPC is the default seven-day log source. It limits `eth_getLogs` to 50-block ranges and approximately 100 requests per minute, so the initial week is a long, resumable one-time job rather than a deployment startup task. The optional `ALCHEMY_API_KEY` provides recent-state reads but is not treated as historical. OnFinality remains optional for strict archive certification. Provider roles are assigned from live capability evidence rather than marketing claims.

On Railway, set `RUN_SEVEN_DAY_BACKFILL=1` to start the worker beside the web service. A PostgreSQL advisory lock prevents duplicate workers, and `/api/indexer/status` exposes the checkpoint, stored row counts, and recent runs. Set the flag back to `0` after the initial week completes if continuous catch-up is not wanted.

## Phase gates

1. Foundation and guardrails.
2. Pinned protocol discovery and executable metric specification.
3. Idempotent finalized raw-log ingestion and seven-day backfill.
4. Economic events, flows, participants, and optional lifetime holder ledger.
5. Snapshots, prices, YPO, and live projection.
6. Reconciliation and explicit failure evidence.
7. Owner review, then the public inspection dashboard.
8. Railway deployment and StableWatch integration handoff.

See [methodology](docs/methodology.md), [metric contract](docs/metric-contract.md), [schema notes](docs/schema.md), and the [Phase 0 scope decision](docs/decisions/0001-hyperevm-mvp-scope.md).
