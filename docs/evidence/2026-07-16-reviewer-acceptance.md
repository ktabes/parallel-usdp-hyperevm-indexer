# StableWatch reviewer acceptance evidence — 2026-07-16

## Acceptance target

- Public deployment:
  `https://content-spirit-production-5efa.up.railway.app`
- Reviewer command: `npm run reviewer:proof`
- Proof timestamp: `2026-07-16T13:32:34.420Z`
- Proof result: `pass`

The reviewer command uses only public HTTP endpoints. It does not require an
RPC key, database URL, Railway access, or wallet.

## Public acceptance results

| Gate                        | Result | Evidence                                                                                  |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Service identity and health | Pass   | `parallel-usdp-hyperevm-indexer`; HTTP status `ok`                                        |
| Global USDp supply          | Pass   | 24/24 chains; no missing, stale, or failed components; all component metadata verified    |
| Base lifetime analytics     | Pass   | Complete USDp+sUSDp coverage from registered deployment boundaries                        |
| StableWatch projection      | Pass   | `parallel-stablewatch-asset-v1`; global USDp metric renderable; chain breakdown populated |

The accepted aligned supply snapshot was captured at
`2026-07-16T13:32:11.206Z`:

- candidate total supply: `2002447001272243447105794` base units;
- accounting status: `candidate`;
- included chains: 24 of 24;
- component timestamp skew: 1,735 seconds, inside the configured 1,800-second
  alignment window;
- missing, stale, and failed chain IDs: none.

`candidate` is intentional. The snapshot proves aligned contract supply across
all registered deployments; promotion to verified omnichain circulating supply
still requires bridge peer and message-lifecycle reconciliation.

## Base lifetime replay evidence

The public `range=all&chains=base&assets=usdp,susdp` query returned complete
coverage through `2026-07-16T03:14:29.000Z`.

| Metric                         |                               USDp |                      sUSDp |
| ------------------------------ | ---------------------------------: | -------------------------: |
| Transfer count                 |                            129,550 |                         11 |
| Transfer volume, base units    | 26,878,931,865,830,441,382,036,182 | 53,728,306,915,538,115,636 |
| Unique participants            |                                937 |                         26 |
| New holders                    |                                936 |                         26 |
| Active holders at coverage end |                                486 |                         12 |

The same range includes 42 sUSDp deposits and 23 withdrawals, with deposited,
withdrawn, and net native vault flows kept as exact integers. All-time YPO
remains unavailable because a contiguous all-time interval proof does not yet
exist; it is not synthesized from the current APY.

## Repository verification

`npm run check` passed on 2026-07-16:

- secret scan: pass;
- Prettier check: pass;
- ESLint: pass;
- TypeScript: pass;
- tests: 114 passed, 2 environment-gated tests skipped;
- Next.js production build: pass;
- production build routes include `/api/analytics/usdp-supply`,
  `/api/analytics/range`, and
  `/api/v1/stablewatch/assets/parallel-usdp-susdp`.

## Historical-lane boundary at acceptance time

These asynchronous coverage jobs are not prerequisites for the four public
acceptance gates above, and their unfinished ranges are not represented as
complete:

- HyperEVM seven-day history was healthy on its official public fallback at
  durable next block `40519689`, with fixed completion checkpoint `40572941`.
- Ethereum lifetime history resumed from its durable checkpoint after a dRPC
  free-tier timeout and proved renewed advancement to next block `23261007`.
- Sonic and Avalanche lifetime runs remain sequenced after Ethereum.

The backfill guardian continues to monitor these lanes, preserves completed
coverage, and restarts only from durable checkpoints when a provider failure is
terminal.

## Reproduction

```bash
npm ci
npm run reviewer:proof
npm run check
```

See `docs/reviewer-runbook.md` for the five-minute public walkthrough and
claim-to-code traceability map.
