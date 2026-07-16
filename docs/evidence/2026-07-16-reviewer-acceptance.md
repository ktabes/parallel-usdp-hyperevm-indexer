# StableWatch reviewer acceptance evidence — 2026-07-16

## Acceptance target

- Public deployment: <https://content-spirit-production-5efa.up.railway.app>
- Reviewer command: `npm run reviewer:proof`
- Evidence cutoff: `2026-07-16T16:26:03Z`
- Lifetime history: complete on Ethereum, Base, Sonic, and Avalanche
- Aligned seven-day YPO: complete and verified on all five sUSDp chains

The reviewer command uses public HTTP endpoints only. It requires no RPC key,
database URL, Railway access, or wallet.

## Frozen public acceptance results

| Gate                               | Result | Evidence                                                                                      |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Service identity and health        | Pass   | `parallel-usdp-hyperevm-indexer`; HTTP status `ok`                                            |
| Global USDp supply                 | Pass   | Accepted 24/24 finalized snapshot; no missing, stale, or failed components; metadata verified |
| Four-chain lifetime analytics      | Pass   | Eight of eight USDp+sUSDp history components published from deployment boundaries             |
| Five-chain aligned seven-day YPO   | Pass   | Five verified components; no missing/unreconciled chains; zero reconciliation deltas          |
| StableWatch integration projection | Pass   | Versioned current state, lifetime detail, YPO, and trust data renderable                      |

The accepted 24-chain USDp snapshot at `2026-07-16T16:06:44.303Z` reported
`2002447001272243447105794` base units, 24 of 24 components, and 1,610 seconds
of component skew inside the 1,800-second alignment limit. The value remains
an accounting `candidate`: it proves aligned contract supply, while promotion
to verified omnichain circulating supply still requires LayerZero peer and
message-lifecycle reconciliation.

## Lifetime USDp and sUSDp evidence

The public four-chain all-time query returned `complete`, with eight of eight
asset components and no missing components. Its common presentation cutoff is
`2026-07-16T03:09:11.000Z`; each row retains its own deployment boundary and
full coverage end.

| Chain     | USDp transfers | USDp holders | sUSDp transfers | sUSDp holders | Deposits | Withdrawals |
| --------- | -------------: | -----------: | --------------: | ------------: | -------: | ----------: |
| Ethereum  |             81 |           29 |               2 |             6 |       12 |           7 |
| Base      |        129,550 |          486 |              11 |            12 |       42 |          23 |
| Sonic     |         43,279 |           73 |               6 |             2 |       10 |           9 |
| Avalanche |          1,721 |           55 |             877 |            22 |      192 |         135 |

Global lifetime activity at the common cutoff:

- USDp transfer count: `174631`; exact transfer volume:
  `61376910100390270849503220` base units.
- sUSDp transfer count: `896`; exact transfer volume:
  `17970681657485041655817266` base units.
- Savings deposits: `256`; withdrawals: `174`; exact net flow:
  `199950392208975098359901` USDp base units.
- Participant totals are explicitly chain-summed; cross-chain address identity
  is not assumed.

## Aligned five-chain YPO evidence

The pinned global window is `2026-07-09T00:59:17Z` through
`2026-07-16T00:59:17Z`. Each chain uses the first block at or after each UTC
boundary. The non-HyperEVM intervals reuse already gap-free lifetime coverage
while preserving the original run IDs and scan timestamps; no block-log range
was rescanned. Exact historical boundary state was read independently.

| Chain     | From block |   To block | Verified native YPO, base units |
| --------- | ---------: | ---------: | ------------------------------: |
| Ethereum  | 25,491,593 | 25,541,796 |             5241142997710670158 |
| Base      | 48,384,705 | 48,687,105 |              484775308797290647 |
| Sonic     | 75,626,200 | 76,009,370 |                               0 |
| HyperEVM  | 39,958,147 | 40,572,940 |            76806891584203713365 |
| Avalanche | 89,837,334 | 90,415,626 |           484985520117374720982 |

Global native YPO is `567518330008086395152` base units. All five independent
rate integrations matched their stored start assets, end assets, and native
YPO exactly: every start delta, end delta, and YPO delta is `0`. The production
history API reports five included chains, no missing chains, no unreconciled
chains, and `coverageStatus: complete`.

## Publication behavior

The dashboard reads persisted checkpoints, lifetime activity and holder rows,
vault flows, exact snapshots, and reconciled YPO directly from PostgreSQL. It
refreshes every 60 seconds. Completed backfill data therefore publishes without
a frontend deploy or manual variable change. HyperEVM remains explicitly
identified as a fixed seven-day history; the other four chains expose lifetime
activity plus the aligned seven-day YPO interval.

## Reproduction

```bash
npm ci
npm run reviewer:proof
npm run check
```

See `docs/reviewer-runbook.md` for the public walkthrough and claim-to-code map.
