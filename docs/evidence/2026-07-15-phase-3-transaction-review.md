# Phase 3 transaction review — 2026-07-15

## Review boundary

This review uses the production database and HyperEVMScan. It does not claim that the entire seven-day MVP range is complete.

- Completed contiguous production slice: blocks `39928814..40176978`.
- Coverage rows: `49,633`.
- Coverage gaps in that slice: `0`.
- Normalized source events: `125`.
- Classified economic events: `125`.
- Candidate aggregate rows: `15` hourly/daily rows.
- Manifest: `hyperevm-usdp-candidate-v1`.
- Calculation: `parallel-usdp-flows-v1-candidate`.

The completed slice contains 23 authoritative USDp issuance `Swap` events, one authoritative collateral-burn `Swap`, and 101 linked USDp `Transfer` events. It contains no sUSDp deposits, withdrawals, accruals, or Parallelizer redemptions. Those absent event types remain unverified until a range containing them is indexed.

## Reviewed transactions

### 1. USDp issuance through a multi-token route

- Transaction: [`0xc882...fd0ee`](https://hyperevmscan.io/tx/0xc8821149c8848acae79455e773406c9e821d301fc9520ba87905f20a786fd0ee)
- Block: `40020245`.
- Indexed `Swap`: USDe in, USDp out, `1000092550713675285343` base units.
- Explorer evidence: successful transaction; zero address minted `1,000.092550713675285343` USDp.
- Accounting: exactly one `usdp_issued` event for the `Swap.amountOut`. The accompanying USDp `Transfer` remains linked evidence and is not counted again.
- Note: a later USDp transfer in the route is two base units smaller. That downstream transfer does not redefine Parallelizer issuance.

### 2. USDp issuance with an internally reverted route branch

- Transaction: [`0x7074...3746a`](https://hyperevmscan.io/tx/0x7074e70c249632cadfb0a7c3d6b4f8a419000cee0183def44348f3c449f3746a)
- Block: `40117378`.
- Indexed `Swap`: USDe in, USDp out, `616571488490308496227` base units.
- Explorer evidence: outer transaction succeeded and the zero-address USDp mint is exactly `616.571488490308496227`; the explorer also flags an internal reverted branch.
- Accounting: exactly one `usdp_issued` event. The successful receipt logs are authoritative even though a nested route branch reverted.

### 3. USDp issuance through a larger ten-transfer route

- Transaction: [`0x7e39...453d3`](https://hyperevmscan.io/tx/0x7e3999cfb32ec8e6da0f1e2f70e31c0d343c395804036591dd0e7ef3a28453d3)
- Block: `40169034`.
- Indexed `Swap`: USDe in, USDp out, `960894663140789614469` base units.
- Explorer evidence: successful transaction with ten ERC-20 transfers; the relevant USDe transfer and USDp mint are `960.894663140789614469`.
- Accounting: exactly one `usdp_issued` event. The numerous router transfers do not increase the native issuance total.

### 4. USDp burned for collateral

- Transaction: [`0x35fa...57a0c`](https://hyperevmscan.io/tx/0x35fa9a89e5cc676cbe5f73bf3e1e1cd811c38fa1be6bedc876e225e380957a0c)
- Block: `40025085`.
- Indexed `Swap`: USDp in, collateral out, `39997823029568887994477` USDp base units.
- Explorer evidence: successful transaction; `39,997.823029568887994477` USDp moves to the zero address.
- Accounting: exactly one `usdp_burned_for_collateral` event using `Swap.amountIn`. The burn `Transfer` is evidence, not a second economic flow.

### 5. sUSDp deployment deposit canary

- Transaction: [`0x5564...8d40b`](https://hyperevmscan.io/tx/0x55649f4f27ce66b3c335347fe1b7fdf4ecd1eccbb1d3b134d6cf789e19a8d40b)
- Block: `5119222`, outside the current seven-day slice.
- Indexed sequence: 1 USDp transferred into sUSDp, 1 sUSDp share minted, then `Deposit(assets=1e18, shares=1e18)`.
- Explorer evidence: successful contract-creation transaction showing the 1 USDp transfer and 1 sUSDp mint.
- Accounting: one `susdp_deposited` event when this canary range is derived. The two ERC-20 transfers remain linked evidence and are excluded from deposit flow.

## Partial-slice aggregate result

| UTC day    | Metric                     | Events |          Exact base units |
| ---------- | -------------------------- | -----: | ------------------------: |
| 2026-07-09 | USDp issued                |      7 | `12764258285938770970227` |
| 2026-07-09 | USDp burned for collateral |      1 | `39997823029568887994477` |
| 2026-07-10 | USDp issued                |     10 | `10524522921436499057857` |
| 2026-07-11 | USDp issued                |      6 |  `5640598130714583006399` |

Total candidate USDp issuance in the completed slice is `28929379338089853034483` base units across 23 events. The only candidate burn is `39997823029568887994477` base units. Deposit and withdrawal participant counts are correctly zero for this slice because no such events were indexed in it.

## Gate result

The reviewed classifications match the explorer evidence and demonstrate that the authoritative-event policy prevents economic double counting in complex routed transactions. Phase 3 remains a candidate rather than approved because:

1. the full seven-day range is incomplete;
2. withdrawal, accrual, and redemption examples are not present in the indexed sample;
3. the manifest still requires owner approval and final archive-backed discovery evidence.
