# Parallel USDp + sUSDp HyperEVM Indexer

An independent, auditable indexer and analytics surface for Parallel V3 USDp and sUSDp on HyperEVM. The shareable MVP is designed to produce StableWatch-compatible market metrics while making every number traceable to finalized blocks, source logs, contract reads, a metric definition, and reconciliation evidence.

## Current status

Phase 1 candidate. Official deployment artifacts, contract identities, proxy implementations, Parallelizer facets and collateral relationships, ABI provenance, deployment blocks, metric definitions, and DIA price feeds are executable and verified against current HyperEVM state. Approval remains gated on repeating state discovery at a pinned finalized block through an archive-capable RPC.

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
npm run cli -- preflight
npm run test:unit
npm run test:fixtures
npm run test:integration
npm run test:network
```

Network tests are opt-in and require `RUN_NETWORK_TESTS=1` plus a real `HYPEREVM_RPC_URL`. Integration tests run when `TEST_DATABASE_URL` is present and otherwise report as skipped.

The official HyperEVM RPC can be used for current-state discovery and small bounded log samples, but it does not honor historical `eth_call` state and limits `eth_getLogs` to 50-block ranges. A manifest produced from it remains a candidate until the same discovery passes against a pinned finalized block through an archive-capable endpoint; a complete seven-day or lifetime backfill also needs a higher-capacity endpoint.

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
