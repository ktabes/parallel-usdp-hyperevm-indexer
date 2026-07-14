# Metric contract

Status: **draft until Phase 1 onchain discovery is approved**.

| Metric                          | Unit                   | Canonical source                             | MVP status                                     |
| ------------------------------- | ---------------------- | -------------------------------------------- | ---------------------------------------------- |
| USDp total supply               | USDp base units        | `USDp.totalSupply()` at finalized block      | Required                                       |
| USDp market value               | USD atomic units       | supply × timestamped USDp price              | Required with attributed price                 |
| sUSDp total assets              | USDp base units        | `sUSDp.totalAssets()` at finalized block     | Required                                       |
| sUSDp TVL                       | USD atomic units       | total assets × timestamped USDp price        | Required with attributed price                 |
| sUSDp share price               | USDp/share base units  | `convertToAssets(10^shareDecimals)`          | Required                                       |
| Native YPO                      | USDp base units        | accrued events + pending end − pending start | Required                                       |
| USD YPO                         | USD atomic units       | native YPO × timestamped USDp prices         | Estimate unless historical pricing is proven   |
| Savings rate                    | BASE_27 raw units      | onchain `rate` and `RateUpdated` history     | Required                                       |
| Realized trailing APY           | fixed-point percentage | reconciled share-price observations          | Required for indexed windows                   |
| USDp issued/burned/redeemed     | USDp base units        | verified Parallelizer economic events        | Required after Phase 1                         |
| sUSDp deposit/withdraw/net flow | USDp base units        | ERC-4626 `Deposit`/`Withdraw`                | Required                                       |
| Active holders                  | address count          | complete replayed transfer ledger            | Unavailable until lifetime history is complete |

## Canonical native YPO

At finalized block `b`:

```text
pending_yield(b) = sUSDp.totalAssets(b) - USDp.balanceOf(sUSDp, b)
```

For `(start, end]`:

```text
native_ypo_usdp =
  sum(Accrued.interest in (start, end])
  + pending_yield(end)
  - pending_yield(start)
```

The Phase 4 gate requires an independent rate-segment integration check before this metric can be displayed publicly.

## Non-applicable metrics

Borrowers, borrows, repays, and liquidations are not native Parallel issuer/savings metrics. They must be omitted or labeled not applicable, never shown as zero. Venue-level lending activity requires a separate protocol-specific indexer.
