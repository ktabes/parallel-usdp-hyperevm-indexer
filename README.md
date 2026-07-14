# Parallel USDp + sUSDp HyperEVM Indexer

An independent, auditable indexer and analytics surface for Parallel V3 USDp and sUSDp on HyperEVM. The shareable MVP is designed to produce StableWatch-compatible market metrics while making every number traceable to finalized blocks, source logs, contract reads, a metric definition, and reconciliation evidence.

## Current status

Phase 1 candidate. Official deployment artifacts, contract identities, proxy implementations, Parallelizer facets and collateral relationships, ABI provenance, deployment blocks, metric definitions, and DIA price feeds are executable and verified against current HyperEVM state. A sparse OnFinality archive probe reproduced the exact sUSDp deployment block, but approval remains gated on repeating the complete discovery through an authenticated archive endpoint at a pinned finalized block.

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
npm run test:unit
npm run test:fixtures
npm run test:integration
npm run test:network
```

Network tests are opt-in and require `RUN_NETWORK_TESTS=1` plus a real `HYPEREVM_RPC_URL`. Integration tests run when `TEST_DATABASE_URL` is present and otherwise report as skipped.

The official HyperEVM RPC is the default current-state and bounded-log source, but it does not honor historical `eth_call` state and limits `eth_getLogs` to 50-block ranges. The optional `ALCHEMY_API_KEY` provides a recent-state/log fallback, but live probing showed it is not archival. OnFinality's anonymous public archive works for sparse historical proof calls but rate-limits complete discovery; set a free `ONFINALITY_API_KEY` to run `--rpc archive`. Provider roles are assigned from live capability evidence rather than marketing claims.

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
