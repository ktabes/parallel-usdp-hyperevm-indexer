# Metric contract

Status: **cross-chain candidate**. HyperEVM is the first verified chain adapter; global metrics remain partial or unavailable until their required chain components pass coverage and reconciliation gates.

## Asset and chain scopes

- `chain`: one contract deployment at one finalized chain block.
- `global`: an aligned set of finalized chain snapshots for the canonical USDp or sUSDp asset.
- Every global response identifies expected, included, stale, missing, and unreconciled chains. Partial coverage is never presented as complete.
- USDp is currently registered across the 24 deployments published by Parallel. sUSDp is registered on Ethereum, Base, Sonic, HyperEVM, and Avalanche.
- HyperEVM history remains valid chain evidence and becomes one component of the global result.

| Metric                          | Unit                   | Canonical source                                      | Scope and status                                 |
| ------------------------------- | ---------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| USDp chain total supply         | USDp base units        | `USDp.totalSupply()` at finalized block               | Chain; required                                  |
| USDp global total supply        | USDp base units        | aligned sum of verified chain supplies                | Global; candidate until bridge proof is complete |
| USDp global market value        | USD atomic units       | global supply × attributed USDp price                 | Global; required with complete coverage          |
| sUSDp chain total assets        | USDp base units        | chain `sUSDp.totalAssets()` at finalized block        | Chain; required on five savings chains           |
| sUSDp global TVL                | USD atomic units       | sum of chain total assets × timestamped USDp prices   | Global; required with complete savings coverage  |
| sUSDp chain share price         | USDp/share base units  | `convertToAssets(10^shareDecimals)`                   | Chain; required                                  |
| Chain native YPO                | USDp base units        | accrued events + pending end − pending start          | Chain; required for reconciled windows           |
| Global native YPO               | USDp base units        | aligned sum of reconciled chain-native YPO            | Global; unavailable on partial windows           |
| Savings rate/APY                | fixed-point percentage | chain rate state and reconciled share-price history   | Chain; required                                  |
| TVL-weighted sUSDp APY          | fixed-point percentage | `sum(chain TVL × chain APY) / sum(chain TVL)`         | Global; never a sum of rates                     |
| USDp issued/burned/redeemed     | USDp base units        | verified chain Parallelizer economic events           | Chain and aligned global sum                     |
| USDp bridge inflow/outflow      | USDp base units        | verified bridge events                                | Chain; separate from issuer mint/burn            |
| sUSDp deposit/withdraw/net flow | USDp base units        | chain ERC-4626 `Deposit`/`Withdraw`                   | Chain and aligned global sum                     |
| Active holders                  | address count          | complete per-chain replay with cross-chain dedup rule | Unavailable until lifetime history is complete   |

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
