# Evidence record: Phase 2 production canary

- Date/time: 2026-07-14 21:59 UTC
- Git commit: repository commit containing this record
- Railway deployment: `c29527b6-545b-4623-b9ae-b9a641567288`
- Chain: HyperEVM `999`
- Provider: official public HyperEVM RPC
- Database: Railway PostgreSQL through the production migration
- Phase status: canary passed; complete seven-day coverage pending

## Schema and deterministic gate

Migration `0001_bent_lilandra.sql` added:

- exact inclusive `indexer_coverage` ranges with a unique scope/range key;
- rebuildable `protocol_events` linked one-to-one to immutable `raw_logs`.

`npm run check` passed the secret scan, formatting, ESLint, strict TypeScript, 34 deterministic tests, and the Next.js production build. Two opt-in database/network tests were skipped by the default local gate.

## Real historical canary

Range `5119222..5119271`, scope `phase2-canary-deployment`:

- run `7a71e1ce-bbc0-49d6-aa9c-753b9e776cc6` completed;
- 50 blocks covered in one provider-compatible chunk;
- 6 raw logs fetched and inserted;
- 3 recognized protocol events decoded;
- 0 known-topic decode failures, retries, or chunk reductions.

The remaining three raw logs are retained as immutable evidence but were not assigned one of the Phase 1 economic event types. They are not counted as decode failures.

## Idempotency and recovery

- Scope `phase2-canary-overlap` rescanned the exact range. It fetched the same 6 logs, inserted 0, and classified all 6 as duplicates.
- Scope `phase2-canary-resume` first covered `5119222..5119246`, then resumed from checkpoint at `5119247` through `5119271`.
- Coverage verification merged the two committed rows and returned `complete: true` with no gaps for `5119222..5119271`.
- A third identical resume request returned `status: noop` with zero chunks, logs, or mutations.
- Each final chunk stored a finalized block-hash anchor; resume verified the stored anchor before requesting new logs.

## Production worker boundary

The full week uses scope `parallel-usdp-susdp-seven-day-v1`. It runs beside the Railway web service only when `RUN_SEVEN_DAY_BACKFILL=1`, and a PostgreSQL advisory lock prevents duplicate workers. `/api/indexer/status` exposes the checkpoint, totals, and recent runs without exposing provider or database credentials.

Phase 2 is not complete until the resolved seven-day range has gap-free coverage and unexplained known-topic decode failures remain zero. Phase 1 archive certification remains a separate candidate limitation and is not silently upgraded by the log backfill.
