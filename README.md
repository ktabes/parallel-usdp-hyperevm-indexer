# Parallel USDp + sUSDp Cross-Chain Indexer

An independent, auditable indexer and analytics surface for Parallel V3 USDp and sUSDp as cross-chain assets. The shareable build is designed to produce StableWatch-compatible global metrics and chain breakdowns while making every number traceable to finalized blocks, source logs, contract reads, a metric definition, and reconciliation evidence.

## Current status

Current-state adapters are live for all five official sUSDp vault chains. The historical pipeline now supports chain-aware decoding, aligned UTC range planning, resumable log ingestion, boundary snapshots, flows, and candidate YPO for Ethereum, Base, Sonic, HyperEVM, and Avalanche. Historical values remain unavailable until the relevant range is fully backfilled and independently reconciled; global USDp supply remains partial until all 24 deployments and bridge accounting are verified.

## Product boundary

- Canonical Parallel V3 USDp and sUSDp asset scope, with per-chain components.
- USDp deployment coverage target: all 24 chains published by Parallel.
- sUSDp savings coverage target: Ethereum, Base, Sonic, HyperEVM, and Avalanche.
- HyperEVM remains the live first adapter while the other chains are added.
- Seven finalized days for the initial historical window.
- External lending markets are out of the MVP.
- Borrow, repay, and liquidation metrics are not applicable at the native issuer/savings layer.
- Yield Paid Out is the centerpiece; unsupported 30d, 90d, and all-time windows stay unavailable until fully indexed and reconciled.
- Global results expose expected, included, missing, stale, and unreconciled chains; partial data is never presented as complete.

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
npm run cli -- derive-flows --from-block FROM --to-block TO
npm run cli -- snapshot
npm run cli -- snapshot --block FINALIZED_BLOCK
npm run cli -- snapshot-all
npm run cli -- history-plan --days 7
npm run cli -- history-boundaries --days 7
npm run cli -- history-backfill --chain base --days 7
npm run cli -- history-backfill --chain ethereum --days 7 --log-rpc-url LOG_RPC_URL
npm run cli -- history-backfill --chain hyperevm --days 7 --window-end UNIX_TIMESTAMP --log-rpc-url LOG_RPC_URL
npm run worker:hyperevm-history
npm run cli -- history-reconcile --chains base,sonic,avalanche
npm run cli -- lifetime-plan --chains ethereum,base,sonic,avalanche
npm run cli -- lifetime-backfill --chain base
npm run cli -- lifetime-backfill --chain ethereum --log-rpc-url https://eth.drpc.org
npm run cli -- history
npm run cli -- calculate-yield --from-block START --to-block END
npm run cli -- state
npm run cli -- yield
npm run cli -- rates
npm run cli -- price
npm run cli -- global
npm run test:unit
npm run test:fixtures
npm run test:integration
npm run test:network
```

`derive-flows` builds candidate hourly/daily native-flow aggregates and seven-day deposit/withdraw participant counts from normalized events. It returns `unavailable` and writes nothing unless `verify-coverage` proves the entire requested range. Transfer logs remain linked evidence and are deliberately excluded from authoritative Deposit, Withdraw, Swap, and Redeemed flow totals.

`snapshot` captures the original HyperEVM contract state and DIA price evidence at a finalized block. `snapshot-all` captures finalized current state for every configured official sUSDp chain, persists chain token/vault evidence, and writes a component-linked global savings snapshot. `history-plan` resolves independent chain blocks onto one UTC window without writing. `history-boundaries` proves both pinned historical state reads before log spending begins. `history-backfill` then uses the same immutable log, checkpoint, coverage, flow, and YPO pipeline for one or more selected savings chains; it is deliberately manual and resumable. `calculate-yield` retains the original HyperEVM-only command. The read-only analytics API is available at `/api/analytics/state`, `/api/analytics/yield`, `/api/analytics/rates`, `/api/analytics/price`, `/api/analytics/global`, and `/api/analytics/history`; missing, stale, partial, or unreconciled data remains explicit rather than being synthesized. The public inspection dashboard is served at `/`, and the versioned StableWatch-oriented integration contract is served at `/api/v1/stablewatch/assets/parallel-usdp-susdp`.

Network tests are opt-in and require `RUN_NETWORK_TESTS=1` plus a real `HYPEREVM_RPC_URL`. Integration tests run when `TEST_DATABASE_URL` is present and otherwise report as skipped.

The official HyperEVM RPC is the default seven-day log source. It limits `eth_getLogs` to 50-block ranges and approximately 100 requests per minute, so the initial week is a long, resumable one-time job rather than a deployment startup task. Ingestion defaults to one request start every 1,500 ms, applies jittered backoff, retries rate limits indefinitely, and commits each successful range before continuing. The optional `ALCHEMY_API_KEY` provides recent-state reads but is not treated as historical. OnFinality remains optional for strict archive certification. Provider roles are assigned from live capability evidence rather than marketing claims.

For the pinned HyperEVM history window, prefer the dedicated
`worker:hyperevm-history` process over launching the CLI inside the web
service. Set `HYPEREVM_HISTORY_WINDOW_END` to the immutable Unix timestamp and
optionally set `HYPEREVM_HISTORY_PRIMARY_RPC_URL` to a private historical
provider. The worker keeps state reads and checkpoint-hash verification on
`HYPEREVM_HISTORY_STATE_RPC_URL`, recognizes a provider's daily request quota
as distinct from ordinary throttling, and resumes from the same PostgreSQL
checkpoint through `HYPEREVM_HISTORY_FALLBACK_RPC_URL`. The fallback defaults
to the official public RPC with 50-block chunks and a 1,500 ms request-start
interval. Provider URLs are never included in worker progress logs. A
PostgreSQL advisory lock prevents the web process, CLI, and dedicated worker
from scanning the same chain/scope together.

For Railway, create a worker service from the same repository with start
command `npm run worker:hyperevm-history`. Give it `DATABASE_URL`,
`HYPEREVM_RPC_URL`, and the `HYPEREVM_HISTORY_*` variables, but do not enable
`RUN_SEVEN_DAY_BACKFILL` on the web service. A successful bounded worker exits
after flow derivation and YPO reconciliation; a restart safely no-ops from the
completed checkpoint.

On Railway, set `RUN_SEVEN_DAY_BACKFILL=1` to start the worker beside the web service. A PostgreSQL advisory lock prevents duplicate workers, recoverable RPC failures restart from the durable checkpoint, and `/api/indexer/status` exposes the checkpoint, stored row counts, and recent runs. `RPC_REQUEST_INTERVAL_MS` can tune the pace, but the conservative `1500` default is recommended for the public endpoint. Set the flag back to `0` after the initial week completes if continuous catch-up is not wanted.

For cross-chain current state, configure `ETHEREUM_RPC_URL`, `BASE_RPC_URL`, `SONIC_RPC_URL`, and `AVALANCHE_RPC_URL` alongside the existing `HYPEREVM_RPC_URL`, then set `RUN_MULTICHAIN_SNAPSHOTS=1`. Ethereum, Base, Sonic, and Avalanche use their RPC `finalized` block tag; HyperEVM retains its configured confirmation lag. The worker uses one Multicall state read per non-HyperEVM chain, records missing or failed RPCs as partial coverage, and never takes down the web service because one chain is unavailable. `GLOBAL_SNAPSHOT_MAX_AGE_SECONDS` defaults to `3600` so provider-specific Ethereum/Base L1 finality delay is not mistaken for a stopped adapter; exact component block ages remain visible.

Cross-chain historical backfills are never started by web-service deployment. Plan the aligned range first, capture both historical boundaries, and then run one bounded chain backfill. Savings history requests only the sUSDp vault logs needed for Deposit, Withdraw, Accrued, rate, pause, and share-transfer evidence; high-volume USDp token transfers belong to the later standalone USDp distribution/bridge lane. `--log-rpc-url` can assign a separate historical log provider after the configured chain RPC proves the pinned state boundaries. `--window-end` pins the common Unix end timestamp so a later invocation resumes the same scope instead of silently planning a moving seven-day window. The default chain set for planning is Ethereum, Base, Sonic, and Avalanche; add `--chain hyperevm` explicitly when its historical provider budget is available. Candidate chain YPO is stored with exact component provenance but is excluded from a global YPO total until independent rate reconciliation promotes it to verified.

`lifetime-plan` and `lifetime-backfill` are the standalone dual-asset activity lane. Each chain begins at the earlier verified deployment block for USDp or sUSDp and ingests both contracts through a finalized head. Deployment boundaries and their evidence sources are stored in `asset_deployments`; chain-specific `parallel-assets-*-lifetime-v1` checkpoints make the work resumable and prevent it from changing seven-day history coverage. Run only one lifetime chain worker at a time. It may run beside the isolated HyperEVM history worker because the scopes, chain IDs, providers, and advisory locks are independent. Base, Sonic, and Avalanche use their configured public RPCs; Ethereum may use the tested dRPC log endpoint shown above without changing its configured state provider.

## Phase gates

1. Foundation and guardrails.
2. Pinned protocol discovery and executable metric specification.
3. Idempotent finalized raw-log ingestion and seven-day backfill.
4. Economic events, flows, participants, and optional lifetime holder ledger.
5. HyperEVM snapshots, prices, YPO, and live projection foundation.
6. Ethereum, Base, Sonic, and Avalanche state adapters and global sUSDp metrics.
7. Per-chain historical YPO/flows and aligned cross-chain aggregation.
8. Remaining USDp distribution chains and verified bridge accounting.
9. Reconciliation, owner review, and the public inspection dashboard.
10. Railway deployment and StableWatch integration handoff.

See [methodology](docs/methodology.md), [metric contract](docs/metric-contract.md), [schema notes](docs/schema.md), the [StableWatch handoff](docs/stablewatch-integration-handoff.md), the [24-chain bridge accounting research](docs/research/parallel-usdp-24-chain-bridge-accounting-2026-07-16.md), and the [cross-chain scope decision](docs/decisions/0002-cross-chain-asset-scope.md).
